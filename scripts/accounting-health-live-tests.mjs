import assert from 'node:assert/strict';
import { runAccountingHealth } from './accounting-health-live.mjs';
import { ACCOUNTING_READ_SMOKE_PATHS } from './lib/accounting-release-gates.mjs';
import { readFile } from 'node:fs/promises';

const root = '/api/parish/dashboard/test-lubbock';
const env = {
  TEST_LUBBOCK_PARISH_PASSWORD: 'fixture-password',
  TEST_LUBBOCK_STAFF_PROFILE_ID: 'fixture-profile',
  TEST_LUBBOCK_STAFF_PIN: '123456',
};
const now = new Date('2026-08-31T12:00:00Z');

async function run({ credentials = env, override = () => undefined } = {}) {
  const requests = [];
  const evidence = await runAccountingHealth({
    env: credentials,
    now,
    fetchImpl: async (url, options) => {
      const parsed = new URL(url);
      assert.equal(parsed.origin, 'https://agapay.app');
      const path = parsed.pathname;
      assert.ok(path === '/api/health' || path.startsWith(`${root}/`));
      assert.equal(options.redirect, 'error', 'Do not follow a redirect with credentials.');
      requests.push({ path, method: options.method });
      if (options.method !== 'GET') {
        assert.equal(options.method, 'POST');
        assert.ok(
          [`${root}/session`, `${root}/accounting-access/verify`].includes(path),
          'Only authentication can write.'
        );
      }
      const replacement = override(path, options);
      if (replacement) return replacement;
      let payload;
      if (path === '/api/health') payload = { ok: true, checks: { d1: { ok: true }, kv: { ok: true } } };
      else if (path.endsWith('/session')) payload = { token: 'private-parish-token' };
      else if (path.endsWith('/payout-diagnostics'))
        payload = {
          parishId: 'test-lubbock',
          payoutsRequest: { ok: true },
          balanceTransactionsRequest: { ok: true },
          payouts: [],
          matchedOfferings: [{ donorEmail: 'private@example.test', amountCents: 19000 }],
        };
      else if (path.endsWith('/reconciliation'))
        payload = {
          parishId: 'test-lubbock',
          available: true,
          summary: { payoutCount: 0, depositedCents: 0 },
          transactions: [],
        };
      else if (path.endsWith('/payables/bills')) payload = { ok: true, bills: [] };
      else if (path.endsWith('/profiles'))
        payload = { accounting: { ready: true }, profiles: [{ id: env.TEST_LUBBOCK_STAFF_PROFILE_ID }] };
      else if (path.endsWith('/verify'))
        payload = { ok: true, profile: { id: env.TEST_LUBBOCK_STAFF_PROFILE_ID }, token: 'private-staff-token' };
      else if (path.endsWith('/governance/health'))
        payload = { ok: true, health: { status: 'healthy', protectiveState: { state: 'normal' }, latestScan: null } };
      else payload = { ok: true };
      return Response.json(payload);
    },
  });
  const serialized = JSON.stringify(evidence);
  for (const secret of [
    ...Object.values(env),
    'private-mfa-session',
    'private-pending-mfa-token',
    'private-parish-token',
    'private-staff-token',
    'private@example.test',
    '19000',
  ])
    assert.ok(!serialized.includes(secret), 'Evidence must not contain credentials or financial records.');
  return { evidence, requests };
}

const healthy = await run();
assert.equal(healthy.evidence.status, 'passed');
assert.equal(healthy.evidence.payoutHistory, 'empty_no_payout_history_coverage');
assert.equal(healthy.evidence.integrityScanRecorded, false);
assert.equal(healthy.requests.filter((r) => r.method === 'POST').length, 2);
assert.equal(healthy.evidence.checks.filter((c) => c.name.startsWith('accounting-') && c.passed).length, 11);
assert.equal(healthy.evidence.checks.find((c) => c.name === 'accounting-attachments').reason, 'no_existing_bill');
assert.equal(
  healthy.requests.some((r) => r.path.endsWith('/attachments')),
  false,
  'Never query a fabricated bill or create one for a health check.'
);

// Check the production handler contracts, not just a permissive fetch fixture.
const ledgerSource = await readFile(new URL('../src/handlers/accounting-ledger.js', import.meta.url), 'utf8');
const reportsSource = await readFile(new URL('../src/handlers/accounting-setup-reports.js', import.meta.url), 'utf8');
assert.equal(ACCOUNTING_READ_SMOKE_PATHS.find(([name]) => name === 'ledger')[1], '/general-ledger');
assert.match(ledgerSource, /general-ledger\|account-registers\|fund-registers/);
const reportPath = ACCOUNTING_READ_SMOKE_PATHS.find(([name]) => name === 'reports')[1];
assert.ok(reportsSource.includes(`path === "${reportPath}"`));
const attached = await run({
  override: (path, options) => {
    if (path.endsWith('/payables/bills')) return Response.json({ ok: true, bills: [{ id: 'existing-bill' }] });
    if (path.endsWith('/attachments')) {
      assert.equal(options.method, 'GET');
      return Response.json({ ok: true, attachments: [] });
    }
  },
});
assert.equal(attached.evidence.status, 'passed');
assert.equal(attached.evidence.checks.find((c) => c.name === 'accounting-attachments').passed, true);
const missingAttachment = await run({
  override: (path) => {
    if (path.endsWith('/payables/bills')) return Response.json({ ok: true, bills: [{ id: 'existing-bill' }] });
    if (path.endsWith('/attachments')) return Response.json({ error: 'failure' }, { status: 400 });
  },
});
assert.equal(missingAttachment.evidence.status, 'failed', 'Do not suppress a real attachment read failure.');

const missing = await run({ credentials: {} });
assert.equal(missing.evidence.status, 'blocked_missing_credentials');
assert.equal(missing.requests.length, 1);
const mfa = await run({
  override: (path) =>
    path.endsWith('/session')
      ? Response.json({ mfaRequired: true, pendingToken: 'private-pending-mfa-token' })
      : undefined,
});
assert.equal(mfa.evidence.status, 'blocked_parish_mfa');
assert.equal(mfa.requests.length, 2, 'Never bypass MFA.');
const sessionCredentials = {
  ...env,
  TEST_LUBBOCK_PARISH_PASSWORD: '',
  TEST_LUBBOCK_PARISH_SESSION: 'private-mfa-session',
};
const session = await run({ credentials: sessionCredentials });
assert.equal(session.evidence.status, 'passed');
assert.equal(session.evidence.authentication, 'existing_mfa_session');
assert.equal(
  session.requests.some((r) => r.path.endsWith('/session')),
  false,
  'A verified session must not fall back to password login.'
);
assert.equal(
  session.requests.filter((r) => r.method === 'POST').length,
  1,
  'Only Accounting PIN verification posts when using an existing session.'
);
const rejectedSession = await run({
  credentials: sessionCredentials,
  override: (path) =>
    path.endsWith('/profiles') ? Response.json({ code: 'mfa_relogin_required' }, { status: 401 }) : undefined,
});
assert.equal(rejectedSession.evidence.status, 'blocked_parish_session');
assert.equal(
  rejectedSession.requests.length,
  2,
  'Rejected sessions must stop before any financial request or PIN attempt.'
);
const staleMfa = await run({
  credentials: sessionCredentials,
  override: (path) =>
    path.endsWith('/verify') ? Response.json({ code: 'mfa_step_up_required' }, { status: 428 }) : undefined,
});
assert.equal(staleMfa.evidence.status, 'blocked_staff_mfa_refresh');
assert.equal(staleMfa.requests.filter((r) => r.path.endsWith('/verify')).length, 1);
const pin = await run({
  override: (path) => (path.endsWith('/verify') ? Response.json({ error: 'bad PIN' }, { status: 401 }) : undefined),
});
assert.equal(pin.evidence.status, 'blocked_staff_login');
assert.equal(
  pin.requests.filter((r) => r.path.endsWith('/verify')).length,
  1,
  'Never retry a PIN and risk locking the profile.'
);
const stripe = await run({
  override: (path) =>
    path.endsWith('/payout-diagnostics') ? Response.json({ error: 'Stripe failure' }, { status: 502 }) : undefined,
});
assert.equal(stripe.evidence.status, 'failed');
const disconnected = await run({
  override: (path) => (path.endsWith('/payout-diagnostics') ? Response.json({ available: false }) : undefined),
});
assert.equal(disconnected.evidence.status, 'failed');
const protective = await run({
  override: (path) =>
    path.endsWith('/governance/health')
      ? Response.json({
          ok: true,
          health: { status: 'posting_blocked', protectiveState: { state: 'posting_blocked' } },
        })
      : undefined,
});
assert.equal(protective.evidence.status, 'failed');
const mismatch = await run({
  override: (path) =>
    path.endsWith('/reconciliation')
      ? Response.json({ parishId: 'other-parish', available: true, summary: { payoutCount: 0 }, transactions: [] })
      : undefined,
});
assert.equal(mismatch.evidence.status, 'failed');
console.log(
  'PASS - read-only production request boundary, secret redaction, missing credentials, MFA, PIN failure, Stripe failures, parish identity, and protective states'
);
