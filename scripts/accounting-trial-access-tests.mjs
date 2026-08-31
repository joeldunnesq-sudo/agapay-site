import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { accountingEnabledFor } from '../src/lib/entitlements.js';
import { issueParishDashboardSession } from '../src/lib/core.js';
import { parishDashboardPayload } from '../src/handlers/parish.js';
import { handleAccountingAccess } from '../src/handlers/accounting-access.js';
import { accountingContext } from '../src/handlers/accounting-ledger.js';
import {
  accountingCatalogRequiredForParish,
  accountingReadinessForParish,
} from '../src/lib/accounting-availability.js';
import { createAccountingStaffProfile, verifyAccountingStaffPin } from '../src/lib/accounting-staff.js';

const sqlite = new DatabaseSync(':memory:');
for (const migration of ['0021_accounting_control_plane.sql', '0037_accounting_staff_profiles.sql']) {
  sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
}
sqlite.exec('CREATE TABLE registrations(reference TEXT, parish_id TEXT, data TEXT, updated_at TEXT, received_at TEXT)');
const db = {
  prepare(sql) {
    return {
      params: [],
      bind(...params) {
        this.params = params;
        return this;
      },
      async first() {
        return sqlite.prepare(sql).get(...this.params) || null;
      },
      async all() {
        return { results: sqlite.prepare(sql).all(...this.params) };
      },
      async run() {
        return { meta: { changes: sqlite.prepare(sql).run(...this.params).changes } };
      },
    };
  },
};
const env = { AGAPAY_DB: db, AGAPAY_ENVIRONMENT: 'production' };
const trial = {
  parishId: 'test-lubbock',
  parishName: 'Test Parish',
  subscriptionTier: 'parish',
  subscriptionStatus: 'trialing',
  subscriptionTrialDays: 30,
  subscriptionTrialEndsAt: new Date(Date.now() + 12 * 86400000).toISOString(),
};
const first = await issueParishDashboardSession(trial);
const other = await issueParishDashboardSession({ ...trial, parishId: 'other-parish' });
const save = (registration) => {
  sqlite.prepare('DELETE FROM registrations WHERE parish_id=?').run(registration.parishId);
  sqlite
    .prepare('INSERT INTO registrations(reference,parish_id,data) VALUES(?,?,?)')
    .run(registration.parishId, registration.parishId, JSON.stringify(registration));
};
save(first.registration);
save(other.registration);
const accessRequest = (parishId = trial.parishId, token = first.token, path = '/profiles', body) =>
  new Request(`https://agapay.app/api/parish/dashboard/${parishId}/accounting-access${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

// A tier change must update the common payload, including the responses used
// by checkout, refresh and PATCH, without a hard reload or a demo-parish ID.
assert.equal(
  parishDashboardPayload(trial.parishId, { ...trial, subscriptionTier: 'starter' }).accountingAvailable,
  false
);
assert.equal(parishDashboardPayload(trial.parishId, trial).accountingAvailable, true);
assert.equal(parishDashboardPayload(trial.parishId, trial).entitlements.modules.accounting.included, true);
assert.equal(
  accountingEnabledFor({ ...trial, subscriptionStatus: 'active', subscriptionTrialEndsAt: '2000-01-01' }),
  true
);
assert.equal(accountingEnabledFor({ ...trial, subscriptionTier: 'giving', subscriptionAddOns: ['accounting'] }), true);
for (const registration of [
  null,
  { ...trial, subscriptionTier: 'unknown' },
  { ...trial, accountingEnabled: false },
  { ...trial, subscriptionTier: 'starter' },
  { ...trial, subscriptionTrialEndsAt: '2000-01-01' },
  { ...trial, subscriptionTrialEndsAt: 'invalid' },
])
  assert.equal(accountingEnabledFor(registration), false);
for (const status of ['cancelled', 'canceled', 'paused', 'past_due', 'unpaid', 'incomplete_expired']) {
  for (const tier of ['parish', 'giving'])
    assert.equal(
      accountingEnabledFor({
        ...trial,
        subscriptionTier: tier,
        subscriptionAddOns: ['accounting'],
        subscriptionStatus: status,
      }),
      false
    );
}
for (const status of [
  'not_started',
  'checkout_created',
  'trial_checkout_created',
  'incomplete',
  'cancelled',
  'unpaid',
]) {
  assert.equal(accountingEnabledFor({ ...trial, subscriptionTrialDays: 0, subscriptionStatus: status }), false);
}

// Authenticate the parish before disclosing readiness; no database, profiles,
// subscription writes or activation are performed by the read path.
const beforeRead = sqlite.prepare('SELECT total_changes() AS n').get().n;
const response = await handleAccountingAccess(accessRequest(), env, trial.parishId);
assert.equal(response.status, 200);
assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
assert.deepEqual(await response.json(), { accounting: { status: 'setup_required', ready: false }, profiles: [] });
assert.equal(sqlite.prepare('SELECT total_changes() AS n').get().n, beforeRead);
assert.equal((await handleAccountingAccess(accessRequest('other-parish'), env, 'other-parish')).status, 401);
assert.equal(
  (await handleAccountingAccess(accessRequest(trial.parishId, other.token), env, trial.parishId)).status,
  401
);
assert.equal(
  (await handleAccountingAccess(accessRequest(trial.parishId, '', '/profiles'), env, trial.parishId)).status,
  401
);
const bootstrap = await handleAccountingAccess(
  accessRequest(trial.parishId, first.token, '/bootstrap', { displayName: 'Test Treasurer', pin: '123456' }),
  env,
  trial.parishId
);
assert.equal(bootstrap.status, 409);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM accounting_staff_profiles').get().n, 0);
assert.equal(await accountingCatalogRequiredForParish(env, trial.parishId, trial), false);
assert.equal(
  await accountingCatalogRequiredForParish(env, trial.parishId, {
    ...trial,
    funds: [{ accountingFundId: 'existing-fund' }],
  }),
  true
);

// Existing named-staff sessions still require capability, entitlement and
// readiness, and can never be used to select another parish's books.
const profile = await createAccountingStaffProfile(env, {
  parishId: trial.parishId,
  displayName: 'Test Treasurer',
  roleTemplate: 'treasurer',
  capabilities: ['accounting.view'],
  pin: '123456',
  actorType: 'test',
});
const session = await verifyAccountingStaffPin(env, { parishId: trial.parishId, profileId: profile.id, pin: '123456' });
const staffRequest = new Request(`https://agapay.app/api/parish/dashboard/${trial.parishId}/accounting/setup`, {
  headers: { 'X-AGAPAY-Accounting-Profile': profile.id, 'X-AGAPAY-Accounting-Token': session.token },
});
assert.equal((await accountingContext(staffRequest, env, trial.parishId, 'accounting.view')).error.status, 409);
assert.equal(await accountingContext(staffRequest, env, 'other-parish', 'accounting.view'), null);
assert.equal(await accountingContext(staffRequest, env, trial.parishId, 'accounting.configure'), null);
save({ ...first.registration, subscriptionTier: 'starter' });
assert.equal((await handleAccountingAccess(accessRequest(), env, trial.parishId)).status, 403);
assert.equal((await accountingContext(staffRequest, env, trial.parishId, 'accounting.view')).error.status, 403);
save(first.registration);

sqlite
  .prepare(
    "INSERT INTO accounting_entities(id,parish_id,entity_status,activation_status) VALUES('entity',?,'ready','active')"
  )
  .run(trial.parishId);
sqlite.exec(
  "INSERT INTO accounting_databases(id,accounting_entity_id,environment,database_identifier,provisioning_status,health_status) VALUES('books','entity','staging','private-books','ready','healthy')"
);
assert.deepEqual(await accountingReadinessForParish(env, trial.parishId, trial), {
  status: 'unavailable',
  ready: false,
});
sqlite.exec("UPDATE accounting_databases SET environment='production'");
assert.deepEqual(await accountingReadinessForParish(env, trial.parishId, trial), { status: 'ready', ready: true });
const readyResponse = await handleAccountingAccess(accessRequest(), env, trial.parishId);
const readyPayload = await readyResponse.json();
assert.equal(readyPayload.accounting.ready, true);
assert.equal(readyPayload.profiles[0].id, profile.id);
assert.ok(!JSON.stringify(readyPayload).includes('private-books'), 'never expose provider identifiers');
assert.equal(await accountingCatalogRequiredForParish(env, trial.parishId, trial), true);
const boundEnv = {
  ...env,
  ACCOUNTING_DATABASE_BINDINGS: JSON.stringify({ 'private-books': 'PARISH_BOOKS' }),
  PARISH_BOOKS: db,
};
const readyContext = await accountingContext(staffRequest, boundEnv, trial.parishId, 'accounting.view');
assert.ok(readyContext.db, 'a ready, entitled non-demo parish must reach its registered database');
assert.equal(readyContext.actor.id, profile.id);
assert.equal(readyContext.registration.parishId, trial.parishId);
assert.equal(readyContext.tier, 'advanced_operations');
for (const state of ['suspended', 'archived', 'inactive']) {
  sqlite.prepare('UPDATE accounting_entities SET activation_status=?').run(state);
  assert.equal((await accountingReadinessForParish(env, trial.parishId, trial)).ready, false);
  assert.equal((await accountingContext(staffRequest, env, trial.parishId, 'accounting.view')).error.status, 409);
}
sqlite.exec(
  "UPDATE accounting_entities SET activation_status='active'; UPDATE accounting_databases SET health_status='unhealthy'"
);
assert.equal((await accountingReadinessForParish(env, trial.parishId, trial)).ready, false);
assert.equal((await accountingContext(staffRequest, env, trial.parishId, 'accounting.view')).error.status, 409);
sqlite.close();
console.log(
  'PASS - Parish trials update Accounting access while preserving authentication, tenant isolation, activation and catalog safety'
);
