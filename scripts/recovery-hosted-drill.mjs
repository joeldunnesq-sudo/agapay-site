// Protected-CI rehearsal. Creates fresh synthetic resources only; never binds production stores.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { getPlatformProxy } from 'wrangler';

const mode = process.argv[2] || '--plan';
assert.ok(['--plan', '--run', '--cleanup'].includes(mode));
if (mode === '--plan') {
  console.log(
    'Private hosted recovery rehearsal: 2 disposable D1 databases, 4 private R2 buckets, 1 KV namespace, and 1 service-only Worker. Synthetic data only. Separate mandatory cleanup.'
  );
  process.exit(0);
}
assert.equal(process.env.CI, 'true');
assert.match(process.env.GITHUB_RUN_ID || '', /^\d+$/);
assert.match(process.env.GITHUB_RUN_ATTEMPT || '', /^\d+$/);
assert.ok(process.env.CLOUDFLARE_API_TOKEN);
const prefix = `agapay-restore-drill-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
const account = '9198ae5ea8adc59e5dedd1b09c9478b9';
const dir = path.resolve('artifacts/recovery-hosted');
mkdirSync(dir, { recursive: true });
const journalPath = path.join(dir, 'resources.json'),
  resultPath = path.join(dir, 'result.json');
const protectedIds = new Set(
  [...readFileSync('wrangler.toml', 'utf8').matchAll(/(?:database_id|\bid)\s*=\s*"([a-f0-9-]+)"/g)].map((m) => m[1])
);
async function api(method, suffix, body, allowMissing = false) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${suffix}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (allowMissing && response.status === 404) return null;
  const value = await response.json();
  if (!response.ok || value.success === false)
    throw new Error(
      `Disposable-resource API failed (${response.status}; codes ${(value.errors || []).map((e) => e.code).join(',')})`
    );
  return value.result;
}
const save = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const common = {
  account_id: account,
  compatibility_date: '2026-09-01',
  compatibility_flags: ['nodejs_compat'],
  workers_dev: false,
  preview_urls: false,
  triggers: { crons: [] },
};
if (mode === '--cleanup') {
  if (!existsSync(journalPath)) {
    console.log('No disposable resources recorded.');
    process.exit(0);
  }
  const state = JSON.parse(readFileSync(journalPath, 'utf8'));
  assert.equal(state.prefix, prefix);
  assert.equal(state.account, account);
  const failures = [];
  async function clean(key, fn) {
    try {
      await fn();
    } catch {
      failures.push(key);
    }
  }
  if (state.workerAttempted) await clean('worker', () => api('DELETE', '/workers/scripts/' + prefix, undefined, true));
  if (state.r2.length) {
    const configPath = path.join(dir, 'cleanup.json');
    for (const r of state.r2) assert.ok(r.bucket_name.startsWith(prefix + '-'));
    save(configPath, {
      ...common,
      name: prefix + '-cleanup',
      r2_buckets: state.r2.map((r) => ({ ...r, remote: true })),
    });
    let proxy;
    try {
      proxy = await getPlatformProxy({ configPath, envFiles: [], remoteBindings: true, persist: false });
      for (const r of state.r2)
        await clean(r.binding, async () => {
          const bucket = proxy.env[r.binding];
          for (let page = 0; ; page++) {
            assert.ok(page < 100, 'Unexpected disposable volume');
            const listed = await bucket.list({ limit: 1000 });
            if (!listed.objects.length) break;
            await bucket.delete(listed.objects.map((o) => o.key));
          }
          await api('DELETE', '/r2/buckets/' + r.bucket_name);
        });
    } catch {
      failures.push('bucket-cleanup');
    } finally {
      await proxy?.dispose();
    }
  }
  for (const r of state.d1) {
    assert.ok(r.database_name.startsWith(prefix + '-'));
    assert.ok(!protectedIds.has(r.database_id));
    await clean(r.binding, () => api('DELETE', '/d1/database/' + r.database_id));
  }
  for (const r of state.kv) {
    assert.ok(r.title.startsWith(prefix + '-'));
    assert.ok(!protectedIds.has(r.id));
    await clean(r.binding, () => api('DELETE', '/storage/kv/namespaces/' + r.id));
  }
  const result = existsSync(resultPath) ? JSON.parse(readFileSync(resultPath, 'utf8')) : { passed: false };
  save(resultPath, { ...result, cleanupComplete: failures.length === 0, cleanupFailures: failures });
  assert.deepEqual(failures, [], 'Some disposable resources require cleanup');
  console.log('PASS - disposable recovery resources removed');
  process.exit(0);
}
assert.ok(!existsSync(journalPath), 'Never reuse a previous rehearsal resource set');
const state = { prefix, account, d1: [], r2: [], kv: [], workerAttempted: false };
save(journalPath, state);
try {
  for (const binding of ['AGAPAY_DB', 'DRILL_BOOKS']) {
    const database_name = prefix + '-' + binding.toLowerCase().replaceAll('_', '-');
    const created = await api('POST', '/d1/database', { name: database_name });
    assert.match(created.uuid, /^[a-f0-9-]{36}$/);
    assert.ok(!protectedIds.has(created.uuid));
    state.d1.push({ binding, database_name, database_id: created.uuid });
    save(journalPath, state);
  }
  for (const [binding, suffix] of [
    ['PARISH_EXPORTS', 'exports'],
    ['PARISH_RETAINED_DATA', 'retained'],
    ['PARISH_CLOSURE_LEDGER', 'ledger'],
    ['SACRAMENT_DOCUMENTS', 'documents'],
  ]) {
    const bucket_name = prefix + '-' + suffix;
    await api('POST', '/r2/buckets', { name: bucket_name });
    state.r2.push({ binding, bucket_name });
    save(journalPath, state);
    assert.equal((await api('GET', '/r2/buckets/' + bucket_name + '/domains/managed')).enabled, false);
    assert.deepEqual((await api('GET', '/r2/buckets/' + bucket_name + '/domains/custom')).domains, []);
  }
  const title = prefix + '-legacy',
    kv = await api('POST', '/storage/kv/namespaces', { title });
  assert.match(kv.id, /^[a-f0-9]{32}$/);
  assert.ok(!protectedIds.has(kv.id));
  state.kv.push({ binding: 'AGAPAY_REGISTRATIONS', id: kv.id, title });
  save(journalPath, state);
  const workerConfig = {
    ...common,
    name: prefix,
    main: path.resolve('scripts/fixtures/recovery-hosted-worker.js'),
    d1_databases: state.d1,
    r2_buckets: state.r2,
    kv_namespaces: state.kv.map(({ title, ...r }) => r),
    vars: {
      RECOVERY_HOSTED_DRILL: 'true',
      DRILL_RESOURCE_PREFIX: prefix,
      AGAPAY_ENVIRONMENT: 'test',
      ACCOUNTING_DATABASE_BINDINGS: JSON.stringify({ 'test-books-a': 'DRILL_BOOKS' }),
      PARISH_RECOVERY_ENABLED: 'true',
      PARISH_PORTABILITY_ENABLED: 'true',
      PARISH_STORAGE_GUARDS_ENABLED: 'true',
      PARISH_SUPPRESSION_AUTHORITY: 'test-ledger',
    },
  };
  const workerConfigPath = path.join(dir, 'worker.json');
  save(workerConfigPath, workerConfig);
  // The run/attempt prefix is unique; never replace an existing Worker.
  const prior = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${prefix}`, {
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(prior.status, 404, 'Disposable Worker name is already in use or cannot be checked');
  state.workerAttempted = true;
  save(journalPath, state);
  const deployed = spawnSync(
    process.execPath,
    ['node_modules/wrangler/bin/wrangler.js', 'deploy', '--config', workerConfigPath],
    { encoding: 'utf8', timeout: 180000, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } }
  );
  if (deployed.status !== 0) {
    console.error((deployed.stderr || deployed.stdout || '').slice(-4000));
    throw new Error('Private rehearsal Worker deployment failed');
  }
  const operatorPath = path.join(dir, 'operator.json');
  save(operatorPath, {
    ...common,
    name: prefix + '-operator',
    d1_databases: state.d1.map((r) => ({ ...r, remote: true })),
    r2_buckets: state.r2.map((r) => ({ ...r, remote: true })),
    kv_namespaces: state.kv.map(({ title, ...r }) => ({ ...r, remote: true })),
    services: [{ binding: 'RECOVERY_DRILL', service: prefix, remote: true }],
  });
  const result = spawnSync(process.execPath, ['scripts/parish-recovery-runtime-tests.mjs'], {
    stdio: 'inherit',
    timeout: 1200000,
    env: { ...process.env, RECOVERY_HOSTED_DRILL_CONFIG: operatorPath, WRANGLER_SEND_METRICS: 'false' },
  });
  assert.equal(result.status, 0, 'Hosted recovery rehearsal failed');
  save(resultPath, {
    passed: true,
    syntheticDataOnly: true,
    productionStoresBound: false,
    hostedInvocations: true,
    completedAt: new Date().toISOString(),
    cleanupComplete: false,
  });
} catch (error) {
  save(resultPath, { passed: false, syntheticDataOnly: true, productionStoresBound: false, cleanupComplete: false });
  throw error;
}
