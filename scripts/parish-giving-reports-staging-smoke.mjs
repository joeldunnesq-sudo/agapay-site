import { stagingParishSession } from './lib/staging-parish-session.mjs';
import assert from 'node:assert/strict';

import { baseUrlFrom, requiredEnvironment, writeArtifact } from './lib/accounting-release-gates.mjs';

const baseUrl = baseUrlFrom();
const target = new URL(baseUrl);
assert.ok(
  ['localhost', '127.0.0.1', '::1'].includes(target.hostname) || target.hostname.toLowerCase().includes('staging'),
  'Giving reports smoke is restricted to localhost or a hostname containing staging.'
);

const credentials = requiredEnvironment([
  'ACCOUNTING_GATE_PARISH_A_ID',
  'ACCOUNTING_GATE_PARISH_B_ID',
  'ACCOUNTING_GATE_USER_A_EMAIL',
  'ACCOUNTING_GATE_USER_A_PASSWORD',
]);
const parishId = credentials.ACCOUNTING_GATE_PARISH_A_ID;

async function requestJson(path, { method = 'GET', token = '', body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {}
  return { response, payload };
}

const token = await stagingParishSession({
  baseUrl,
  parishId,
  email: credentials.ACCOUNTING_GATE_USER_A_EMAIL,
  password: credentials.ACCOUNTING_GATE_USER_A_PASSWORD,
  totpSecret: process.env.ACCOUNTING_GATE_USER_A_TOTP_SECRET,
  label: 'Giving reports staging parish A',
});
const dashboardPath = `/api/parish/dashboard/${encodeURIComponent(parishId)}`;

const summary = await requestJson(`${dashboardPath}/giving-summary`, { token });
assert.equal(summary.response.status, 200, `Giving summary returned HTTP ${summary.response.status}.`);
assert.ok(summary.payload.summary, 'Giving summary should return a summary object.');
assert.ok(Array.isArray(summary.payload.summary.monthly), 'Giving summary should return monthly figures.');

const volume = await requestJson(`${dashboardPath}/stripe-volume`, { token });
assert.equal(volume.response.status, 200, `Stripe volume returned HTTP ${volume.response.status}.`);
assert.ok(volume.payload.volume, 'Stripe volume should return a volume object.');
assert.equal(typeof volume.payload.volume.donationPercent, 'number');
assert.ok(volume.payload.volume.scan, 'Stripe volume should return scan state.');

const history = await requestJson(`${dashboardPath}/giving-history`, { token });
assert.equal(history.response.status, 200, `Giving history returned HTTP ${history.response.status}.`);
assert.ok(Array.isArray(history.payload.gifts), 'Giving history should return a gifts array.');

const recurring = await requestJson(`${dashboardPath}/recurring-health`, { token });
assert.equal(recurring.response.status, 200, `Recurring health returned HTTP ${recurring.response.status}.`);
assert.ok(recurring.payload.health, 'Recurring health should return a health object.');
assert.ok(Array.isArray(recurring.payload.health.rows), 'Recurring health should return health rows.');

const attendance = await requestJson(`${dashboardPath}/stewardship/attendance?weeks=13`, { token });
assert.equal(attendance.response.status, 200, `Attendance trend returned HTTP ${attendance.response.status}.`);
assert.equal(
  attendance.payload.points?.length,
  13,
  'Attendance trend should preserve all 13 Sunday slots, including gaps.'
);
assert.ok(attendance.payload.summary, 'Attendance trend should include its parish summary.');

const invalidAttendance = await requestJson(`${dashboardPath}/stewardship/attendance`, {
  method: 'PATCH',
  token,
  body: { weekOf: '2026-08-31', headcount: 42 },
});
assert.equal(invalidAttendance.response.status, 400, 'A non-Sunday attendance correction should fail without writing.');

assert.equal(invalidAttendance.payload.error, 'Week must be a valid Sunday.');

const currentDelegateId = attendance.payload.delegate?.ministryId || null;
const delegation = await requestJson(`${dashboardPath}/stewardship/attendance/delegation`, {
  method: 'PATCH',
  token,
  body: { ministryId: currentDelegateId },
});
assert.equal(delegation.response.status, 200, `Attendance delegation returned HTTP ${delegation.response.status}.`);
assert.equal(
  delegation.payload.delegate?.ministryId || null,
  currentDelegateId,
  'The no-op delegation save should preserve the current delegate.'
);

const crossParishAttendance = await requestJson(
  `/api/parish/dashboard/${encodeURIComponent(credentials.ACCOUNTING_GATE_PARISH_B_ID)}/stewardship/attendance?weeks=13`,
  { token }
);
assert.equal(crossParishAttendance.response.status, 401, 'A Parish A bearer must not read Parish B attendance.');

// Exercise the migrated SQL helpers through authenticated deployed routes.
const year = new Date().getUTCFullYear();
const stewardshipChecks = [];
for (const endpoint of ['summary', 'recurring', 'health-score']) {
  const path = `/stewardship/giving/${endpoint}?year=${year}`;
  const own = await requestJson(dashboardPath + path, { token });
  assert.equal(own.response.status, 200, `Stewardship ${endpoint} returned HTTP ${own.response.status}.`);
  assert.equal(own.payload.fiscal_year, year);
  const fields =
    endpoint === 'summary'
      ? ['total_actual_cents', 'manual_income_cents', 'prior_year_actual_cents']
      : endpoint === 'recurring'
        ? ['recurring_donor_count', 'monthly_recurring_revenue_cents']
        : [];
  for (const field of fields) assert.ok(Number.isFinite(own.payload[field]), `Invalid ${endpoint}.${field}`);
  if (endpoint === 'health-score') {
    const fees = own.payload.processing_fees;
    assert.equal(fees?.year, year);
    assert.equal(fees.currency, 'USD');
    assert.equal(fees.monthly.length, 12);
    assert.equal(fees.quarterly.length, 4);
    for (const key of [
      'giftCount',
      'actualStripeFeeCents',
      'donorFundedStripeFeeCents',
      'parishFundedStripeFeeCents',
    ]) {
      assert.ok(Number.isFinite(fees.annual[key]), `Invalid annual fee field: ${key}`);
      assert.equal(
        fees.annual[key],
        fees.monthly.reduce((sum, row) => sum + row[key], 0)
      );
      assert.equal(
        fees.annual[key],
        fees.quarterly.reduce((sum, row) => sum + row[key], 0)
      );
    }
  }
  assert.ok(own.response.headers.get('x-request-id'), 'Request diagnostics must reach deployed responses.');
  const anonymous = await requestJson(dashboardPath + path);
  assert.equal(anonymous.response.status, 401, 'Anonymous report access must be denied.');
  const foreign = await requestJson(
    `/api/parish/dashboard/${encodeURIComponent(credentials.ACCOUNTING_GATE_PARISH_B_ID)}${path}`,
    { token }
  );
  assert.equal(foreign.response.status, 401, 'Parish A must not read Parish B reports.');
  stewardshipChecks.push({
    endpoint,
    status: own.response.status,
    anonymousStatus: anonymous.response.status,
    crossParishStatus: foreign.response.status,
  });
}

// Read-only acceptance for the typed fund report and CSV presentation path.
const weeklyPath = '/giving-summary?view=weekly-funds';
const weekly = await requestJson(dashboardPath + weeklyPath, { token });
assert.equal(weekly.response.status, 200);
const funds = weekly.payload.weeklyFunds;
assert.equal(funds?.available, true, 'Weekly fund report must be available.');
assert.equal(funds.complete, true, 'Partial weekly totals must not pass acceptance.');
assert.equal(funds.period.month, null);
assert.equal(funds.currency, 'usd');
assert.equal(funds.basis, 'gift_date_before_refunds');
for (const [total, field] of [
  ['grossGiftCents', 'grossCents'],
  ['parishNetCents', 'netCents'],
  ['feeCents', 'feeCents'],
  ['giftCount', 'transactionCount'],
]) {
  assert.ok(Number.isFinite(funds[total]));
  assert.equal(
    funds[total],
    funds.allocations.reduce((sum, row) => sum + row[field], 0)
  );
}
const exportMonth = new Date().toISOString().slice(0, 7);
const csvPath = '/giving-history?format=csv&month=' + exportMonth + '&groupBy=giver';
const exported = await fetch(baseUrl + dashboardPath + csvPath, {
  headers: { authorization: 'Bearer ' + token },
  redirect: 'error',
  signal: AbortSignal.timeout(30000),
});
assert.equal(exported.status, 200, 'Monthly CSV must be available.');
assert.match(exported.headers.get('content-type'), /^text\/csv/i);
assert.match(exported.headers.get('content-disposition'), /^attachment;/i);
assert.match(exported.headers.get('cache-control'), /private/);
assert.match(exported.headers.get('cache-control'), /no-store/);
assert.equal(exported.headers.get('vary'), 'Authorization');
const exportCount = exported.headers.get('x-agapay-export-rows');
assert.match(exportCount, /^\d+$/);
assert.ok(Number(exportCount) <= 25000);
const exportBytes = new Uint8Array(await exported.arrayBuffer());
assert.deepEqual([...exportBytes.slice(0, 3)], [239, 187, 191], 'CSV must retain its UTF-8 BOM.');
const exportText = new TextDecoder().decode(exportBytes);
assert.ok(exportText.startsWith('"Giving date","Parish timezone","Paid timestamp UTC"'));
assert.ok(exportText.endsWith('\r\n'));
const financialPath = '/stewardship/report/monthly-financial?month=' + exportMonth;
const financial = await fetch(baseUrl + dashboardPath + financialPath, {
  headers: { authorization: 'Bearer ' + token },
  redirect: 'error',
  signal: AbortSignal.timeout(30000),
});
assert.equal(financial.status, 200, 'Monthly financial report must be available.');
assert.match(financial.headers.get('content-type'), /^text\/html/i);
assert.match(financial.headers.get('cache-control'), /no-store/);
const financialHtml = await financial.text();
assert.ok(financialHtml.includes('Monthly Financial Report'));
assert.ok(financialHtml.includes('Live from Accounting'));
assert.ok(financialHtml.includes('Processing &amp; platform expenses'));
assert.ok(financialHtml.includes('Every gift. Every fee.'));
const reportingAccessChecks = [];
for (const path of [weeklyPath, csvPath, financialPath]) {
  const anonymous = await requestJson(dashboardPath + path);
  assert.equal(anonymous.response.status, 401);
  const foreign = await requestJson(
    '/api/parish/dashboard/' + encodeURIComponent(credentials.ACCOUNTING_GATE_PARISH_B_ID) + path,
    { token }
  );
  assert.equal(foreign.response.status, 401);
  reportingAccessChecks.push({
    path,
    anonymousStatus: anonymous.response.status,
    crossParishStatus: foreign.response.status,
  });
}
const invalidExport = await requestJson(dashboardPath + '/giving-history?format=csv&month=invalid', { token });
assert.equal(invalidExport.response.status, 422);

const evidence = {
  weeklyFunds: { status: weekly.response.status, complete: funds.complete, giftCount: funds.giftCount },
  monthlyCsv: {
    status: exported.status,
    month: exportMonth,
    rowCount: Number(exportCount),
    invalidMonthStatus: invalidExport.response.status,
  },
  financialReport: { status: financial.status, month: exportMonth, accounting: true, feeSection: true },
  reportingAccessChecks,
  target: baseUrl,
  parishId,
  summary: {
    dataSource: summary.payload.summary.dataSource,
    giftCount: summary.payload.summary.giftCount,
    ytdCents: summary.payload.summary.ytdCents,
  },
  volume: {
    connected: volume.payload.volume.connected,
    donationPercent: volume.payload.volume.donationPercent,
    totalNetCents: volume.payload.volume.totalNetCents,
    scanStatus: volume.payload.volume.scan.status,
  },
  historyCount: history.payload.gifts.length,
  stewardshipChecks,
  recurring: {
    activeCount: recurring.payload.health.activeCount,
    failedThisMonthCount: recurring.payload.health.failedThisMonthCount,
    lapsedCount: recurring.payload.health.lapsedCount,
  },
  attendance: {
    weeksReturned: attendance.payload.points.length,
    weeksReported: attendance.payload.summary.weeksReported,
    currentDelegateId,
    invalidCorrectionStatus: invalidAttendance.response.status,
    crossParishStatus: crossParishAttendance.response.status,
  },
  verifiedAt: new Date().toISOString(),
};
await writeArtifact('artifacts/parish-giving-reports-staging-smoke.json', evidence);
console.log(
  `PASS - giving summary, Stripe volume, giving history (${evidence.historyCount} gifts), ` +
    'recurring-giving health, and parish attendance authorization'
);
