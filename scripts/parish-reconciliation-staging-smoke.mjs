import assert from 'node:assert/strict';
import { completeGateMfa, gateMfaSecretName, loginGateParish } from './lib/release-gate-mfa.mjs';

import { baseUrlFrom, requiredEnvironment, writeArtifact } from './lib/accounting-release-gates.mjs';

const baseUrl = baseUrlFrom();
const target = new URL(baseUrl);
assert.ok(
  ['localhost', '127.0.0.1', '::1'].includes(target.hostname) || target.hostname.toLowerCase().includes('staging'),
  'Reconciliation smoke is restricted to localhost or a hostname containing staging.'
);

const credentials = requiredEnvironment(['ACCOUNTING_GATE_PARISH_A_ID', 'ACCOUNTING_GATE_PARISH_A_PASSWORD']);
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

const login = await loginGateParish({
  baseUrl,
  parishId,
  parishPassword: credentials.ACCOUNTING_GATE_PARISH_A_PASSWORD,
});
assert.equal(login.response.status, 200, `Parish login returned HTTP ${login.response.status}.`);
login.payload = await completeGateMfa({
  baseUrl,
  payload: login.payload,
  secretName: gateMfaSecretName('PARISH', parishId),
});
assert.ok(login.payload.token, 'Parish login did not return a token.');

const diagnostics = await requestJson(`/api/parish/dashboard/${encodeURIComponent(parishId)}/payout-diagnostics`, {
  token: login.payload.token,
});
assert.equal(diagnostics.response.status, 200, `Payout diagnostics returned HTTP ${diagnostics.response.status}.`);
assert.ok(diagnostics.payload.payouts?.length > 0, 'Payout diagnostics should return a real test payout.');
const latestPayout =
  diagnostics.payload.payouts.find((payout) => payout.status === 'paid') || diagnostics.payload.payouts[0];
const payoutTimestamp = Number(latestPayout.arrivalDate || latestPayout.created || 0) * 1000;
assert.ok(payoutTimestamp > 0, 'Latest test payout should include an arrival or creation date.');
const month = new Date(payoutTimestamp).toISOString().slice(0, 7);

const reconciliationPath = `/api/parish/dashboard/${encodeURIComponent(parishId)}/reconciliation`;
const fast = await requestJson(`${reconciliationPath}?month=${encodeURIComponent(month)}`, {
  token: login.payload.token,
});
assert.equal(fast.response.status, 200, `Fast reconciliation returned HTTP ${fast.response.status}.`);
assert.equal(fast.payload.available, true, 'Fast reconciliation should be available.');
assert.ok(fast.payload.summary?.payoutCount > 0, 'Fast reconciliation should return a real test payout.');

const full = await requestJson(`${reconciliationPath}?month=${encodeURIComponent(month)}&detail=full`, {
  token: login.payload.token,
});
assert.equal(full.response.status, 200, `Full reconciliation returned HTTP ${full.response.status}.`);
assert.equal(full.payload.available, true, 'Full reconciliation should be available.');
assert.ok(Array.isArray(full.payload.transactions), 'Full reconciliation should return transactions.');
const proof = full.payload;
const evidence = {
  target: baseUrl,
  parishId,
  month,
  fast: { payoutCount: fast.payload.summary.payoutCount, depositedCents: fast.payload.summary.depositedCents },
  full: {
    payoutCount: proof.summary?.payoutCount,
    transactionCount: proof.transactions.length,
    complete: proof.complete,
    state: proof.state,
    readyForReview: proof.summary?.readyForReview,
    exceptions: (proof.exceptions || []).map((item) => ({ code: item.code, severity: item.severity })),
  },
  closeCoverage: 'not_run',
  verifiedAt: new Date().toISOString(),
};
await writeArtifact('artifacts/parish-reconciliation-staging-smoke.json', evidence);
assert.ok(proof.summary?.payoutCount > 0, 'The full report must retain the real test payouts.');
if (!proof.transactions.length) {
  assert.equal(proof.complete, false, 'Unsupported payout breakdowns must never be presented as complete.');
  assert.equal(proof.summary.readyForReview, false);
  assert.notEqual(proof.state, 'reconciled');
  const blocking = (proof.exceptions || []).filter((item) => item.severity !== 'info');
  assert.ok(
    blocking.length > 0 &&
      blocking.every((item) => ['unsupported_or_large_payout', 'failed_payout'].includes(item.code)),
    'Empty transaction coverage requires an explicit unsupported-payout boundary; provider or matching failures must still fail acceptance.'
  );
  if ((proof.payouts || []).every((payout) => ['failed', 'canceled', 'cancelled'].includes(payout.status)))
    assert.equal(proof.summary.depositedCents, 0, 'Failed payouts must never count as bank deposits.');
  evidence.transactionCoverage = 'failed_or_unsupported_payouts_explicitly_blocked';
} else evidence.transactionCoverage = 'real_payout_transactions';

const expectedDepositCents = Number(proof.summary?.depositedCents || 0);
assert.ok(Number.isSafeInteger(expectedDepositCents) && expectedDepositCents >= 0);
const reviewVersion = proof.closeRecord?.reviewId || proof.closeRecord?.updatedAt || null;
const baseClose = {
  month,
  bankStatementCents: expectedDepositCents,
  bankConfirmed: true,
  closed: true,
  fingerprint: proof.fingerprint,
  expectedReviewVersion: reviewVersion,
};
const unconfirmed = await requestJson(reconciliationPath + '/close', {
  method: 'POST',
  token: login.payload.token,
  body: { ...baseClose, bankConfirmed: false },
});
assert.equal(unconfirmed.response.status, 400, 'Bank totals require explicit confirmation.');
const mismatched = await requestJson(reconciliationPath + '/close', {
  method: 'POST',
  token: login.payload.token,
  body: {
    ...baseClose,
    bankStatementCents: expectedDepositCents + 1,
    notes: 'Release gate: a note must never waive a bank difference.',
  },
});
assert.equal(mismatched.response.status, 409, 'A noted bank difference must not finalize a report.');
const unchanged = await requestJson(reconciliationPath + '?month=' + encodeURIComponent(month), {
  token: login.payload.token,
});
assert.equal(unchanged.response.status, 200);
assert.deepEqual(
  unchanged.payload.closeRecord,
  proof.closeRecord,
  'Rejected close attempts must preserve the saved review.'
);
evidence.unconfirmedStatus = unconfirmed.response.status;
evidence.mismatchedStatus = mismatched.response.status;

if (proof.complete && proof.summary.readyForReview && proof.transactions.length) {
  let expectedReviewVersion = reviewVersion;
  if (proof.closeRecord?.status === 'closed') {
    const reopened = await requestJson(reconciliationPath + '/close', {
      method: 'POST',
      token: login.payload.token,
      body: {
        month,
        closed: false,
        expectedReviewVersion: reviewVersion,
        notes: 'Release gate: verify the current report revision and exact bank match.',
      },
    });
    assert.equal(reopened.response.status, 200);
    expectedReviewVersion = reopened.payload.record.reviewId;
  }
  const closed = await requestJson(reconciliationPath + '/close', {
    method: 'POST',
    token: login.payload.token,
    body: {
      ...baseClose,
      expectedReviewVersion,
      notes: 'Release gate: exact provider deposit total confirmed in the staging fixture.',
    },
  });
  assert.equal(closed.response.status, 200, 'Only complete matching with an exact confirmed bank total may close.');
  assert.equal(closed.payload.record.differenceCents, 0);
  assert.equal(closed.payload.record.fingerprint, proof.fingerprint);
  const stored = await requestJson(reconciliationPath + '?month=' + encodeURIComponent(month), {
    token: login.payload.token,
  });
  assert.equal(stored.payload.closeRecord.reviewId, closed.payload.record.reviewId);
  evidence.closeCoverage = 'exact_confirmed_match_saved';
} else {
  const blocked = await requestJson(reconciliationPath + '/close', {
    method: 'POST',
    token: login.payload.token,
    body: baseClose,
  });
  assert.equal(blocked.response.status, 409, 'Incomplete matching must remain blocked even for an exact bank total.');
  evidence.closeCoverage = 'incomplete_report_or_existing_review_blocked';
}
await writeArtifact('artifacts/parish-reconciliation-staging-smoke.json', evidence);
console.log(
  'PASS - real payout reporting, mandatory bank confirmation, noted-difference rejection, and safe close boundary (' +
    evidence.closeCoverage +
    ')'
);
