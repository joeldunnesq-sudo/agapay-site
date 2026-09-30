import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { hostedRecoveryBindings } from './lib/recovery-hosted-bindings.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { initializeLedger } from '../src/accounting/index.js';
import { portabilityFixture, sqliteBinding } from './portability-tests/fixtures.mjs';
import { POLICY_VERSION } from '../src/portability/catalog.js';

const root = fileURLToPath(new URL('../', import.meta.url)).replace(/[\\/]+$/, '');
const built = await build({
  absWorkingDir: root,
  entryPoints: ['scripts/fixtures/recovery-runtime-worker.js'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  conditions: ['workerd', 'worker', 'browser'],
  external: ['node:*'],
  write: false,
});
const token = crypto.randomUUID();
const options = convertV4MiniflareOptions({
  modules: true,
  script: built.outputFiles[0].text,
  compatibilityDate: '2026-09-01',
  compatibilityFlags: ['nodejs_compat'],
  host: '127.0.0.1',
  port: 0,
  cf: false,
  d1Databases: ['AGAPAY_DB', 'DRILL_BOOKS'],
  r2Buckets: ['PARISH_EXPORTS', 'PARISH_CLOSURE_LEDGER', 'PARISH_RETAINED_DATA', 'SACRAMENT_DOCUMENTS'],
  kvNamespaces: ['AGAPAY_REGISTRATIONS'],
  bindings: {
    RECOVERY_LOCAL_DRILL: 'true',
    AGAPAY_ENVIRONMENT: 'test',
    ACCOUNTING_DATABASE_BINDINGS: JSON.stringify({ 'test-books-a': 'DRILL_BOOKS' }),
    DRILL_TOKEN: token,
    PARISH_RECOVERY_ENABLED: 'true',
    PARISH_PORTABILITY_ENABLED: 'true',
    PARISH_STORAGE_GUARDS_ENABLED: 'true',
    PARISH_SUPPRESSION_AUTHORITY: 'test-ledger',
  },
  outboundService() {
    throw new Error('Network egress forbidden');
  },
});
options.telemetry = { enabled: false };
const hosted = process.env.RECOVERY_HOSTED_DRILL_CONFIG;
const mf = hosted ? await hostedRecoveryBindings(hosted) : new Miniflare(options),
  f = await portabilityFixture({ barriers: false });
const quoted = (s) => '"' + s.replaceAll('"', '""') + '"';
async function call(body, expectedFailure) {
  for (let attempt = 0; ; attempt++) {
    const r = await mf.dispatchFetch('http://local.test/', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await r.json();
    if (
      hosted &&
      attempt < 8 &&
      ['legacy_not_converged', 'recovery_legacy_converging', 'recovery_legacy_changed'].includes(payload.code)
    ) {
      console.log('Waiting for isolated KV convergence; recovery remains fenced.');
      await delay(15000);
      continue;
    }
    if (expectedFailure) {
      assert.equal(r.status, 500);
      assert.match(payload.error, expectedFailure);
      return payload;
    }
    assert.equal(r.status, 200, JSON.stringify(payload));
    assert.ok(Number(r.headers.get('x-drill-operations')) <= 800, 'Each phase must leave provider headroom');
    return payload;
  }
}
async function finish(op) {
  for (let i = 0; i < 20 && op.status !== 'completed'; i++) op = await call({ action: 'advance', id: op.id });
  assert.equal(op.status, 'completed');
  return op;
}
try {
  // The historical baseline omits four migrations within 0111-0118. Apply
  // those explicit gaps as well as every later migration.
  // Only synthetic fixture rows are copied; no production data is used.
  const full = new DatabaseSync(':memory:');
  full.exec(readFileSync(new URL('./fixtures/portability-central-schema.sql', import.meta.url), 'utf8'));
  for (const name of readdirSync(new URL('../migrations/', import.meta.url))
    .filter(
      (n) => /^\d{4}_.*\.sql$/.test(n) && (n >= '0119' || ['0111', '0112', '0114', '0115'].includes(n.slice(0, 4)))
    )
    .sort())
    full.exec(readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'));
  full.exec('BEGIN; PRAGMA defer_foreign_keys=ON');
  for (const { name } of f.db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all()) {
    for (const row of f.db.prepare('SELECT * FROM ' + quoted(name)).all()) {
      const keys = Object.keys(row);
      full
        .prepare(
          'INSERT INTO ' +
            quoted(name) +
            '(' +
            keys.map(quoted).join(',') +
            ') VALUES(' +
            keys.map(() => '?').join(',') +
            ')'
        )
        .run(...Object.values(row));
    }
  }
  full.exec('COMMIT');
  f.db.close();
  f.db = full;
  f.db.exec(
    "INSERT INTO accounting_entities(id,parish_id) VALUES('entity-a','parish-a'); INSERT INTO accounting_databases(id,accounting_entity_id,environment,database_identifier) VALUES('books-a','entity-a','test','test-books-a');"
  );
  const bookFixture = new DatabaseSync(':memory:');
  const migrationDir = new URL('../accounting-migrations/', import.meta.url);
  for (const name of readdirSync(migrationDir)
    .filter((n) => /^\d+.*\.sql$/.test(n))
    .sort()) {
    bookFixture.exec(readFileSync(new URL(name, migrationDir), 'utf8'));
    if (name === '0002_core_ledger.sql')
      await initializeLedger(sqliteBinding(bookFixture), {
        actor: { id: 'setup', type: 'platform_user', capabilities: ['accounting.configure'] },
        date: new Date('2026-09-30T12:00:00Z'),
      });
  }
  bookFixture.exec("INSERT INTO accounting_database_metadata(key,value) VALUES('parish_id','parish-a')");
  const nativeBooks = await mf.getD1Database('DRILL_BOOKS');
  for (const { sql } of bookFixture
    .prepare(
      "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,name"
    )
    .all())
    await nativeBooks.prepare(sql).run();
  const bookSeeds = [nativeBooks.prepare('PRAGMA defer_foreign_keys=ON')];
  for (const { name } of bookFixture
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all())
    for (const row of bookFixture.prepare('SELECT * FROM ' + quoted(name)).all())
      bookSeeds.push(
        nativeBooks
          .prepare(
            'INSERT INTO ' +
              quoted(name) +
              '(' +
              Object.keys(row).map(quoted).join(',') +
              ') VALUES(' +
              Object.keys(row)
                .map(() => '?')
                .join(',') +
              ')'
          )
          .bind(...Object.values(row))
      );
  await nativeBooks.batch(bookSeeds);
  bookFixture.close();
  const db = await mf.getD1Database('AGAPAY_DB');
  const schema = f.db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,name"
    )
    .all();
  for (let i = 0; i < schema.length; i += 40) await db.batch(schema.slice(i, i + 40).map((row) => db.prepare(row.sql)));
  const seed = [db.prepare('PRAGMA defer_foreign_keys=ON')];
  for (const { name } of f.db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all())
    for (const row of f.db.prepare('SELECT * FROM ' + quoted(name)).all())
      seed.push(
        db
          .prepare(
            `INSERT INTO ${quoted(name)}(${Object.keys(row).map(quoted).join(',')}) VALUES(${Object.keys(row)
              .map(() => '?')
              .join(',')})`
          )
          .bind(...Object.values(row))
      );
  await db.batch(seed);
  await db
    .prepare(
      "INSERT INTO operational_job_heartbeats(job_name,cron,status,run_id,started_at) VALUES('drill','synthetic','completed','before','2026-09-30')"
    )
    .run();
  const documents = await mf.getR2Bucket('SACRAMENT_DOCUMENTS');
  const legacy = await mf.getKVNamespace('AGAPAY_REGISTRATIONS');
  async function legacyWrite(parish, note) {
    const key = 'parish-feature-requests:' + parish;
    const value = JSON.stringify({ parishId: parish, note });
    await db
      .prepare(
        "INSERT INTO parish_portability_legacy_keys(object_key,parish_id,source_hash,state,updated_at) VALUES(?,?,?,'pending',?) ON CONFLICT(object_key) DO UPDATE SET source_hash=excluded.source_hash,state='pending',updated_at=excluded.updated_at"
      )
      .bind(key, parish, createHash('sha256').update(value).digest('hex'), Date.now())
      .run();
    await legacy.put(key, value);
    await db.prepare("UPDATE parish_portability_legacy_keys SET state='stored' WHERE object_key=?").bind(key).run();
  }
  for (const parish of ['parish-a', 'parish-b']) {
    const file = await documents.put(parish + '/guide.txt', 'Original guide for ' + parish);
    await db
      .prepare(
        "INSERT INTO parish_portability_objects(binding,object_key,parish_id,disposition,state,etag,updated_at) VALUES('SACRAMENT_DOCUMENTS',?,?,'delete','stored',?,?)"
      )
      .bind(parish + '/guide.txt', parish, file.etag, Date.now())
      .run();
    await legacyWrite(parish, 'Original request');
  }
  await (
    await mf.getR2Bucket('PARISH_CLOSURE_LEDGER')
  ).put('authority.json', JSON.stringify({ id: 'test-ledger', policyVersion: POLICY_VERSION }));
  await finish(
    await call({ action: 'start', input: { kind: 'backup', scope: 'parish', requestKey: crypto.randomUUID() } })
  );
  const point = (await call({ action: 'status' })).snapshots[0];
  await db.prepare("UPDATE operational_job_heartbeats SET run_id='keep-current' WHERE job_name='drill'").run();
  await db.prepare("UPDATE directory_people SET preferred_name='Native D1 mistake' WHERE id='a'").run();
  const changedFile = await documents.put('parish-a/guide.txt', 'Mistaken replacement');
  await db
    .prepare(
      "UPDATE parish_portability_objects SET etag=? WHERE binding='SACRAMENT_DOCUMENTS' AND object_key='parish-a/guide.txt'"
    )
    .bind(changedFile.etag)
    .run();
  await legacyWrite('parish-a', 'Mistaken edit');
  let interrupted = await call({
    action: 'start',
    input: {
      kind: 'restore',
      scope: 'parish',
      snapshotId: point.id,
      confirmation: 'RESTORE PARISH',
      acknowledged: true,
      requestKey: crypto.randomUUID(),
    },
  });
  for (let i = 0; interrupted.phase !== 'restore_files' && i < 20; i++)
    interrupted = await call({ action: 'advance', id: interrupted.id });
  assert.equal(interrupted.phase, 'restore_files');
  await call({ action: 'advance', id: interrupted.id, failFileWrite: true }, /Synthetic interrupted file write/);
  assert.equal(
    (await db.prepare('SELECT status FROM parish_recovery_operations WHERE id=?').bind(interrupted.id).first()).status,
    'paused'
  );
  await assert.rejects(
    db.prepare("UPDATE directory_people SET preferred_name='Blocked write' WHERE id='a'").run(),
    /RECOVERY_WRITE_BLOCKED/
  );
  await finish(await call({ action: 'advance', id: interrupted.id, operation: 'rollback' }));
  assert.equal(
    (await db.prepare("SELECT preferred_name FROM directory_people WHERE id='a'").first()).preferred_name,
    'Native D1 mistake'
  );
  assert.equal(await (await documents.get('parish-a/guide.txt')).text(), 'Mistaken replacement');
  assert.ok((await db.prepare('SELECT COUNT(*) n FROM parish_recovery_retention').first()).n > 0);
  console.log('PASS - interrupted file replacement stays fenced and safety rollback recovers the pre-restore state');
  await finish(
    await call({
      action: 'start',
      input: {
        kind: 'restore',
        scope: 'parish',
        snapshotId: point.id,
        confirmation: 'RESTORE PARISH',
        acknowledged: true,
        requestKey: crypto.randomUUID(),
      },
    })
  );
  assert.equal(
    (await db.prepare("SELECT preferred_name FROM directory_people WHERE id='a'").first()).preferred_name,
    'Alpha'
  );
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM parish_recovery_locks').first()).n, 0);
  assert.equal(
    (await db.prepare("SELECT run_id FROM operational_job_heartbeats WHERE job_name='drill'").first()).run_id,
    'keep-current'
  );
  assert.equal(await (await documents.get('parish-a/guide.txt')).text(), 'Original guide for parish-a');
  assert.equal(await (await documents.get('parish-b/guide.txt')).text(), 'Original guide for parish-b');
  assert.equal(JSON.parse(await legacy.get('parish-feature-requests:parish-a')).note, 'Original request');
  assert.equal(JSON.parse(await legacy.get('parish-feature-requests:parish-b')).note, 'Original request');
  const beforeAccount = await nativeBooks.prepare("SELECT name FROM accounting_accounts WHERE id='acct_1010'").first();
  await finish(
    await call({ action: 'start', input: { kind: 'backup', scope: 'accounting', requestKey: crypto.randomUUID() } })
  );
  const bookPoint = (await call({ action: 'status', scope: 'accounting' })).snapshots[0];
  await nativeBooks.prepare("UPDATE accounting_accounts SET name='Mistaken name' WHERE id='acct_1010'").run();
  await db.prepare("UPDATE directory_people SET preferred_name='Keep parish edit' WHERE id='a'").run();
  await finish(
    await call({
      action: 'start',
      input: {
        kind: 'restore',
        scope: 'accounting',
        snapshotId: bookPoint.id,
        confirmation: 'RESTORE ACCOUNTING',
        acknowledged: true,
        requestKey: crypto.randomUUID(),
      },
    })
  );
  assert.deepEqual(
    await nativeBooks.prepare("SELECT name FROM accounting_accounts WHERE id='acct_1010'").first(),
    beforeAccount
  );
  assert.equal(
    (await db.prepare("SELECT preferred_name FROM directory_people WHERE id='a'").first()).preferred_name,
    'Keep parish edit'
  );
  assert.equal((await nativeBooks.prepare('SELECT COUNT(*) n FROM recovery_lock').first()).n, 0);
  console.log('PASS - native accounting-only restore with all accounting migrations preserves central parish edits');
  console.log(
    'PASS - native workerd D1/R2/KV restoration, sacrament files, other-parish isolation and trigger reinstatement, with isolated synthetic resources'
  );
} finally {
  f.db.close();
  await mf.dispose();
}
