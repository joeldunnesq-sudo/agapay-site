import assert from "node:assert/strict";
import { baseUrlFrom, requiredEnvironment } from "./lib/accounting-release-gates.mjs";

const baseUrl = baseUrlFrom();
const target = new URL(baseUrl);
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(target.hostname);
assert.ok(
  isLocal || target.hostname.toLowerCase().includes("staging"),
  "Release-gate user bootstrap is restricted to localhost or a hostname containing staging."
);

const credentials = requiredEnvironment([
  "ACCOUNTING_GATE_PARISH_A_ID",
  "ACCOUNTING_GATE_PARISH_B_ID",
  "ACCOUNTING_GATE_USER_A_EMAIL",
  "ACCOUNTING_GATE_USER_A_PASSWORD",
  "ACCOUNTING_GATE_USER_B_EMAIL",
  "ACCOUNTING_GATE_USER_B_PASSWORD",
  "ACCOUNTING_GATE_PARISH_A_PASSWORD",
  "ACCOUNTING_GATE_PARISH_B_PASSWORD"
]);

assert.notEqual(credentials.ACCOUNTING_GATE_PARISH_A_ID, credentials.ACCOUNTING_GATE_PARISH_B_ID);
assert.notEqual(
  credentials.ACCOUNTING_GATE_USER_A_EMAIL.toLowerCase(),
  credentials.ACCOUNTING_GATE_USER_B_EMAIL.toLowerCase()
);

async function requestJson(path, { method = "GET", token = "", body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let payload = {};
  try { payload = await response.json(); } catch {}
  return { response, payload };
}

async function identitySession(email, password) {
  const login = await requestJson("/api/identity/login", {
    method: "POST",
    body: { email, password }
  });
  if (login.response.status === 401) return null;
  assert.equal(login.response.status, 200, `Platform-user login returned HTTP ${login.response.status}.`);
  assert.ok(login.payload.token, "Platform-user login did not return a token.");

  const session = await requestJson("/api/identity/session", { token: login.payload.token });
  assert.equal(session.response.status, 200, `Platform-user session returned HTTP ${session.response.status}.`);
  return session.payload;
}

function hasActiveMembership(session, parishId) {
  return Array.isArray(session?.memberships) && session.memberships.some(
    (membership) => membership.parishId === parishId && membership.status === "active"
  );
}

async function provisionPrincipal(label, { parishId, parishPassword, email, password }) {
  const existing = await identitySession(email, password);
  if (hasActiveMembership(existing, parishId)) {
    console.log(`PASS - ${label} platform user already has its active staging membership`);
    return;
  }

  const parishLogin = await requestJson(
    `/api/parish/dashboard/${encodeURIComponent(parishId)}/session`,
    { method: "POST", body: { password: parishPassword } }
  );
  assert.equal(parishLogin.response.status, 200, `${label} parish login returned HTTP ${parishLogin.response.status}.`);
  assert.ok(parishLogin.payload.token, `${label} parish login did not return a token.`);

  const invitation = await requestJson(
    `/api/parish/dashboard/${encodeURIComponent(parishId)}/memberships/invitations`,
    {
      method: "POST",
      token: parishLogin.payload.token,
      body: { email, roleTemplate: "treasurer" }
    }
  );
  assert.equal(
    invitation.response.status,
    200,
    `${label} membership invitation returned HTTP ${invitation.response.status}.`
  );
  assert.ok(invitation.payload.token, `${label} membership invitation did not return a token.`);

  const accepted = await requestJson(
    `/api/identity/invitations/${encodeURIComponent(invitation.payload.token)}/accept`,
    {
      method: "POST",
      body: { password, displayName: `Accounting Gate ${label}` }
    }
  );
  assert.equal(
    accepted.response.status,
    200,
    `${label} membership acceptance returned HTTP ${accepted.response.status}.`
  );

  const verified = await identitySession(email, password);
  assert.ok(hasActiveMembership(verified, parishId), `${label} active parish membership was not created.`);
  console.log(`PASS - ${label} dedicated staging platform user and membership are ready`);
}

await provisionPrincipal("A", {
  parishId: credentials.ACCOUNTING_GATE_PARISH_A_ID,
  parishPassword: credentials.ACCOUNTING_GATE_PARISH_A_PASSWORD,
  email: credentials.ACCOUNTING_GATE_USER_A_EMAIL,
  password: credentials.ACCOUNTING_GATE_USER_A_PASSWORD
});
await provisionPrincipal("B", {
  parishId: credentials.ACCOUNTING_GATE_PARISH_B_ID,
  parishPassword: credentials.ACCOUNTING_GATE_PARISH_B_PASSWORD,
  email: credentials.ACCOUNTING_GATE_USER_B_EMAIL,
  password: credentials.ACCOUNTING_GATE_USER_B_PASSWORD
});
