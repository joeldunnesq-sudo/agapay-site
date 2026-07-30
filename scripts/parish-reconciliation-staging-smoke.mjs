import assert from "node:assert/strict";

import {
  baseUrlFrom,
  requiredEnvironment,
  writeArtifact,
} from "./lib/accounting-release-gates.mjs";

const baseUrl = baseUrlFrom();
const target = new URL(baseUrl);
assert.ok(
  ["localhost", "127.0.0.1", "::1"].includes(target.hostname)
    || target.hostname.toLowerCase().includes("staging"),
  "Reconciliation smoke is restricted to localhost or a hostname containing staging.",
);

const credentials = requiredEnvironment([
  "ACCOUNTING_GATE_PARISH_A_ID",
  "ACCOUNTING_GATE_PARISH_A_PASSWORD",
]);
const parishId = credentials.ACCOUNTING_GATE_PARISH_A_ID;

async function requestJson(path, { method = "GET", token = "", body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
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

const login = await requestJson(
  `/api/parish/dashboard/${encodeURIComponent(parishId)}/session`,
  { method: "POST", body: { password: credentials.ACCOUNTING_GATE_PARISH_A_PASSWORD } },
);
assert.equal(login.response.status, 200, `Parish login returned HTTP ${login.response.status}.`);
assert.ok(login.payload.token, "Parish login did not return a token.");

const diagnostics = await requestJson(
  `/api/parish/dashboard/${encodeURIComponent(parishId)}/payout-diagnostics`,
  { token: login.payload.token },
);
assert.equal(diagnostics.response.status, 200, `Payout diagnostics returned HTTP ${diagnostics.response.status}.`);
assert.ok(diagnostics.payload.payouts?.length > 0, "Payout diagnostics should return a real test payout.");
const latestPayout = diagnostics.payload.payouts[0];
const payoutTimestamp = Number(latestPayout.arrivalDate || latestPayout.created || 0) * 1000;
assert.ok(payoutTimestamp > 0, "Latest test payout should include an arrival or creation date.");
const month = new Date(payoutTimestamp).toISOString().slice(0, 7);

const reconciliationPath = `/api/parish/dashboard/${encodeURIComponent(parishId)}/reconciliation`;
const fast = await requestJson(`${reconciliationPath}?month=${encodeURIComponent(month)}`, {
  token: login.payload.token,
});
assert.equal(fast.response.status, 200, `Fast reconciliation returned HTTP ${fast.response.status}.`);
assert.equal(fast.payload.available, true, "Fast reconciliation should be available.");
assert.ok(fast.payload.summary?.payoutCount > 0, "Fast reconciliation should return a real test payout.");

const full = await requestJson(
  `${reconciliationPath}?month=${encodeURIComponent(month)}&detail=full`,
  { token: login.payload.token },
);
assert.equal(full.response.status, 200, `Full reconciliation returned HTTP ${full.response.status}.`);
assert.equal(full.payload.available, true, "Full reconciliation should be available.");
assert.ok(Array.isArray(full.payload.transactions), "Full reconciliation should return transactions.");
assert.ok(full.payload.transactions.length > 0, "Full reconciliation should return real payout transactions.");

const expectedDepositCents = Number(full.payload.summary?.depositedCents || 0);
const bankStatementCents = expectedDepositCents + 1;
const missingNote = await requestJson(`${reconciliationPath}/close`, {
  method: "POST",
  token: login.payload.token,
  body: { month, bankStatementCents, closed: true, notes: "" },
});
assert.equal(missingNote.response.status, 400, "Closing a difference without a note should be rejected.");
assert.match(
  String(missingNote.payload.error || ""),
  /note explaining the bank difference/i,
  "Missing-note rejection should explain the required treasurer note.",
);

const notes = "Staging extraction smoke: intentional one-cent difference.";
const closed = await requestJson(`${reconciliationPath}/close`, {
  method: "POST",
  token: login.payload.token,
  body: { month, bankStatementCents, closed: true, notes },
});
assert.equal(closed.response.status, 200, `Reconciliation close returned HTTP ${closed.response.status}.`);
assert.equal(closed.payload.record?.status, "closed");
assert.equal(closed.payload.record?.differenceCents, 1);
assert.equal(closed.payload.record?.notes, notes);

const stored = await requestJson(`${reconciliationPath}?month=${encodeURIComponent(month)}`, {
  token: login.payload.token,
});
assert.equal(stored.response.status, 200, `Stored reconciliation reload returned HTTP ${stored.response.status}.`);
assert.equal(stored.payload.closeRecord?.status, "closed");
assert.equal(stored.payload.closeRecord?.differenceCents, 1);
assert.equal(stored.payload.closeRecord?.notes, notes);

const evidence = {
  target: baseUrl,
  parishId,
  month,
  fast: {
    payoutCount: fast.payload.summary.payoutCount,
    paidPayoutCount: fast.payload.summary.paidPayoutCount,
    depositedCents: fast.payload.summary.depositedCents,
  },
  full: {
    payoutCount: full.payload.summary.payoutCount,
    transactionCount: full.payload.transactions.length,
    exceptionCount: full.payload.summary.exceptionCount,
  },
  missingNoteStatus: missingNote.response.status,
  closeRecord: closed.payload.record,
  verifiedAt: new Date().toISOString(),
};
await writeArtifact("artifacts/parish-reconciliation-staging-smoke.json", evidence);

console.log(
  `PASS - ${month} fast/full reconciliation, missing-note validation, and stored close record `
  + `(${evidence.fast.payoutCount} payout(s), ${evidence.full.transactionCount} transaction(s))`,
);
