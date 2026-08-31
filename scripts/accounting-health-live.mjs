import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { ACCOUNTING_READ_SMOKE_PATHS } from './lib/accounting-release-gates.mjs';

// Deliberately separate from staging's mutating release gates. Only login and
// PIN verification may POST; all financial requests are GETs to this parish.
const baseUrl = 'https://agapay.app';
const parishId = 'test-lubbock';
const root = `/api/parish/dashboard/${parishId}`;
const secretNames = ['TEST_LUBBOCK_STAFF_PROFILE_ID', 'TEST_LUBBOCK_STAFF_PIN'];
const reads = new Set([
  '/api/health',
  `${root}/payout-diagnostics`,
  `${root}/accounting-access/profiles`,
  `${root}/accounting/payables/bills`,
  ...ACCOUNTING_READ_SMOKE_PATHS.map(([, suffix]) => `${root}/accounting${suffix}`),
]);

export async function runAccountingHealth({ env = process.env, fetchImpl = fetch, now = new Date() } = {}) {
  const suppliedSession = String(env.TEST_LUBBOCK_PARISH_SESSION || '').trim();
  const required = suppliedSession ? secretNames : ['TEST_LUBBOCK_PARISH_PASSWORD', ...secretNames];
  const evidence = {
    generatedAt: now.toISOString(),
    baseUrl,
    parishId,
    status: 'running',
    checks: [],
    scope:
      'Read-only financial checks; authentication creates sessions and audit records. No payments, closes, imports, or new integrity scans.',
    authentication: suppliedSession ? 'existing_mfa_session' : 'password',
    missing: required.filter((name) => !String(env[name] || '').trim()),
  };
  let token = '';
  let staffHeaders = {};
  let attachmentPath = null;
  async function request(path, body) {
    const login = path === `${root}/session` || path === `${root}/accounting-access/verify`;
    const reconciliation = new RegExp(`^${root}/reconciliation\\?month=\\d{4}-(0[1-9]|1[0-2])(&detail=full)?$`).test(
      path
    );
    if (body !== undefined ? !login : !reads.has(path) && !reconciliation && path !== attachmentPath) {
      throw new Error('Request is outside the production health-check allowlist.');
    }
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(60_000),
      headers: {
        accept: 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...staffHeaders,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      /* Record a contract failure without logging bodies. */
    }
    return { status: response.status, payload };
  }
  async function check(name, path, validate, body) {
    try {
      const result = await request(path, body);
      const passed = result.status === 200 && Boolean(validate(result.payload));
      // Whitelist diagnostic codes; never retain the MFA challenge, methods,
      // pending token, recovery codes, or any raw response body.
      const reason =
        result.payload?.mfaRequired === true
          ? 'mfa_required'
          : ['mfa_relogin_required', 'mfa_step_up_required'].includes(result.payload?.code)
            ? result.payload.code
            : null;
      evidence.checks.push({ name, status: result.status, passed, ...(reason ? { reason } : {}) });
      return passed ? result.payload : null;
    } catch {
      evidence.checks.push({ name, status: 0, passed: false });
      return null;
    }
  }
  await check(
    'public-health',
    '/api/health',
    (p) => p?.ok === true && p?.checks?.d1?.ok === true && p?.checks?.kv?.ok === true
  );
  if (evidence.missing.length) return { ...evidence, status: 'blocked_missing_credentials' };
  if (suppliedSession) {
    token = suppliedSession;
    // The application's existing authorization and MFA checks validate the
    // session. Never mint a token or fall back to password authentication.
    const session = await check(
      'parish-session',
      `${root}/accounting-access/profiles`,
      (p) => p?.accounting && Array.isArray(p.profiles)
    );
    if (!session) return { ...evidence, status: 'blocked_parish_session' };
  } else {
    const login = await check(
      'parish-login',
      `${root}/session`,
      (p) => p?.mfaRequired !== true && typeof p?.token === 'string' && p.token.length > 0,
      { password: env.TEST_LUBBOCK_PARISH_PASSWORD }
    );
    if (!login)
      return {
        ...evidence,
        status: evidence.checks.at(-1)?.reason === 'mfa_required' ? 'blocked_parish_mfa' : 'blocked_parish_login',
      };
    token = login.token;
  }

  const diagnostics = await check(
    'stripe-payout-diagnostics',
    `${root}/payout-diagnostics`,
    (p) =>
      p?.parishId === parishId &&
      p.payoutsRequest?.ok === true &&
      p.balanceTransactionsRequest?.ok === true &&
      Array.isArray(p.payouts)
  );
  const payout = diagnostics?.payouts[0];
  const timestamp = Number(payout?.arrivalDate || payout?.created || 0) * 1000;
  const month =
    timestamp > 0 && Number.isFinite(timestamp)
      ? new Date(timestamp).toISOString().slice(0, 7)
      : now.toISOString().slice(0, 7);
  evidence.reconciliationMonth = month;
  evidence.payoutHistory = diagnostics
    ? diagnostics.payouts.length
      ? 'present'
      : 'empty_no_payout_history_coverage'
    : 'unavailable';
  const fast = await check(
    'reconciliation-fast',
    `${root}/reconciliation?month=${month}`,
    (p) => p?.parishId === parishId && p.available === true && Number.isInteger(p.summary?.payoutCount)
  );
  const full = await check(
    'reconciliation-full',
    `${root}/reconciliation?month=${month}&detail=full`,
    (p) =>
      p?.parishId === parishId &&
      p.available === true &&
      Number.isInteger(p.summary?.payoutCount) &&
      Array.isArray(p.transactions)
  );
  if (fast && full)
    evidence.checks.push({
      name: 'reconciliation-summary-consistency',
      passed:
        fast.summary.payoutCount === full.summary.payoutCount &&
        fast.summary.depositedCents === full.summary.depositedCents,
    });

  const profiles = await check(
    'accounting-readiness',
    `${root}/accounting-access/profiles`,
    (p) => p?.accounting?.ready === true && Array.isArray(p.profiles)
  );
  if (!profiles || !profiles.profiles.some((p) => p.id === env.TEST_LUBBOCK_STAFF_PROFILE_ID)) {
    return { ...evidence, status: 'blocked_accounting_profile_or_readiness' };
  }
  const staff = await check(
    'accounting-staff-login',
    `${root}/accounting-access/verify`,
    (p) =>
      p?.ok === true &&
      p.profile?.id === env.TEST_LUBBOCK_STAFF_PROFILE_ID &&
      typeof p.token === 'string' &&
      p.token.length > 0,
    { profileId: env.TEST_LUBBOCK_STAFF_PROFILE_ID, pin: env.TEST_LUBBOCK_STAFF_PIN }
  );
  if (!staff)
    return {
      ...evidence,
      status:
        evidence.checks.at(-1)?.reason === 'mfa_step_up_required' ? 'blocked_staff_mfa_refresh' : 'blocked_staff_login',
    };
  staffHeaders = { 'X-AGAPAY-Accounting-Profile': staff.profile.id, 'X-AGAPAY-Accounting-Token': staff.token };
  for (const [section, suffix] of ACCOUNTING_READ_SMOKE_PATHS) {
    if (section === 'attachments') {
      const bills = await check(
        'accounting-attachment-records',
        `${root}/accounting/payables/bills`,
        (p) => p?.ok === true && Array.isArray(p.bills)
      );
      if (!bills) continue;
      const bill = bills.bills.find((item) => typeof item.id === 'string' && item.id.trim());
      if (!bill) {
        evidence.checks.push({
          name: 'accounting-attachments',
          passed: null,
          skipped: true,
          reason: 'no_existing_bill',
        });
        continue;
      }
      attachmentPath = `${root}/accounting/attachments?entityType=bill&entityId=${encodeURIComponent(bill.id)}`;
      await check('accounting-attachments', attachmentPath, (p) => p?.ok === true && Array.isArray(p.attachments));
      continue;
    }
    const payload = await check(
      `accounting-${section}`,
      `${root}/accounting${suffix}`,
      (p) => p !== null && typeof p === 'object' && !Array.isArray(p) && !p.error && p.ok !== false
    );
    if (section === 'governance' && payload) {
      evidence.checks.push({
        name: 'accounting-health-state',
        passed: payload.health?.status === 'healthy' && payload.health?.protectiveState?.state === 'normal',
      });
      evidence.integrityScanRecorded = Boolean(payload.health?.latestScan);
    }
  }
  return { ...evidence, status: evidence.checks.every((c) => c.passed || c.skipped) ? 'passed' : 'failed' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const evidence = await runAccountingHealth();
  await mkdir('artifacts/accounting-health', { recursive: true });
  await writeFile('artifacts/accounting-health/test-lubbock.json', `${JSON.stringify(evidence, null, 2)}\n`);
  for (const check of evidence.checks)
    console.log(
      `${check.skipped ? 'SKIP' : check.passed ? 'PASS' : 'FAIL'} - ${check.name}${check.skipped ? ` (${check.reason})` : ''}`
    );
  console.log(`Accounting health: ${evidence.status}`);
  if (evidence.missing.length) console.log(`Missing protected secrets: ${evidence.missing.join(', ')}`);
  if (evidence.status === 'blocked_parish_mfa')
    console.log('NOTICE - Password accepted; complete MFA and supply a fresh authenticated parish session.');
  if (evidence.status === 'blocked_parish_session' || evidence.status === 'blocked_staff_mfa_refresh')
    console.log(
      'NOTICE - The supplied session was rejected or needs fresh MFA. Sign in with MFA again; no fallback or retry was attempted.'
    );
  if (evidence.payoutHistory === 'empty_no_payout_history_coverage')
    console.log('NOTICE - No payout history; historical payout coverage remains unverified.');
  if (evidence.integrityScanRecorded === false)
    console.log('NOTICE - No prior integrity scan; this read-only check does not start one.');
  process.exitCode = evidence.status === 'passed' ? 0 : 1;
}
