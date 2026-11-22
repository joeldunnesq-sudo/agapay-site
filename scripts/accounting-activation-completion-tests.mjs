import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
const url = new URL('../src/handlers/accounting-activation.js', import.meta.url);
const code = transformSync(readFileSync(url, 'utf8'), { format: 'cjs', target: 'es2022' }).code;
const dependencies = new Map();
for (const [, specifier] of code.matchAll(/require\("([^"]+)"\)/g))
  dependencies.set(specifier, await import(new URL(specifier, url)));
let registration = {
  parishId: 'synthetic-parish',
  reference: 'synthetic-reference',
  funds: [{ id: 'general', name: 'General Operating Fund' }],
  campaigns: [],
  feastCampaigns: [],
};
let ready = true,
  syncAvailable = true,
  completed = 0,
  saves = 0;
const order = [];
dependencies.set('../lib/accounting-staff.js', {
  ...dependencies.get('../lib/accounting-staff.js'),
  requireAccountingStaffProfile: async () => ({ user: { id: 'synthetic-staff' } }),
});
dependencies.set('../accounting/provisioning/activation.js', {
  ...dependencies.get('../accounting/provisioning/activation.js'),
  activationOperation: async () => ({
    id: 'synthetic-operation',
    status: ready ? 'ready' : 'running',
    entity_status: 'ready',
    activation_status: 'active',
    provisioning_status: 'ready',
    health_status: 'healthy',
  }),
  run: async () => {
    completed++;
    order.push('complete');
  },
});
dependencies.set('../accounting/source-wiring.js', {
  ...dependencies.get('../accounting/source-wiring.js'),
  synchronizeGivingCatalogWithAccounting: async (env, parishId, previous) => {
    assert.equal(parishId, registration.parishId);
    order.push('sync');
    return {
      available: syncAvailable,
      funds: previous.funds.map((f) => ({ ...f, accountingFundId: 'fund_general' })),
      campaigns: [],
      feastCampaigns: [],
    };
  },
});
dependencies.set('./parish.js', {
  ...dependencies.get('./parish.js'),
  findRegistrationByParishId: async () => ({ key: 'synthetic-reference', registration }),
  saveRegistrationRecord: async (env, key, next) => {
    registration = next;
    saves++;
    order.push('save');
  },
});
const module = { exports: {} };
new Function('require', 'module', 'exports', code)((specifier) => dependencies.get(specifier), module, module.exports);
const complete = () =>
  module.exports.handleAccountingActivation(
    new Request('https://synthetic.test/activation/complete', { method: 'POST', body: '{}' }),
    {},
    registration.parishId,
    '/activation/complete'
  );
ready = false;
assert.equal((await complete()).status, 409);
assert.equal(saves, 0);
ready = true;
syncAvailable = false;
assert.equal((await complete()).status, 503);
assert.equal(saves, 0);
assert.equal(completed, 0);
syncAvailable = true;
order.length = 0;
assert.equal((await complete()).status, 200);
assert.deepEqual(order, ['sync', 'save', 'complete']);
assert.equal(registration.funds[0].accountingFundId, 'fund_general');
assert.equal((await complete()).status, 200);
assert.equal(registration.funds.length, 1);
console.log(
  'PASS - Accounting completion links giving funds before marking the wizard complete, rejects failed synchronization, and safely retries'
);
