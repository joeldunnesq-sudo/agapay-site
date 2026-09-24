import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { portabilityFixture } from './portability-tests/fixtures.mjs';
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
  d1Databases: ['AGAPAY_DB'],
  r2Buckets: ['PARISH_EXPORTS', 'PARISH_CLOSURE_LEDGER', 'PARISH_RETAINED_DATA'],
  bindings: {
    RECOVERY_LOCAL_DRILL: 'true',
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
const mf = new Miniflare(options),
  f = await portabilityFixture({ barriers: false });
const quoted = (s) => '"' + s.replaceAll('"', '""') + '"';
async function call(body) {
  const r = await mf.dispatchFetch('http://local.test/', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(r.status, 200, await r.clone().text());
  return r.json();
}
async function finish(op) {
  for (let i = 0; i < 20 && op.status !== 'completed'; i++) op = await call({ action: 'advance', id: op.id });
  assert.equal(op.status, 'completed');
  return op;
}
try {
  f.db.exec(readFileSync(new URL('../migrations/0128_parish_recovery.sql', import.meta.url), 'utf8'));
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
  await (
    await mf.getR2Bucket('PARISH_CLOSURE_LEDGER')
  ).put('authority.json', JSON.stringify({ id: 'test-ledger', policyVersion: POLICY_VERSION }));
  await finish(
    await call({ action: 'start', input: { kind: 'backup', scope: 'parish', requestKey: crypto.randomUUID() } })
  );
  const point = (await call({ action: 'status' })).snapshots[0];
  await db.prepare("UPDATE directory_people SET preferred_name='Native D1 mistake' WHERE id='a'").run();
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
  console.log(
    'PASS - native workerd D1/R2 snapshot, transactional restoration and trigger reinstatement, with network egress forbidden'
  );
} finally {
  f.db.close();
  await mf.dispose();
}
