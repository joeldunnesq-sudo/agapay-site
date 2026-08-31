import { readParishDashboardSource } from './lib/parish-dashboard-source.mjs';
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  beginMfaAuthentication,
  beginMfaEnrollment,
  freshMfaAt,
  mfaStatus,
  verifyMfaAuthentication,
  verifyMfaEnrollment,
} from "../src/lib/mfa.js";
import { issueAdminSession } from "../src/lib/core.js";
import { enforcePrivilegedMfa } from "../src/handlers/mfa.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dirname, "..");

function makeD1Env() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(path.join(root, "migrations", "0020_platform_identity.sql"), "utf8"));
  db.exec(readFileSync(path.join(root, "migrations", "0106_privileged_mfa.sql"), "utf8"));
  db.exec("CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");

  function wrap(sql) {
    return {
      _params: [],
      bind(...params) { this._params = params; return this; },
      async first() {
        const row = db.prepare(sql).get(...this._params);
        return row === undefined ? null : row;
      },
      async all() {
        return { results: db.prepare(sql).all(...this._params), success: true };
      },
      async run() {
        const info = db.prepare(sql).run(...this._params);
        return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
      },
    };
  }

  return {
    db,
    env: {
      AGAPAY_DB: { prepare: (sql) => wrap(sql) },
      AGAPAY_APP_URL: "https://agapay.app",
      AGAPAY_MFA_ENCRYPTION_KEY: "test-only-mfa-encryption-key-that-is-not-used-in-production",
      PRIVILEGED_MFA_REQUIRED: "true",
    },
  };
}

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let buffer = 0;
  const output = [];
  for (const character of String(value).toUpperCase().replace(/[^A-Z2-7]/g, "")) {
    buffer = (buffer << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function currentTotp(secret, atMs = Date.now()) {
  let counter = BigInt(Math.floor(atMs / 30_000));
  const message = Buffer.alloc(8);
  for (let index = 7; index >= 0; index -= 1) {
    message[index] = Number(counter & 255n);
    counter >>= 8n;
  }
  const digest = createHmac("sha1", decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 15;
  const value = ((digest[offset] & 127) << 24)
    | (digest[offset + 1] << 16)
    | (digest[offset + 2] << 8)
    | digest[offset + 3];
  return String(value % 1_000_000).padStart(6, "0");
}

let passed = 0;
async function test(name, run) {
  try {
    await run();
    passed += 1;
    console.log(`PASS - ${name}`);
  } catch (error) {
    console.error(`FAIL - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

await test("MFA migration adds encrypted profiles, passkeys, transactions, and session assurance", async () => {
  const { db } = makeD1Env();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
  assert.ok(tables.includes("privileged_mfa_profiles"));
  assert.ok(tables.includes("privileged_webauthn_credentials"));
  assert.ok(tables.includes("privileged_mfa_transactions"));
  const columns = db.prepare("PRAGMA table_info(platform_users)").all().map((row) => row.name);
  assert.ok(columns.includes("session_mfa_verified_at"));
});

await test("TOTP enrollment encrypts the secret and issues one-time recovery codes", async () => {
  const { env, db } = makeD1Env();
  const request = new Request("https://agapay.app/api/admin/session");
  const login = await beginMfaAuthentication(env, request, {
    principalType: "platform_admin",
    principalId: "platform",
    metadata: { actor: "Security Test" },
  });
  assert.equal(login.enrollmentRequired, true);

  const setup = await beginMfaEnrollment(env, request, login.pendingToken, {
    method: "totp",
    displayName: "Security Test",
  });
  assert.match(setup.secret, /^[A-Z2-7]+$/);
  const profileBefore = db.prepare("SELECT * FROM privileged_mfa_profiles WHERE principal_type = ? AND principal_id = ?")
    .get("platform_admin", "platform");
  assert.notEqual(profileBefore.totp_secret_ciphertext, setup.secret);
  assert.equal(profileBefore.totp_confirmed_at, null);

  const verified = await verifyMfaEnrollment(env, request, login.pendingToken, {
    method: "totp",
    code: currentTotp(setup.secret),
  });
  assert.equal(verified.recoveryCodes.length, 10);
  assert.equal(new Set(verified.recoveryCodes).size, 10);
  const status = await mfaStatus(env, "platform_admin", "platform");
  assert.deepEqual(status.methods, ["totp", "recovery"]);
  assert.equal(status.recoveryCodesRemaining, 10);
});

await test("TOTP login succeeds and a recovery code can only be used once", async () => {
  const { env } = makeD1Env();
  const request = new Request("https://agapay.app/api/admin/session");
  const enrollment = await beginMfaAuthentication(env, request, { principalType: "platform_admin", principalId: "platform" });
  const setup = await beginMfaEnrollment(env, request, enrollment.pendingToken, { method: "totp" });
  const enrolled = await verifyMfaEnrollment(env, request, enrollment.pendingToken, { method: "totp", code: currentTotp(setup.secret) });

  const totpLogin = await beginMfaAuthentication(env, request, { principalType: "platform_admin", principalId: "platform" });
  assert.equal(totpLogin.enrollmentRequired, false);
  const totpResult = await verifyMfaAuthentication(env, request, totpLogin.pendingToken, { method: "totp", code: currentTotp(setup.secret) });
  assert.equal(totpResult.transaction.principal_id, "platform");

  const recoveryLogin = await beginMfaAuthentication(env, request, { principalType: "platform_admin", principalId: "platform" });
  await verifyMfaAuthentication(env, request, recoveryLogin.pendingToken, { method: "recovery", code: enrolled.recoveryCodes[0] });
  const reusedLogin = await beginMfaAuthentication(env, request, { principalType: "platform_admin", principalId: "platform" });
  await assert.rejects(
    verifyMfaAuthentication(env, request, reusedLogin.pendingToken, { method: "recovery", code: enrolled.recoveryCodes[0] }),
    /invalid|already been used/i,
  );
  assert.equal((await mfaStatus(env, "platform_admin", "platform")).recoveryCodesRemaining, 9);
});

await test("a password-authenticated login cannot register a replacement factor after enrollment", async () => {
  const { env } = makeD1Env();
  const request = new Request("https://agapay.app/api/admin/session");
  const firstLogin = await beginMfaAuthentication(env, request, { principalType: "platform_admin", principalId: "platform" });
  const setup = await beginMfaEnrollment(env, request, firstLogin.pendingToken, { method: "totp" });
  await verifyMfaEnrollment(env, request, firstLogin.pendingToken, { method: "totp", code: currentTotp(setup.secret) });

  const passwordOnlyLogin = await beginMfaAuthentication(env, request, { principalType: "platform_admin", principalId: "platform" });
  assert.equal(passwordOnlyLogin.enrollmentRequired, false);
  await assert.rejects(
    beginMfaEnrollment(env, request, passwordOnlyLogin.pendingToken, { method: "passkey" }),
    /verify an existing MFA method/i,
  );
});

await test("step-up assurance expires after fifteen minutes", async () => {
  const now = Date.now();
  assert.equal(freshMfaAt(new Date(now - 14 * 60_000).toISOString(), now), true);
  assert.equal(freshMfaAt(new Date(now - 16 * 60_000).toISOString(), now), false);
  assert.equal(freshMfaAt("", now), false);
});

await test("the Worker gate rejects legacy privileged sessions and steps up stale ones", async () => {
  const { env } = makeD1Env();
  const legacy = await issueAdminSession(env, "Legacy Admin");
  const legacyRequest = new Request("https://agapay.app/api/admin/registrations", {
    method: "POST",
    headers: { Authorization: `Bearer ${legacy.token}` },
  });
  const legacyGate = await enforcePrivilegedMfa(legacyRequest, env, new URL(legacyRequest.url));
  assert.equal(legacyGate.status, 401);
  assert.equal((await legacyGate.json()).code, "mfa_relogin_required");

  const stale = await issueAdminSession(env, "Stale Admin", { mfaVerifiedAt: new Date(Date.now() - 16 * 60_000).toISOString() });
  const staleRequest = new Request("https://agapay.app/api/admin/registrations", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${stale.token}` },
  });
  const staleGate = await enforcePrivilegedMfa(staleRequest, env, new URL(staleRequest.url));
  assert.equal(staleGate.status, 428);
  assert.equal((await staleGate.json()).code, "mfa_step_up_required");

  const fresh = await issueAdminSession(env, "Fresh Admin", { mfaVerifiedAt: new Date().toISOString() });
  const freshRequest = new Request("https://agapay.app/api/admin/registrations", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${fresh.token}` },
  });
  assert.equal(await enforcePrivilegedMfa(freshRequest, env, new URL(freshRequest.url)), null);
});

await test("admin and parish clients load the mandatory MFA experience", async () => {
  for (const file of ["public/admin/login.html", "public/admin.html", "public/parish/login.html", "public/parish/dashboard.html"]) {
    const source = readFileSync(path.join(root, file), "utf8");
    assert.match(source, /privileged-mfa\.js/);
    assert.match(source, /privileged-mfa\.css/);
  }
  assert.match(readFileSync(path.join(root, "public/admin/app.js"), "utf8"), /AgapayMfa\.runFlow/);
  assert.match(readParishDashboardSource(), /AgapayMfa\.runFlow/);
});

if (!process.exitCode) console.log(`\n${passed} privileged MFA tests passed.`);
