import assert from 'node:assert/strict';
import * as dashboard from '../src/handlers/parish-dashboard-handler.js';
import * as parishFacade from '../src/handlers/parish.js';
import { issueParishDashboardSession, verifyParishDashboardPassword, parishIdIndexKey } from '../src/lib/core.js';
import { recordParishFeatureRequest } from '../src/lib/parish-feature-requests.js';
import { memoryRateLimiter } from './lib/memory-rate-limiter.mjs';

class MemoryKV {
  values = new Map();
  async get(key) {
    return this.values.get(key) ?? null;
  }
  async put(key, value) {
    this.values.set(key, String(value));
  }
  async delete(key) {
    this.values.delete(key);
  }
  async list({ prefix = '' } = {}) {
    return {
      keys: [...this.values.keys()].filter((name) => name.startsWith(prefix)).map((name) => ({ name })),
      list_complete: true,
    };
  }
}
async function fixture(overrides = {}) {
  const registration = {
    reference: 'REG-A',
    parishId: 'a',
    parishName: 'Parish A',
    communityType: 'parish',
    subscriptionTier: 'giving',
    subscriptionStatus: 'active',
    givingStatus: 'hidden',
    funds: [{ id: 'general', name: 'General Operating Fund', isDefault: true, restrictionType: 'unrestricted' }],
    campaigns: [],
    feastCampaigns: [],
    priestEmail: 'priest@example.test',
    taxLegalName: 'Legal A',
    ...overrides,
  };
  const session = await issueParishDashboardSession(registration);
  const env = {
    AGAPAY_ENVIRONMENT: 'test',
    AGAPAY_REGISTRATIONS: new MemoryKV(),
    AGAPAY_RATE_LIMITER: memoryRateLimiter(),
  };
  await env.AGAPAY_REGISTRATIONS.put('REG-A', JSON.stringify(session.registration));
  await env.AGAPAY_REGISTRATIONS.put(parishIdIndexKey('a'), 'REG-A');
  const saved = async () => JSON.parse(await env.AGAPAY_REGISTRATIONS.get('REG-A'));
  const call = (method = 'GET', body, token = session.token, parishId = 'a') =>
    dashboard.handleParishDashboard(
      new Request(`https://example.test/api/parish/${parishId}/dashboard`, {
        method,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
      }),
      env,
      parishId
    );
  return { env, session, saved, call };
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error('Unexpected external network access in dashboard fixture');
};
try {
  for (const name of [
    'handleParishDashboard',
    'handleParishFeatureRequestDismiss',
    'parishDashboardPayload',
    'normalizeSacramentPriests',
    'givingCatalogChanged',
    'summarizeCharges',
  ])
    assert.equal(parishFacade[name], dashboard[name], `${name} compatibility export`);
  const f = await fixture({ parishDashboardToken: 'private-legacy-token', stripeCustomerId: 'cus_a' });
  const before = await f.saved();
  assert.equal((await f.call('GET', undefined, 'invalid')).status, 401);
  assert.equal((await f.call('GET', undefined, f.session.token, 'b')).status, 404);
  assert.equal((await f.call('DELETE')).status, 405);
  assert.equal((await f.call('PATCH', '{broken')).status, 400);
  assert.equal((await f.call('POST', 'null')).status, 400);
  assert.equal((await f.call('POST', { message: 'short' })).status, 400);
  assert.equal((await f.call('PATCH', { newDashboardPassword: 'short' })).status, 400);
  assert.deepEqual(await f.saved(), before, 'rejected requests do not persist changes');
  const response = await f.call();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.parish.parishId, 'a');
  assert.equal(body.parish.subscriptionMonthlyCents, 7900);
  assert.equal(body.parish.directoryEnabled, false);
  assert.equal(body.parish.parishLifeAvailable, true);
  assert.equal(body.parish.parishPricingUsage.trackingAvailable, false);
  assert.equal(body.accountingCatalogConnected, false);
  assert.ok(body.parish.onboarding);
  assert.doesNotMatch(JSON.stringify(body), /private-legacy-token|tokenHash|sessionSalt|parishDashboardSessions/);
  const savedResponse = await f.call('PATCH', {
    parishName: ' New A ',
    timezone: 'not/a-zone',
    patronalFeastDate: '2026-06-15',
    sacramentPriests: [
      {
        name: ' Priest ',
        email: ' priest@example.test ',
        serviceTypes: ['wedding', 'unknown', 'wedding'],
        customServices: [{ id: ' House Blessing! ', label: ' Bless house ', mode: 'schedule' }],
      },
    ],
  });
  assert.equal(savedResponse.status, 200);
  const saved = await f.saved();
  assert.equal(saved.parishName, 'New A');
  assert.equal(saved.timezone, '');
  assert.equal(saved.patronalFeastDate, '06-15');
  assert.deepEqual(saved.sacramentPriests[0], {
    name: 'Priest',
    email: 'priest@example.test',
    serviceTypes: ['wedding'],
    customServices: [{ id: 'houseblessing', label: 'Bless house', mode: 'schedule' }],
  });
  assert.equal(saved.taxLegalName, before.taxLegalName);
  assert.deepEqual(saved.funds, before.funds);
  const calendarBefore = await f.saved();
  assert.equal((await f.call('PATCH', { koinoniaCalendarUrl: 'http://127.0.0.1/private' })).status, 422);
  assert.deepEqual(await f.saved(), calendarBefore);

  const starter = await fixture({ subscriptionTier: 'starter' });
  assert.equal((await starter.call('PATCH', { campaigns: [] })).status, 403);
  assert.equal((await starter.call('PATCH', { funds: [] })).status, 422);
  const reserved = await fixture({ communityType: 'business' });
  assert.equal((await reserved.call('PATCH', { funds: [] })).status, 403);
  const onboarding = await fixture({ onboardingWorkflowVersion: 1, onboardingState: 'CONFIGURING' });
  assert.equal((await onboarding.call('PATCH', { givingStatus: 'active' })).status, 409);
  assert.equal((await onboarding.saved()).givingStatus, 'hidden');

  const linked = await fixture({
    funds: [{ id: 'general', name: 'General Operating Fund', accountingFundId: 'fund_general' }],
  });
  const linkedBefore = await linked.saved();
  const unavailable = await linked.call('PATCH', { funds: [{ ...linkedBefore.funds[0], name: 'Changed' }] });
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).error, 'accounting_catalog_unavailable');
  assert.deepEqual(await linked.saved(), linkedBefore, 'failed Accounting sync prevents registration persistence');
  const preserved = await linked.call('PATCH', {
    funds: [{ ...linkedBefore.funds[0], name: 'Ignored' }],
    givingCatalogChanged: false,
  });
  assert.equal(preserved.status, 200);
  assert.deepEqual((await linked.saved()).funds, linkedBefore.funds);

  const password = await fixture({ parishDashboardToken: 'old-token' });
  const rotation = await password.call('PATCH', { newDashboardPassword: 'new-test-password-123' });
  assert.equal(rotation.status, 200);
  const rotated = await rotation.json();
  assert.ok(rotated.token);
  assert.equal((await password.call('GET', undefined, password.session.token)).status, 401);
  assert.equal((await password.call('GET', undefined, rotated.token)).status, 200);
  const secured = await password.saved();
  assert.equal(await verifyParishDashboardPassword(secured, 'new-test-password-123'), true);
  assert.equal(secured.parishDashboardToken, '');
  assert.equal(secured.parishDashboardSessions.length, 1);
  assert.equal(secured.parishDashboardSessions[0].mfaVerifiedAt, '', 'new session does not inherit MFA assurance');

  const interest = await fixture({ subscriptionTier: 'starter' });
  for (const featureId of ['ministry-service', 'pledge-tracker', 'giving-plus', 'unknown'])
    await recordParishFeatureRequest(interest.env, { parishId: 'a', featureId, donorEmail: 'person@example.test' });
  assert.deepEqual((await (await interest.call()).json()).featureRequests.map((item) => item.featureId).sort(), [
    'giving-plus',
    'ministry-service',
    'pledge-tracker',
  ]);
  const dismiss = (method, token, feature) =>
    dashboard.handleParishFeatureRequestDismiss(
      new Request('https://example.test/dismiss', { method, headers: { authorization: `Bearer ${token}` } }),
      interest.env,
      'a',
      feature
    );
  assert.equal((await dismiss('GET', interest.session.token, 'giving-plus')).status, 405);
  assert.equal((await dismiss('POST', 'wrong', 'giving-plus')).status, 401);
  assert.equal((await dismiss('POST', interest.session.token, 'unknown')).status, 404);
  assert.equal((await dismiss('POST', interest.session.token, 'giving-plus')).status, 200);
  assert.equal(
    (await (await interest.call()).json()).featureRequests.some((item) => item.featureId === 'giving-plus'),
    false
  );

  assert.equal(
    dashboard.givingCatalogChanged(
      { campaigns: [{ id: 'a', goalCents: 0, coverPhotoUrl: '', giftCount: 12, visibility: { current: true } }] },
      { campaigns: [{ id: 'a' }] }
    ),
    false
  );
  assert.equal(
    dashboard.givingCatalogChanged({ campaigns: [{ id: 'a', name: 'changed' }] }, { campaigns: [{ id: 'a' }] }),
    true
  );
  assert.equal(dashboard.normalizeSacramentPriests({ priestFirst: 'First', priestLast: 'Last' })[0].name, 'First Last');
  const charge = {
    id: 'ch_1',
    metadata: { agapay_payment_class: 'qualifying_donation' },
    status: 'succeeded',
    paid: true,
    created: Date.UTC(new Date().getUTCFullYear(), 0, 15) / 1000,
    amount: 10000,
    balance_transaction: { fee: 300, net: 9700 },
    billing_details: { email: 'a@example.test' },
  };
  const summary = dashboard.summarizeCharges([charge, { ...charge, id: 'ch_failed', status: 'failed' }]);
  assert.equal(summary.ytdCents, 9700);
  assert.equal(summary.giftCount, 1);
  assert.equal(summary.monthly[0].amountCents, 9700);
  assert.equal(summary.feesAbsorbedCents, 300);
  console.log('Dashboard handler TypeScript regressions passed.');
} finally {
  globalThis.fetch = originalFetch;
}
