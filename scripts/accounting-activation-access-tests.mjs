import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activationTestEnvironment } from './lib/accounting-activation-fixture.mjs';
import { handleAccountingAccess } from '../src/handlers/accounting-access.js';
import { issueParishDashboardSession } from '../src/lib/core.js';

const env = activationTestEnvironment();
env.AGAPAY_DB.sqlite.exec(readFileSync('migrations/0037_accounting_staff_profiles.sql', 'utf8'));
const stored = JSON.parse(
  env.AGAPAY_DB.sqlite.prepare("SELECT data FROM registrations WHERE parish_id='parish-a'").get().data
);
const session = await issueParishDashboardSession(stored);
env.AGAPAY_DB.sqlite
  .prepare("UPDATE registrations SET data=? WHERE parish_id='parish-a'")
  .run(JSON.stringify(session.registration));
let starts = 0,
  reads = 0;
env.ACCOUNTING_PROVISIONER = {
  async status() {
    reads++;
    return { available: true, status: 'not_started' };
  },
  async start() {
    starts++;
    return { status: 'pending' };
  },
};
const request = (path, { method = 'GET', token = session.token, body, parish = 'parish-a' } = {}) =>
  new Request(`https://local.test/api/parish/dashboard/${parish}/accounting-access${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
assert.equal((await handleAccountingAccess(request('/activation', { token: 'wrong' }), env, 'parish-a')).status, 401);
assert.equal(
  (await handleAccountingAccess(request('/activation', { parish: 'parish-b' }), env, 'parish-b')).status,
  401
);
assert.equal(reads, 0);
assert.equal(starts, 0);
const status = await handleAccountingAccess(request('/activation'), env, 'parish-a');
assert.equal(status.status, 200);
assert.equal(status.headers.get('Cache-Control'), 'private, no-store');
assert.equal(reads, 1);
assert.equal(starts, 0);
assert.equal(
  (
    await handleAccountingAccess(
      request('/activation/start', { method: 'POST', body: { startDate: '2026-08-30', fiscalYearStartMonth: 1 } }),
      env,
      'parish-a'
    )
  ).status,
  202
);
assert.equal(starts, 1);
assert.equal(
  (
    await handleAccountingAccess(
      request('/activation/chart/commit', { method: 'POST', body: { confirmed: true } }),
      env,
      'parish-a'
    )
  ).status,
  403
);
assert.equal(
  (await handleAccountingAccess(request('/activation/complete', { method: 'POST', body: {} }), env, 'parish-a')).status,
  403
);
env.AGAPAY_DB.sqlite
  .prepare("UPDATE registrations SET data=? WHERE parish_id='parish-a'")
  .run(JSON.stringify({ ...session.registration, subscriptionTrialEndsAt: '2000-01-01' }));
assert.equal(
  (await handleAccountingAccess(request('/activation/start', { method: 'POST', body: {} }), env, 'parish-a')).status,
  403
);
assert.equal(starts, 1);
env.AGAPAY_DB.sqlite
  .prepare("UPDATE registrations SET data=? WHERE parish_id='parish-a'")
  .run(JSON.stringify(session.registration));
delete env.ACCOUNTING_PROVISIONER;
assert.equal(
  (await handleAccountingAccess(request('/activation/start', { method: 'POST', body: {} }), env, 'parish-a')).status,
  503
);
assert.equal(env.AGAPAY_DB.sqlite.prepare('SELECT COUNT(*) n FROM accounting_entities').get().n, 0);
console.log(
  'PASS Accounting activation access: authentication, parish scope, expired trial, read-only status, named import access and fail-closed configuration.'
);
