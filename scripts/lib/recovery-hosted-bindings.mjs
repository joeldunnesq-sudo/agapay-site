import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getPlatformProxy } from 'wrangler';

export function validateHostedRecoveryConfig(config, state, context, protectedIds) {
  assert.equal(context.CI, 'true', 'Hosted rehearsal is restricted to protected CI');
  assert.match(context.GITHUB_RUN_ID || '', /^\d+$/);
  assert.match(context.GITHUB_RUN_ATTEMPT || '', /^\d+$/);
  const prefix = `agapay-restore-drill-${context.GITHUB_RUN_ID}-${context.GITHUB_RUN_ATTEMPT}`;
  assert.equal(state.prefix, prefix);
  assert.equal(state.account, '9198ae5ea8adc59e5dedd1b09c9478b9');
  assert.equal(config.account_id, state.account);
  assert.equal(config.name, prefix + '-operator');
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.ok(!config.routes?.length && !config.triggers?.crons?.length && !config.main);
  assert.deepEqual(config.services, [{ binding: 'RECOVERY_DRILL', service: prefix, remote: true }]);
  assert.deepEqual(
    config.d1_databases,
    state.d1.map((r) => ({ ...r, remote: true }))
  );
  assert.deepEqual(
    config.r2_buckets,
    state.r2.map((r) => ({ ...r, remote: true }))
  );
  assert.deepEqual(
    config.kv_namespaces,
    state.kv.map(({ title, ...r }) => ({ ...r, remote: true }))
  );
  assert.deepEqual(config.d1_databases.map((r) => r.binding).sort(), ['AGAPAY_DB', 'DRILL_BOOKS']);
  assert.deepEqual(config.r2_buckets.map((r) => r.binding).sort(), [
    'PARISH_CLOSURE_LEDGER',
    'PARISH_EXPORTS',
    'PARISH_RETAINED_DATA',
    'SACRAMENT_DOCUMENTS',
  ]);
  assert.deepEqual(
    config.kv_namespaces.map((r) => r.binding),
    ['AGAPAY_REGISTRATIONS']
  );
  assert.equal(state.kv[0].title, prefix + '-legacy');
  for (const item of config.d1_databases) {
    assert.ok(item.database_name.startsWith(prefix + '-'));
    assert.match(item.database_id, /^[a-f0-9-]{36}$/);
    assert.ok(!protectedIds.has(item.database_id));
    assert.equal(item.remote, true);
  }
  for (const item of config.r2_buckets) {
    assert.ok(item.bucket_name.startsWith(prefix + '-'));
    assert.equal(item.remote, true);
  }
  for (const item of config.kv_namespaces) {
    assert.match(item.id, /^[a-f0-9]{32}$/);
    assert.ok(!protectedIds.has(item.id));
    assert.equal(item.remote, true);
  }
}
export async function hostedRecoveryBindings(configPath) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const state = JSON.parse(readFileSync(path.join(path.dirname(configPath), 'resources.json'), 'utf8'));
  const protectedIds = new Set(
    [...readFileSync('wrangler.toml', 'utf8').matchAll(/(?:database_id|\bid)\s*=\s*"([a-f0-9-]+)"/g)].map((m) => m[1])
  );
  validateHostedRecoveryConfig(config, state, process.env, protectedIds);
  const proxy = await getPlatformProxy({ configPath, envFiles: [], remoteBindings: true, persist: false });
  return {
    getD1Database: async (name) => proxy.env[name],
    getR2Bucket: async (name) => proxy.env[name],
    getKVNamespace: async (name) => proxy.env[name],
    async dispatchFetch(url, init) {
      const result = await proxy.env.RECOVERY_DRILL.run(JSON.parse(init.body));
      return Response.json(result.payload, {
        status: result.status,
        headers: { 'x-drill-operations': String(result.operations) },
      });
    },
    dispose: () => proxy.dispose(),
  };
}
