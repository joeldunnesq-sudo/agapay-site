import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { activationTestDatabase, activationTestEnvironment } from './lib/accounting-activation-fixture.mjs';
import { activationOperation, reserveActivation } from '../src/accounting/provisioning/activation.js';

const bundle = await build({
  entryPoints: ['src/accounting/provisioning/worker.js'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  loader: { '.sql': 'text' },
  plugins: [
    {
      name: 'local-worker-base',
      setup(builder) {
        builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({
          path: 'cloudflare:workers',
          namespace: 'test',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
          contents:
            'export class WorkerEntrypoint {constructor(env){this.env=env}}; export class WorkflowEntrypoint extends WorkerEntrypoint {}',
        }));
      },
    },
  ],
});
const {
  AccountingProvisioningWorkflow,
  AccountingProvisionerService,
  default: handler,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const env = activationTestEnvironment(),
  resources = new Map(),
  completed = new Map();
const operation = await reserveActivation(env, 'parish-a', { startDate: '2026-08-30', fiscalYearStartMonth: 7 });
let createCount = 0,
  failAt = 'Schema 0010_phase3c_commerce_accounting.sql';
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const path = new URL(url),
    name = path.searchParams.get('name');
  if (!init.method)
    return Response.json({
      success: true,
      result: [...resources.values()]
        .filter((item) => !name || item.name === name)
        .map(({ uuid, name }) => ({ uuid, name })),
    });
  const body = JSON.parse(init.body);
  if (!path.pathname.endsWith('/query')) {
    const uuid = `database-${++createCount}`;
    resources.set(uuid, { uuid, name: body.name, db: activationTestDatabase() });
    return Response.json({ success: true, result: { uuid, name: body.name } });
  }
  const database = resources.get(path.pathname.split('/').at(-2))?.db;
  assert.ok(database, 'Provider ID must identify a fixture database');
  const queries = body.batch || [body];
  database.sqlite.exec('BEGIN');
  try {
    const results = [];
    for (const query of queries) {
      const sql = query.sql,
        params = query.params || [];
      if (/^\s*(SELECT|PRAGMA\s+(quick_check|foreign_key_check|table_info))/i.test(sql))
        results.push({ success: true, results: database.sqlite.prepare(sql).all(...params) });
      else {
        if (params.length) database.sqlite.prepare(sql).run(...params);
        else database.sqlite.exec(sql);
        results.push({
          success: true,
          results: [],
          meta: { changes: database.sqlite.prepare('SELECT changes() n').get().n },
        });
      }
    }
    database.sqlite.exec('COMMIT');
    return Response.json({ success: true, result: results });
  } catch (error) {
    database.sqlite.exec('ROLLBACK');
    throw error;
  }
};
const step = {
  async do(name, _config, callback) {
    if (completed.has(name)) return completed.get(name);
    if (name === failAt) throw new Error('Simulated connection interruption');
    const result = await callback();
    completed.set(name, result);
    return result;
  },
};
const workflow = new AccountingProvisioningWorkflow(env);
try {
  await assert.rejects(
    () => workflow.run({ payload: { parishId: 'parish-a', operationId: operation.id } }, step),
    /interruption/
  );
  assert.equal((await activationOperation(env, 'parish-a')).status, 'failed');
  assert.equal(createCount, 1);
  failAt = '';
  await workflow.run({ payload: { parishId: 'parish-a', operationId: operation.id } }, step);
  const ready = await activationOperation(env, 'parish-a');
  assert.equal(ready.status, 'ready');
  assert.equal(ready.health_status, 'healthy');
  assert.equal(createCount, 1);
  const books = [...resources.values()][0].db;
  assert.equal(books.sqlite.prepare('SELECT COUNT(*) n FROM accounting_journal_entries').get().n, 0);
  const service = new AccountingProvisionerService(env);
  assert.equal((await service.resolve(ready.database_identifier)).providerId, ready.database_identifier);
  assert.equal(await service.resolve('another-parish-database'), null);
  assert.equal(
    (await service.query(ready.database_identifier, [{ sql: 'SELECT COUNT(*) n FROM accounting_accounts' }]))[0]
      .results[0].n > 20,
    true
  );
  books.sqlite.prepare("UPDATE accounting_database_metadata SET value='parish-b' WHERE key='parish_id'").run();
  await assert.rejects(() => service.query(ready.database_identifier, [{ sql: 'SELECT 1' }]), /ownership/);
  books.sqlite.prepare("UPDATE accounting_database_metadata SET value='parish-a' WHERE key='parish_id'").run();
  env.AGAPAY_DB.sqlite.prepare('INSERT INTO parish_data_closures VALUES(?,?,?)').run('parish-a', 'closed', 'closure');
  assert.equal(await service.resolve(ready.database_identifier), null);
  const other = await reserveActivation(env, 'parish-b', { startDate: '2026-08-30', fiscalYearStartMonth: 1 });
  resources.set('unowned', { uuid: 'unowned', name: other.database_identifier, db: activationTestDatabase() });
  const freshStep = {
    async do(_name, _options, callback) {
      return callback();
    },
  };
  await assert.rejects(
    () => workflow.run({ payload: { parishId: 'parish-b', operationId: other.id } }, freshStep),
    /ownership review/
  );
  assert.equal((await activationOperation(env, 'parish-b')).failure_code, 'ownership_review');
  assert.equal(createCount, 1);
  assert.equal(handler.fetch().status, 404);
} finally {
  globalThis.fetch = originalFetch;
}
console.log(
  'PASS Private provisioning workflow: interrupted resume, full schema, isolated service queries, closure barrier and unowned database refusal.'
);
