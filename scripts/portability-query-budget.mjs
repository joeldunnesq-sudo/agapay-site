// Offline full-schema operation counts, not a provider load test. Requires the
// audited zero-row baselines. Uses memory-only SQLite and synthetic R2 objects.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { POLICY_VERSION } from '../src/portability/catalog.js';
import { RETENTION_DISCLOSURE_VERSION } from '../src/portability/policy.js';
import { sha256, utf8 } from '../src/portability/archive.js';
import { startExport, processExport, getJob, confirmClosure, runPortabilityJobs } from '../src/portability/service.js';
import { protectFileStorage } from '../src/portability/storage.js';
import { protectLegacyStorage } from '../src/portability/legacy.js';
import { assertRestoreSafe } from '../src/portability/suppression.js';

const dir = path.resolve('artifacts/portability-staging');
mkdirSync(dir, { recursive: true });
const audit = {
  schemas: [
    {
      kind: 'central',
      baselineSha256: '71ca5b0ae88a36ecd5c1157b93fbf0c8a5dd1a0cc073c3d377a549b389f96cd6',
      fixtureSha256: '9fac0ca52b5dbcd34037126658df9053478c1f073c80e891fe62f263cc08005f',
    },
    {
      kind: 'accounting',
      baselineSha256: 'b891b2e24dff8429f487cb3f7569875df44915f204479b7285362da977c25fab',
      fixtureSha256: '662221949e046a41dcccfab39f9142c78df664341338b5b86e06359c9f050db3',
    },
  ],
};
const counters = { statements: 0, calls: 0, storageCalls: 0 };
function binding(db) {
  const prepare = (sql) => ({
    sql,
    params: [],
    bind(...params) {
      this.params = params;
      return this;
    },
    async all() {
      counters.statements++;
      counters.calls++;
      return { results: db.prepare(sql).all(...this.params) };
    },
    async first() {
      counters.statements++;
      counters.calls++;
      return db.prepare(sql).get(...this.params) || null;
    },
    async run() {
      counters.statements++;
      counters.calls++;
      return { meta: { changes: db.prepare(sql).run(...this.params).changes } };
    },
  });
  return {
    prepare,
    async batch(statements) {
      counters.calls++;
      counters.statements += statements.length;
      db.exec('BEGIN');
      try {
        const results = statements.map((s) => ({ meta: { changes: db.prepare(s.sql).run(...s.params).changes } }));
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
function bucket() {
  const objects = new Map();
  return {
    async put(key, data, options = {}) {
      counters.storageCalls++;
      if (options.onlyIf?.etagDoesNotMatch === '*' && objects.has(key)) return null;
      const bytes = typeof data === 'string' ? utf8(data) : new Uint8Array(data);
      objects.set(key, { key, bytes, size: bytes.length, etag: await sha256(bytes), ...options });
      return objects.get(key);
    },
    async head(key) {
      counters.storageCalls++;
      return objects.get(key) || null;
    },
    async get(key) {
      counters.storageCalls++;
      const o = objects.get(key);
      return o
        ? {
            ...o,
            body: new Response(o.bytes).body,
            async arrayBuffer() {
              return o.bytes.slice().buffer;
            },
            async text() {
              return new TextDecoder().decode(o.bytes);
            },
          }
        : null;
    },
    async list({ prefix = '' } = {}) {
      counters.storageCalls++;
      return {
        objects: [...objects.values()]
          .filter((o) => o.key.startsWith(prefix))
          .sort((a, b) => a.key.localeCompare(b.key)),
        truncated: false,
      };
    },
    async delete(key) {
      counters.storageCalls++;
      objects.delete(key);
    },
  };
}
const central = new DatabaseSync(':memory:'),
  books = new DatabaseSync(':memory:');
try {
  for (const [kind, db] of [
    ['central', central],
    ['accounting', books],
  ]) {
    const sql = readFileSync(
      new URL('./fixtures/portability-' + kind + '-schema.sql', import.meta.url),
      'utf8'
    ).replace(/\r\n/g, '\n');
    assert.equal(await sha256(sql), audit.schemas.find((s) => s.kind === kind).fixtureSha256);
    db.exec(sql);
  }
  const parishId = 'query-budget-synthetic';
  central
    .prepare('INSERT INTO registrations(reference,parish_id,updated_at,data) VALUES(?,?,?,?)')
    .run('query-budget-ref', parishId, new Date().toISOString(), JSON.stringify({ parishId }));
  central.prepare("INSERT INTO accounting_entities(id,parish_id) VALUES('budget-entity',?)").run(parishId);
  central.exec(
    "INSERT INTO accounting_databases(id,accounting_entity_id,environment,database_identifier) VALUES('budget-db','budget-entity','staging','agapay-acct-staging-query-budget')"
  );
  books.prepare("INSERT INTO accounting_database_metadata(key,value) VALUES('parish_id',?)").run(parishId);
  const env = {
    AGAPAY_DB: binding(central),
    DRILL_BOOKS: binding(books),
    AGAPAY_ENVIRONMENT: 'staging',
    ACCOUNTING_DATABASE_BINDINGS: JSON.stringify({ 'agapay-acct-staging-query-budget': 'DRILL_BOOKS' }),
    PARISH_EXPORTS: bucket(),
    PARISH_RETAINED_DATA: bucket(),
    PARISH_CLOSURE_LEDGER: bucket(),
    PARISH_SUPPRESSION_AUTHORITY: 'query-budget',
    PARISH_PORTABILITY_ENABLED: 'true',
    PARISH_STORAGE_GUARDS_ENABLED: 'true',
    PARISH_AUTOMATIC_CLOSURE_ENABLED: 'true',
    PARISH_RETENTION_DISCLOSURE_APPROVED: RETENTION_DISCLOSURE_VERSION,
    ACCOUNTING_BACKUP_STRICT_EXPIRY_ENABLED: 'true',
    PARISH_BACKUP_EXPIRY_VERIFIED: POLICY_VERSION,
  };
  await env.PARISH_CLOSURE_LEDGER.put(
    'authority.json',
    JSON.stringify({ id: 'query-budget', policyVersion: POLICY_VERSION })
  );
  await env.PARISH_CLOSURE_LEDGER.put(
    'backup-expiry/latest.json',
    JSON.stringify({
      strictExpiryEnabled: true,
      verifiedAt: Date.now(),
      retentionDays: 365,
      newestBackupPreserved: false,
      oldestRetainedAt: null,
    })
  );
  const values = new Map();
  env.AGAPAY_REGISTRATIONS = {
    async get(key) {
      counters.storageCalls++;
      return values.get(key) ?? null;
    },
    async put(key, value) {
      counters.storageCalls++;
      values.set(key, value);
    },
    async delete(key) {
      counters.storageCalls++;
      values.delete(key);
    },
    async list() {
      counters.storageCalls++;
      return { keys: [...values.keys()].sort().map((name) => ({ name })), list_complete: true };
    },
  };
  env.PARISH_LEGACY_INVENTORY_VERIFIED = POLICY_VERSION;
  env.DIRECTORY_MEDIA = bucket();
  const guarded = protectLegacyStorage(protectFileStorage(env));
  for (let i = 0; i < 8; i++) {
    await guarded.DIRECTORY_MEDIA.put('owned/' + i + '.txt', 'synthetic file ' + i, {
      customMetadata: { agapayParishId: parishId },
    });
    await guarded.AGAPAY_REGISTRATIONS.put(
      'registration-' + i,
      JSON.stringify({ parishId, parishName: 'Synthetic ' + i })
    );
  }
  const results = [];
  async function measure(stage, fn) {
    counters.statements = 0;
    counters.calls = 0;
    counters.storageCalls = 0;
    await assertRestoreSafe(env); // Include the Worker/scheduler restore guard.
    await fn();
    assert.ok(counters.statements + counters.storageCalls <= 800, stage + ' exceeds conservative invocation budget');
    results.push({ stage, ...counters });
    console.log(
      `${stage}: ${counters.statements} SQL statements, ${counters.calls} D1 binding calls, ${counters.storageCalls} storage calls`
    );
  }
  const actorHash = await sha256('synthetic-budget-admin');
  const job = await startExport(env, { parishId, actorHash, mode: 'close', requestKey: 'synthetic-budget' });
  await measure('prepare', () => processExport(env, parishId, job.id));
  const ready = await getJob(env, parishId, job.id);
  await measure('confirm', () =>
    confirmClosure(env, {
      parishId,
      jobId: job.id,
      actorHash,
      archiveHash: ready.archive_sha256,
      policyVersion: POLICY_VERSION,
      saved: true,
      confirmation: parishId,
    })
  );
  const otherJob = await startExport(env, {
    parishId: 'other-synthetic',
    actorHash,
    mode: 'export',
    requestKey: 'other-synthetic-request',
  });
  central.prepare('UPDATE parish_portability_jobs SET updated_at=? WHERE id=?').run(Date.now() + 600000, otherJob.id);
  for (const stage of ['freeze_books', 'authorize', 'delete']) {
    await measure(stage, async () => assert.equal((await runPortabilityJobs(env)).processed, 1));
    assert.equal(
      (await getJob(env, 'other-synthetic', otherJob.id)).status,
      'preparing',
      'scheduler must not process multiple jobs per invocation'
    );
  }
  assert.equal((await getJob(env, parishId, job.id)).status, 'active_data_deleted');
  central
    .prepare('INSERT INTO registrations(reference,parish_id,updated_at,data) VALUES(?,?,?,?)')
    .run('big-ref', 'other-synthetic', new Date().toISOString(), JSON.stringify({ parishId: 'other-synthetic' }));
  for (let i = 0; i < 400; i++)
    await guarded.DIRECTORY_MEDIA.put('many/' + i + '.txt', 'synthetic', {
      customMetadata: { agapayParishId: 'other-synthetic' },
    });
  await assert.rejects(
    processExport(env, 'other-synthetic', otherJob.id),
    (error) => error.code === 'portability_operation_limit'
  );
  assert.equal((await getJob(env, 'other-synthetic', otherJob.id)).status, 'failed');
  assert.equal(
    (await getJob(env, 'other-synthetic', otherJob.id)).archive_key,
    null,
    'oversized work never publishes a partial archive'
  );
  assert.equal(
    central.prepare("SELECT count(*) n FROM parish_data_closures WHERE parish_id='other-synthetic'").get().n,
    0
  );
  const report = {
    measuredAt: new Date().toISOString(),
    remote: false,
    scope:
      'Full audited schemas, accounting identity, eight files and eight legacy keys; restore guard and scheduler included, two pending jobs. No monetary transactions or browser/MFA. Large inventory fails closed under runtime operation limit.',
    baselines: audit.schemas.map(({ kind, baselineSha256 }) => ({ kind, baselineSha256 })),
    results,
    oversizedWorkRejected: true,
    hostedInvocationCertified: false,
  };
  writeFileSync(path.join(dir, 'query-budget.json'), JSON.stringify(report, null, 2) + '\n');
} finally {
  central.close();
  books.close();
}
