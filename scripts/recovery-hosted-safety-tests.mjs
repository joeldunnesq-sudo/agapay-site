import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { validateHostedRecoveryConfig } from './lib/recovery-hosted-bindings.mjs';

const context = { CI: 'true', GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '1' };
const prefix = 'agapay-restore-drill-12345-1';
const state = {
  prefix,
  account: '9198ae5ea8adc59e5dedd1b09c9478b9',
  d1: ['AGAPAY_DB', 'DRILL_BOOKS'].map((binding, i) => ({
    binding,
    database_name: prefix + '-' + i,
    database_id: `${i}1111111-1111-1111-1111-111111111111`,
  })),
  r2: ['PARISH_EXPORTS', 'PARISH_RETAINED_DATA', 'PARISH_CLOSURE_LEDGER', 'SACRAMENT_DOCUMENTS'].map((binding, i) => ({
    binding,
    bucket_name: prefix + '-' + i,
  })),
  kv: [{ binding: 'AGAPAY_REGISTRATIONS', id: 'a'.repeat(32), title: prefix + '-legacy' }],
};
const config = {
  name: prefix + '-operator',
  account_id: state.account,
  workers_dev: false,
  preview_urls: false,
  services: [{ binding: 'RECOVERY_DRILL', service: prefix, remote: true }],
  d1_databases: state.d1.map((r) => ({ ...r, remote: true })),
  r2_buckets: state.r2.map((r) => ({ ...r, remote: true })),
  kv_namespaces: state.kv.map(({ title, ...r }) => ({ ...r, remote: true })),
};
validateHostedRecoveryConfig(config, state, context, new Set());
for (const mutate of [
  (c) => {
    c.workers_dev = true;
  },
  (c) => {
    c.preview_urls = true;
  },
  (c) => {
    c.routes = ['agapay.app/*'];
  },
  (c) => {
    c.main = 'src/index.js';
  },
  (c) => {
    c.triggers = { crons: ['* * * * *'] };
  },
  (c) => {
    c.services[0].service = 'agapay-site';
  },
  (c) => {
    c.d1_databases[0].database_name = 'production';
  },
  (c) => {
    c.r2_buckets[0].bucket_name = 'production';
  },
  (c) => {
    c.kv_namespaces[0].id = 'b'.repeat(32);
  },
  (c) => {
    c.d1_databases.push({ ...c.d1_databases[0], binding: 'EXTRA' });
  },
]) {
  const changed = structuredClone(config);
  mutate(changed);
  assert.throws(() => validateHostedRecoveryConfig(changed, state, context, new Set()));
}
assert.throws(() => validateHostedRecoveryConfig(config, state, { ...context, CI: 'false' }, new Set()));
assert.throws(() => validateHostedRecoveryConfig(config, state, { ...context, GITHUB_RUN_ATTEMPT: '2' }, new Set()));
for (const id of [state.d1[0].database_id, state.kv[0].id])
  assert.throws(() => validateHostedRecoveryConfig(config, state, context, new Set([id])));
const plan = spawnSync(process.execPath, ['scripts/recovery-hosted-drill.mjs'], {
  encoding: 'utf8',
  env: { ...process.env, CI: 'false', CLOUDFLARE_API_TOKEN: '' },
});
assert.equal(plan.status, 0, plan.stderr);
assert.match(plan.stdout, /Synthetic data only/);
console.log(
  'PASS - hosted rehearsal defaults to a plan and rejects production bindings, public routes, unrecorded resources and wrong run identities'
);
