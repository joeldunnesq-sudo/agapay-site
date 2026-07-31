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
  "Commemorations smoke is restricted to localhost or a hostname containing staging.",
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
  {
    method: "POST",
    body: { password: credentials.ACCOUNTING_GATE_PARISH_A_PASSWORD },
  },
);
assert.equal(login.response.status, 200, `Parish login returned HTTP ${login.response.status}.`);
assert.ok(login.payload.token, "Parish login did not return a token.");

const result = await requestJson(
  `/api/parish/dashboard/${encodeURIComponent(parishId)}/commemorations`,
  { token: login.payload.token },
);
assert.equal(
  result.response.status,
  200,
  `Parish commemorations dashboard returned HTTP ${result.response.status}.`,
);
assert.ok(Array.isArray(result.payload.entries), "Parish commemorations response should contain entries.");
assert.ok(result.payload.week?.start, "Parish commemorations response should contain a week start.");
assert.ok(result.payload.week?.end, "Parish commemorations response should contain a week end.");

await writeArtifact("artifacts/parish-commemorations-staging-smoke.json", {
  target: baseUrl,
  parishId,
  week: result.payload.week,
  entryCount: result.payload.entries.length,
  verifiedAt: new Date().toISOString(),
});
console.log(
  `PASS - parish commemorations dashboard returned ${result.payload.entries.length} current-week entr`
  + `${result.payload.entries.length === 1 ? "y" : "ies"}`,
);
