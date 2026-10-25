import { includesJavaScriptFragment } from './lib/javascript-source-contract.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const attachmentBytes = Buffer.from('synthetic attachment');
const attachmentMetadata = {
  id: 'existing-attachment',
  storageStatus: 'stored',
  sizeBytes: attachmentBytes.length,
  sha256Hex: createHash('sha256').update(attachmentBytes).digest('hex'),
  mimeType: 'image/png',
};
import { runAccountingHealth } from './accounting-health-live.mjs';
import { ACCOUNTING_READ_SMOKE_PATHS } from './lib/accounting-release-gates.mjs';
import { readFile } from 'node:fs/promises';
import { accountingHealthTotp } from './lib/accounting-health-totp.mjs';

const root = '/api/parish/dashboard/test-lubbock';
const env = {
  TEST_LUBBOCK_PARISH_PASSWORD: 'fixture-password',
  TEST_LUBBOCK_STAFF_PROFILE_ID: 'fixture-profile',
  TEST_LUBBOCK_STAFF_PIN: '123456',
};
const now = new Date('2026-08-31T12:00:00Z');

async function run({
  credentials = env,
  override = () => undefined,
  allowRecovery = false,
  requireAttachments = false,
} = {}) {
  const requests = [];
  const evidence = await runAccountingHealth({
    env: credentials,
    now,
    allowRecovery,
    requireAttachments,
    fetchImpl: async (url, options) => {
      const parsed = new URL(url);
      assert.equal(parsed.origin, 'https://agapay.app');
      const path = parsed.pathname;
      assert.ok(path === '/api/health' || path === '/api/mfa/verify' || path.startsWith(`${root}/`));
      assert.equal(options.redirect, 'error', 'Do not follow a redirect with credentials.');
      requests.push({ path, method: options.method });
      if (options.method !== 'GET') {
        assert.equal(options.method, 'POST');
        assert.ok(
          [`${root}/session`, `${root}/accounting-access/verify`, '/api/mfa/verify'].includes(path),
          'Only authentication can write.'
        );
      }
      const replacement = await override(path, options);
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
    credentials.TEST_LUBBOCK_TOTP_SECRET || 'never-print-totp',
    credentials.TEST_LUBBOCK_RECOVERY_CODE || 'never-print-recovery-code',
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
assert.ok(includesJavaScriptFragment(reportsSource, `path === "${reportPath}"`));
const attached = await run({
  override: (path, options) => {
    if (path.endsWith('/payables/bills')) return Response.json({ ok: true, bills: [{ id: 'existing-bill' }] });
    if (path.endsWith('/download'))
      return new Response(attachmentBytes, {
        headers: {
          'content-type': 'image/png',
          'content-disposition': 'attachment; filename=fixture.png',
          'cache-control': 'private, no-store',
        },
      });
    if (path.endsWith('/attachments')) {
      assert.equal(options.method, 'GET');
      return Response.json({ ok: true, attachments: [attachmentMetadata] });
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
// RFC 6238 SHA-1 vector at 59 seconds, truncated to AGAPAY's six digits.
const setupKey = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
assert.equal(accountingHealthTotp(setupKey, 59_000), '287082');
assert.throws(() => accountingHealthTotp('not-a-setup-key'), /Invalid/);
const mfaCredentials = { ...env, TEST_LUBBOCK_TOTP_SECRET: setupKey };
const challenge = { mfaRequired: true, pendingToken: 'private-pending-mfa-token', methods: ['totp'] };
const mfaSuccess = await run({
  credentials: mfaCredentials,
  override: (path, options) => {
    if (path.endsWith('/session')) return Response.json(challenge);
    if (path === '/api/mfa/verify') {
      const body = JSON.parse(options.body);
      assert.equal(body.pendingToken, challenge.pendingToken);
      assert.equal(body.method, 'totp');
      assert.match(body.code, /^\d{6}$/);
      return Response.json({ token: 'private-parish-token' });
    }
  },
});
assert.equal(mfaSuccess.evidence.status, 'passed');
assert.equal(mfaSuccess.evidence.authentication, 'password_and_totp');
const mfaRejected = await run({
  credentials: mfaCredentials,
  override: (path) => {
    if (path.endsWith('/session')) return Response.json(challenge);
    if (path === '/api/mfa/verify') return Response.json({ error: 'Invalid code' }, { status: 401 });
  },
});
assert.equal(mfaRejected.evidence.status, 'blocked_parish_mfa');
assert.equal(mfaRejected.requests.length, 3, 'Rejected MFA stops before reading financial data, without retrying.');
const sessionCredentials = {
  ...env,
  TEST_LUBBOCK_PARISH_PASSWORD: '',
  TEST_LUBBOCK_PARISH_SESSION: 'private-mfa-session',
};
const recoveryCredentials = { ...env, TEST_LUBBOCK_RECOVERY_CODE: 'single-use-fixture-recovery-code' };
const recoveryOverride = (path, options) => {
  if (path.endsWith('/session')) return Response.json({ ...challenge, methods: ['recovery'] });
  if (path === '/api/mfa/verify') {
    const body = JSON.parse(options.body);
    assert.equal(body.method, 'recovery');
    assert.equal(body.code, recoveryCredentials.TEST_LUBBOCK_RECOVERY_CODE);
    return Response.json({ token: 'private-parish-token' });
  }
};
const noRecoveryOptIn = await run({ credentials: recoveryCredentials, override: recoveryOverride });
assert.equal(noRecoveryOptIn.evidence.status, 'blocked_parish_mfa');
assert.equal(noRecoveryOptIn.requests.length, 2, 'Recovery codes must never be consumed automatically.');
const recovery = await run({ credentials: recoveryCredentials, override: recoveryOverride, allowRecovery: true });
assert.equal(recovery.evidence.status, 'passed');
assert.equal(recovery.evidence.authentication, 'password_and_recovery');
assert.equal(recovery.requests.filter((r) => r.path === '/api/mfa/verify').length, 1);
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

assert.equal(
  (await run({ requireAttachments: true })).evidence.status,
  'failed',
  'Production must fail if no bill is available for attachment coverage.'
);
for (const defect of ['empty', 'corrupt', 'missing', 'public-cache']) {
  const result = await run({
    override: (path) => {
      if (path.endsWith('/payables/bills')) return Response.json({ ok: true, bills: [{ id: 'existing-bill' }] });
      if (path.endsWith('/attachments'))
        return Response.json({ ok: true, attachments: defect === 'empty' ? [] : [attachmentMetadata] });
      if (path.endsWith('/download'))
        return new Response(defect === 'corrupt' ? 'corrupt' : attachmentBytes, {
          status: defect === 'missing' ? 404 : 200,
          headers: {
            'content-type': 'image/png',
            'content-disposition': 'attachment; filename=fixture.png',
            'cache-control': defect === 'public-cache' ? 'public' : 'private, no-store',
          },
        });
    },
  });
  assert.equal(result.evidence.status, 'failed', defect + ' must not pass attachment content smoke');
}
assert.equal(attached.evidence.checks.find((c) => c.name === 'accounting-attachment-download').passed, true);
console.log('PASS - attachment content, metadata hash, download failure, private cache headers, and required coverage');

let activeReads = 0;
let peakReads = 0;
const concurrent = await run({
  override: async (path, options) => {
    if (!path.includes('/accounting/')) return undefined;
    assert.equal(options.method, 'GET', 'Only independent financial reads may overlap.');
    activeReads += 1;
    peakReads = Math.max(peakReads, activeReads);
    await new Promise((resolve) => setTimeout(resolve, 5));
    activeReads -= 1;
    if (path.endsWith('/payables/bills')) return Response.json({ ok: true, bills: [] });
    if (path.endsWith('/governance/health'))
      return Response.json({ ok: true, health: { status: 'healthy', protectiveState: { state: 'normal' } } });
    return Response.json({ ok: true });
  },
});
assert.equal(concurrent.evidence.status, 'passed');
assert.equal(peakReads, 3, 'Financial reads must overlap with a concurrency limit of three.');
assert.equal(activeReads, 0, 'All reads must finish before reporting success.');

let activePrereads = 0;
let peakPrereads = 0;
let reconciliationReads = 0;
const overlappingPrereads = await run({
  override: async (path, options) => {
    if (options.method === 'POST')
      assert.equal(activePrereads, 0, 'Never overlap authentication with prerequisite reads');
    if (!path.endsWith('/reconciliation') && !path.endsWith('/profiles')) return undefined;
    activePrereads += 1;
    peakPrereads = Math.max(peakPrereads, activePrereads);
    await new Promise((resolve) => setTimeout(resolve, 5));
    activePrereads -= 1;
    if (path.endsWith('/profiles'))
      return Response.json({ accounting: { ready: true }, profiles: [{ id: env.TEST_LUBBOCK_STAFF_PROFILE_ID }] });
    reconciliationReads += 1;
    return Response.json({
      parishId: 'test-lubbock',
      available: true,
      summary: { payoutCount: 0, depositedCents: 0 },
      transactions: [],
    });
  },
});
assert.equal(overlappingPrereads.evidence.status, 'passed');
assert.equal(peakPrereads, 3, 'Fast/full reconciliation and readiness should overlap');
assert.equal(reconciliationReads, 2, 'Both reconciliation contracts remain covered');
assert.equal(activePrereads, 0);

let reconciliationAttempt = 0;
const failedPreread = await run({
  override: (path) => {
    if (path.endsWith('/reconciliation') && ++reconciliationAttempt === 1) throw new Error('synthetic network failure');
    return undefined;
  },
});
assert.equal(failedPreread.evidence.status, 'failed', 'An overlapping read failure must fail the health check');
assert.equal(reconciliationAttempt, 2, 'A failing read must not cancel independent coverage');
assert.ok(failedPreread.evidence.checks.some((check) => check.name === 'accounting-attachment-records'));

const deployWorkflow = await readFile(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const smokeJob = deployWorkflow.slice(deployWorkflow.indexOf('  post-deploy-accounting-smoke:'));
assert.match(smokeJob, /node scripts\/prelaunch-checks\.mjs --live-only/);
assert.doesNotMatch(smokeJob, /npm ci|cache: npm/);
const { testGroups } = await import('./test-manifest.mjs');
assert.ok(testGroups.all.includes('scripts/prelaunch-checks.mjs'), 'Source prelaunch coverage must run before deploy.');
console.log('PASS - bounded concurrent reads, complete evidence, and dependency-free post-deploy workflow');

const liveOnly = spawnSync(
  process.execPath,
  [
    '--input-type=module',
    '-e',
    `
  import assert from 'node:assert/strict';
  import { registerHooks } from 'node:module';
  registerHooks({ resolve(specifier, context, next) {
    assert.ok(/^(node:|file:|\\.)/.test(specifier), 'Live smoke must not require installed packages: ' + specifier);
    return next(specifier, context);
  }});
  process.argv.push('--live-only');
  process.env.AGAPAY_BASE_URL = 'https://fixture.invalid';
  const routes = [];
  globalThis.fetch = async (url) => {
    routes.push(new URL(url).pathname);
    return new Response('AGAPAY', { status: 200 });
  };
  await import('./scripts/prelaunch-checks.mjs');
  assert.deepEqual(routes, ['/', '/give', '/marketplace', '/directory', '/onboarding', '/register', '/api/security/config']);
`,
  ],
  { encoding: 'utf8' }
);
assert.equal(liveOnly.status, 0, liveOnly.stderr);
console.log('PASS - live-only public checks retain all routes without third-party packages');
