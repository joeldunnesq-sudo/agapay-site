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
  "Giving reports smoke is restricted to localhost or a hostname containing staging.",
);

const credentials = requiredEnvironment([
  "ACCOUNTING_GATE_PARISH_A_ID",
  "ACCOUNTING_GATE_PARISH_B_ID",
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
  {
    method: "POST",
    body: { password: credentials.ACCOUNTING_GATE_PARISH_A_PASSWORD },
  },
);
assert.equal(login.response.status, 200, `Parish login returned HTTP ${login.response.status}.`);
assert.ok(login.payload.token, "Parish login did not return a token.");
const token = login.payload.token;
const dashboardPath = `/api/parish/dashboard/${encodeURIComponent(parishId)}`;

const summary = await requestJson(`${dashboardPath}/giving-summary`, { token });
assert.equal(summary.response.status, 200, `Giving summary returned HTTP ${summary.response.status}.`);
assert.ok(summary.payload.summary, "Giving summary should return a summary object.");
assert.ok(Array.isArray(summary.payload.summary.monthly), "Giving summary should return monthly figures.");

const volume = await requestJson(`${dashboardPath}/stripe-volume`, { token });
assert.equal(volume.response.status, 200, `Stripe volume returned HTTP ${volume.response.status}.`);
assert.ok(volume.payload.volume, "Stripe volume should return a volume object.");
assert.equal(typeof volume.payload.volume.donationPercent, "number");
assert.ok(volume.payload.volume.scan, "Stripe volume should return scan state.");

const history = await requestJson(`${dashboardPath}/giving-history`, { token });
assert.equal(history.response.status, 200, `Giving history returned HTTP ${history.response.status}.`);
assert.ok(Array.isArray(history.payload.gifts), "Giving history should return a gifts array.");

const recurring = await requestJson(`${dashboardPath}/recurring-health`, { token });
assert.equal(recurring.response.status, 200, `Recurring health returned HTTP ${recurring.response.status}.`);
assert.ok(recurring.payload.health, "Recurring health should return a health object.");
assert.ok(Array.isArray(recurring.payload.health.rows), "Recurring health should return health rows.");

const attendance = await requestJson(`${dashboardPath}/stewardship/attendance?weeks=13`, { token });
assert.equal(attendance.response.status, 200, `Attendance trend returned HTTP ${attendance.response.status}.`);
assert.equal(attendance.payload.points?.length, 13, "Attendance trend should preserve all 13 Sunday slots, including gaps.");
assert.ok(attendance.payload.summary, "Attendance trend should include its parish summary.");

const invalidAttendance = await requestJson(`${dashboardPath}/stewardship/attendance`, {
  method: "PATCH",
  token,
  body: { weekOf: "2026-08-31", headcount: 42 },
});
assert.equal(invalidAttendance.response.status, 422, "A non-Sunday attendance correction should fail without writing.");

const currentDelegateId = attendance.payload.delegate?.ministryId || null;
const delegation = await requestJson(`${dashboardPath}/stewardship/attendance/delegation`, {
  method: "PATCH",
  token,
  body: { ministryId: currentDelegateId },
});
assert.equal(delegation.response.status, 200, `Attendance delegation returned HTTP ${delegation.response.status}.`);
assert.equal(delegation.payload.delegate?.ministryId || null, currentDelegateId, "The no-op delegation save should preserve the current delegate.");

const crossParishAttendance = await requestJson(
  `/api/parish/dashboard/${encodeURIComponent(credentials.ACCOUNTING_GATE_PARISH_B_ID)}/stewardship/attendance?weeks=13`,
  { token },
);
assert.equal(crossParishAttendance.response.status, 401, "A Parish A bearer must not read Parish B attendance.");

const evidence = {
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
await writeArtifact("artifacts/parish-giving-reports-staging-smoke.json", evidence);
console.log(
  `PASS - giving summary, Stripe volume, giving history (${evidence.historyCount} gifts), `
  + "recurring-giving health, and parish attendance authorization",
);
