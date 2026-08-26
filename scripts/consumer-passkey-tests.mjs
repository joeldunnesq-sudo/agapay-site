import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  beginConsumerPasskeyAuthentication,
  beginConsumerPasskeyRegistration,
  deleteConsumerPasskey,
  listConsumerPasskeys,
  migrateConsumerPasskeyEmail,
  renameConsumerPasskey,
} from "../src/lib/consumer-passkeys.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dirname, "..");

function makeD1Env() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(path.join(root, "migrations", "0107_consumer_passkeys.sql"), "utf8"));
  function wrap(sql) {
    return {
      params: [],
      bind(...params) { this.params = params; return this; },
      async first() {
        const row = db.prepare(sql).get(...this.params);
        return row === undefined ? null : row;
      },
      async all() { return { results: db.prepare(sql).all(...this.params), success: true }; },
      async run() {
        const info = db.prepare(sql).run(...this.params);
        return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
      },
    };
  }
  return {
    db,
    env: {
      AGAPAY_APP_URL: "https://agapay.app",
      AGAPAY_DB: { prepare: sql => wrap(sql) },
    },
  };
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

await test("consumer passkeys use a separate account, credential, and one-time challenge schema", async () => {
  const { db } = makeD1Env();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name);
  assert.ok(tables.includes("consumer_passkey_accounts"));
  assert.ok(tables.includes("consumer_webauthn_credentials"));
  assert.ok(tables.includes("consumer_passkey_transactions"));
  assert.ok(!tables.includes("privileged_mfa_profiles"));
});

await test("registration requires a discoverable, user-verifying credential and stores only a hashed transaction token", async () => {
  const { env, db } = makeD1Env();
  const donor = { email: "member@example.com", emailVerifiedAt: new Date().toISOString(), donorName: "Parish Member" };
  const flow = await beginConsumerPasskeyRegistration(env, new Request("https://agapay.app/api/donor/passkeys/registration/options"), donor);
  assert.equal(flow.options.authenticatorSelection.residentKey, "required");
  assert.equal(flow.options.authenticatorSelection.userVerification, "required");
  assert.equal(flow.options.user.name, donor.email);
  assert.ok(flow.pendingToken.includes("."));
  const transaction = db.prepare("SELECT * FROM consumer_passkey_transactions").get();
  assert.equal(transaction.purpose, "registration");
  assert.notEqual(transaction.token_hash, flow.pendingToken.split(".")[1]);
  assert.equal(transaction.webauthn_challenge, flow.options.challenge);
});

await test("passwordless authentication is account-neutral and eligible for conditional passkey autofill", async () => {
  const { env, db } = makeD1Env();
  const flow = await beginConsumerPasskeyAuthentication(env, new Request("https://agapay.app/api/donor/passkeys/authentication/options"));
  assert.equal(flow.options.userVerification, "required");
  assert.ok(!flow.options.allowCredentials || flow.options.allowCredentials.length === 0);
  const transaction = db.prepare("SELECT * FROM consumer_passkey_transactions").get();
  assert.equal(transaction.purpose, "authentication");
  assert.equal(transaction.account_id, null);
});

await test("passkey management is scoped to the authenticated consumer account", async () => {
  const { env, db } = makeD1Env();
  const donor = { email: "owner@example.com", emailVerifiedAt: new Date().toISOString() };
  await beginConsumerPasskeyRegistration(env, new Request("https://agapay.app"), donor);
  const account = db.prepare("SELECT * FROM consumer_passkey_accounts WHERE donor_email = ?").get(donor.email);
  db.prepare(`INSERT INTO consumer_webauthn_credentials
    (credential_id, account_id, credential_public_key, label, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))`).run("credential-owner", account.id, "AA", "My phone");
  assert.equal((await listConsumerPasskeys(env, donor.email))[0].label, "My phone");
  assert.equal(await renameConsumerPasskey(env, "other@example.com", "credential-owner", "Stolen"), false);
  assert.equal(await deleteConsumerPasskey(env, "other@example.com", "credential-owner"), false);
  assert.equal(await renameConsumerPasskey(env, donor.email, "credential-owner", "My iPhone"), true);
  assert.equal((await listConsumerPasskeys(env, donor.email))[0].label, "My iPhone");
  assert.equal(await deleteConsumerPasskey(env, donor.email, "credential-owner"), true);
  assert.deepEqual(await listConsumerPasskeys(env, donor.email), []);
});

await test("a verified donor email change preserves the stable passkey account", async () => {
  const { env, db } = makeD1Env();
  const donor = { email: "before@example.com", emailVerifiedAt: new Date().toISOString() };
  await beginConsumerPasskeyRegistration(env, new Request("https://agapay.app"), donor);
  const before = db.prepare("SELECT * FROM consumer_passkey_accounts").get();
  const result = await migrateConsumerPasskeyEmail(env, donor.email, "after@example.com");
  const after = db.prepare("SELECT * FROM consumer_passkey_accounts").get();
  assert.equal(result.changed, true);
  assert.equal(after.id, before.id);
  assert.equal(after.donor_email, "after@example.com");
});

await test("My AGAPAY surfaces preferred passkey sign-in, email fallback, enrollment, and device management", async () => {
  const login = readFileSync(path.join(root, "public", "myagapay", "login.html"), "utf8");
  const account = readFileSync(path.join(root, "public", "myagapay", "account.html"), "utf8");
  const client = readFileSync(path.join(root, "public", "scripts", "consumer-passkeys.js"), "utf8");
  const worker = readFileSync(path.join(root, "src", "worker.js"), "utf8");
  assert.match(login, /Preferred sign-in/);
  assert.match(login, /Sign in with email instead/);
  assert.match(login, /autocomplete="username webauthn"/);
  assert.match(login, /Add a passkey\?/);
  assert.match(account, /Sign-in &amp; Security/);
  assert.match(account, /verified email and password remain available for recovery/i);
  assert.match(login, /isConditionalMediationAvailable/);
  assert.match(login, /mediation: "conditional"|mediation === "conditional"/);
  assert.match(client, /navigator\.credentials\.get/);
  assert.match(worker, /handleConsumerPasskeyAuthenticationVerify/);
  assert.match(worker, /handleConsumerPasskeyRegistrationVerify/);
});

if (!process.exitCode) console.log(`\n${passed} consumer passkey tests passed.`);
