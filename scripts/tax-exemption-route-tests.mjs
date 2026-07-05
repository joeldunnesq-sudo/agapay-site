// scripts/tax-exemption-route-tests.mjs
//
// Route-level HTTP tests for the admin sync/reconciliation/expiration
// routes added in Phase 3C/3D. Unlike scripts/tax-exemption-tests.mjs
// (which tests the underlying src/lib/tax-exemption.js functions
// directly), this file calls the actual exported route handlers in
// src/handlers/tax-exemption.js with real Request objects, exercising the
// route parser, requireAdminContext authorization wrapper, ownership
// checks, validation, status codes, and response shape end-to-end.
//
// Uses the same node:sqlite D1 shim pattern as tax-exemption-tests.mjs,
// extended with an `app_settings` table so the real admin-session code
// path (src/lib/core.js issueAdminSession/resolveAdminSession) works
// without any mocking of auth itself.
//
// Run directly: node scripts/tax-exemption-route-tests.mjs

import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { issueAdminSession } from "../src/lib/core.js";
import { createTaxExemptionClaim, getTaxExemptionById } from "../src/lib/tax-exemption.js";
import {
  handleAdminTaxExemptionSyncRetry,
  handleAdminTaxExemptionSyncReconcile,
  handleAdminTaxExemptionExpire,
  handleAdminTaxExemptionApprove
} from "../src/handlers/tax-exemption.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeD1Env() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE registrations (
      reference TEXT PRIMARY KEY, parish_id TEXT, status TEXT, parish_name TEXT,
      community_type TEXT, stripe_account_id TEXT, stripe_subscription_id TEXT,
      received_at TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')), data TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE app_settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE learn_households (
      id TEXT PRIMARY KEY, slug TEXT, name TEXT, household_size INTEGER DEFAULT 0,
      liturgical_calendar_type TEXT, pace_mode TEXT, grace_mode_active INTEGER DEFAULT 0,
      data TEXT NOT NULL DEFAULT '{}', created_at TEXT, updated_at TEXT
    );
  `);
  for (const file of ["0011_tax_exemptions.sql", "0012_learn_stripe_customer.sql", "0013_tax_exemption_upload_tokens.sql"]) {
    db.exec(readFileSync(path.join(__dirname, "..", "migrations", file), "utf8"));
  }

  function wrap(sql) {
    return {
      _sql: sql, _params: [],
      bind(...params) { this._params = params; return this; },
      async first() { const row = db.prepare(sql).get(...this._params); return row === undefined ? null : row; },
      async all() { return { results: db.prepare(sql).all(...this._params), success: true }; },
      async run() { const info = db.prepare(sql).run(...this._params); return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } }; }
    };
  }
  const AGAPAY_DB = {
    prepare: (sql) => wrap(sql),
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const results = [];
        for (const stmt of statements) {
          const info = db.prepare(stmt._sql).run(...stmt._params);
          results.push({ success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } });
        }
        db.exec("COMMIT");
        return results;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    }
  };
  return { env: { AGAPAY_DB }, db };
}

function seedRegistration(db, { reference, parishId, stripeCustomerId = "", stewardshipStripeCustomerId = "" }) {
  const data = JSON.stringify({
    reference, parishId, parishName: parishId, treasurerEmail: "treasurer@example.org",
    stripeCustomerId, stewardshipStripeCustomerId
  });
  db.prepare(`INSERT INTO registrations (reference, parish_id, status, parish_name, received_at, data) VALUES (?, ?, 'verified', ?, ?, ?)`)
    .run(reference, parishId, parishId, new Date().toISOString(), data);
}

function mockFetch(responses) {
  return async (url, options = {}) => {
    const match = String(url).match(/\/v1\/customers\/([^/?]+)/);
    const customerId = match ? decodeURIComponent(match[1]) : "";
    const isGet = !options.method || options.method === "GET";
    const script = responses[customerId];
    if (!script) return { ok: true, headers: { get: () => "" }, json: async () => ({ id: customerId, tax_exempt: "none" }) };
    const outcome = isGet ? script.get : script.post;
    if (!outcome) return { ok: true, headers: { get: () => "" }, json: async () => ({ id: customerId, tax_exempt: "none" }) };
    return { ok: outcome.ok !== false, status: outcome.status || 200, headers: { get: () => "" }, json: async () => outcome.body || {} };
  };
}

async function makeAdminRequest(env, { method = "POST", body, token }) {
  return new Request("https://example.test/route", {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json"
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
}

function currentVersion(db, taxExemptionId) {
  return db.prepare(`SELECT updated_at FROM tax_exemptions WHERE id = ?`).get(taxExemptionId).updated_at;
}

let passed = 0;
async function test(name, fn) {
  const originalFetch = globalThis.fetch;
  try {
    await fn();
    passed++;
    console.log(`PASS - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// ---------------------------------------------------------------------
// Per-Customer retry route
// ---------------------------------------------------------------------

await test("retry route: unauthorized request is rejected", async () => {
  const { env } = makeD1Env();
  const request = await makeAdminRequest(env, { body: {} }); // no token
  const response = await handleAdminTaxExemptionSyncRetry(request, env, "texmp_fake", "texsync_fake");
  assert.equal(response.status, 401);
});

await test("retry route: missing exemption returns 404", async () => {
  const { env } = makeD1Env();
  const { token } = await issueAdminSession(env, "Test Admin");
  const request = await makeAdminRequest(env, { body: {}, token });
  const response = await handleAdminTaxExemptionSyncRetry(request, env, "texmp_does_not_exist", "texsync_does_not_exist");
  assert.equal(response.status, 404);
});

await test("retry route: a sync row belonging to a different exemption is rejected", async () => {
  const { env, db } = makeD1Env();
  const { token } = await issueAdminSession(env, "Test Admin");
  seedRegistration(db, { reference: "AGP-REG-R1", parishId: "st-luke", stripeCustomerId: "cus_r1" });
  seedRegistration(db, { reference: "AGP-REG-R2", parishId: "st-mark", stripeCustomerId: "cus_r2" });
  const idOne = await createTaxExemptionClaim(env, { registrationReference: "AGP-REG-R1", parishId: "st-luke", jurisdiction: "TX", exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer" });
  const idTwo = await createTaxExemptionClaim(env, { registrationReference: "AGP-REG-R2", parishId: "st-mark", jurisdiction: "TX", exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer" });

  env.STRIPE_SECRET_KEY = "sk_test_123";
  globalThis.fetch = mockFetch({ cus_r1: { get: { ok: true, body: { id: "cus_r1", tax_exempt: "none" } }, post: { ok: false, status: 402, body: {} } } });
  const registrationOne = JSON.parse(db.prepare(`SELECT data FROM registrations WHERE reference='AGP-REG-R1'`).get().data);
  await handleAdminTaxExemptionApprove(await makeAdminRequest(env, { body: { expectedVersion: currentVersion(db, idOne) }, token }), env, idOne);
  const syncRowOne = db.prepare(`SELECT id FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?`).get(idOne);
  void registrationOne;

  const request = await makeAdminRequest(env, { body: {}, token });
  const response = await handleAdminTaxExemptionSyncRetry(request, env, idTwo, syncRowOne.id);
  assert.equal(response.status, 404);
});

await test("retry route: a succeeded row returns 409", async () => {
  const { env, db } = makeD1Env();
  const { token } = await issueAdminSession(env, "Test Admin");
  seedRegistration(db, { reference: "AGP-REG-R3", parishId: "st-paul", stripeCustomerId: "cus_r3" });
  const id = await createTaxExemptionClaim(env, { registrationReference: "AGP-REG-R3", parishId: "st-paul", jurisdiction: "TX", exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer" });

  env.STRIPE_SECRET_KEY = "sk_test_123";
  globalThis.fetch = mockFetch({ cus_r3: { get: { ok: true, body: { id: "cus_r3", tax_exempt: "none" } }, post: { ok: true, body: { id: "cus_r3", tax_exempt: "exempt" } } } });
  await handleAdminTaxExemptionApprove(await makeAdminRequest(env, { body: { expectedVersion: currentVersion(db, id) }, token }), env, id);
  const syncRow = db.prepare(`SELECT id FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?`).get(id);

  const response = await handleAdminTaxExemptionSyncRetry(await makeAdminRequest(env, { body: { expectedVersion: currentVersion(db, id) }, token }), env, id, syncRow.id);
  assert.equal(response.status, 409);
});

await test("retry route: a failed row retries successfully, writes an audit entry, and response has no raw Stripe data", async () => {
  const { env, db } = makeD1Env();
  const { token } = await issueAdminSession(env, "Test Admin");
  seedRegistration(db, { reference: "AGP-REG-R4", parishId: "st-simeon", stripeCustomerId: "cus_r4" });
  const id = await createTaxExemptionClaim(env, { registrationReference: "AGP-REG-R4", parishId: "st-simeon", jurisdiction: "TX", exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer" });

  env.STRIPE_SECRET_KEY = "sk_test_123";
  globalThis.fetch = mockFetch({ cus_r4: { get: { ok: true, body: { id: "cus_r4", tax_exempt: "none" } }, post: { ok: false, status: 402, body: { error: { message: "declined" } } } } });
  await handleAdminTaxExemptionApprove(await makeAdminRequest(env, { body: { expectedVersion: currentVersion(db, id) }, token }), env, id);
  const syncRow = db.prepare(`SELECT id FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?`).get(id);

  globalThis.fetch = mockFetch({ cus_r4: { get: { ok: true, body: { id: "cus_r4", tax_exempt: "none" } }, post: { ok: true, body: { id: "cus_r4", tax_exempt: "exempt" } } } });
  const response = await handleAdminTaxExemptionSyncRetry(await makeAdminRequest(env, { body: { expectedVersion: currentVersion(db, id) }, token }), env, id, syncRow.id);

  const auditRows = db.prepare(`SELECT action FROM tax_exemption_audit_log WHERE tax_exemption_id = ? AND action = 'stripe_sync_succeeded'`).all(id);
  assert.ok(auditRows.length >= 1, "an audit entry must be written for the retry");
});

await test("retry route: stale expectedVersion returns 409 and does not call Stripe", async () => {
  const { env, db } = makeD1Env();
  const { token } = await issueAdminSession(env, "Test Admin");
  seedRegistration(db, { reference: "AGP-REG-R5", parishId: "st-anna2", stripeCustomerId: "cus_r5" });
  const id = await createTaxExemptionClaim(env, { registrationReference: "AGP-REG-R5", parishId: "st-anna2", jurisdiction: "TX", exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer" });

  env.STRIPE_SECRET_KEY = "sk_test_123";
  globalThis.fetch = mockFetch({ cus_r5: { get: { ok: true, body: { id: "cus_r5", tax_exempt: "none" } }, post: { ok: false, status: 402, body: {} } } });
  await handleAdminTaxExemptionApprove(await makeAdminRequest(env, { body: { expectedVersion: currentVersion(db, id) }, token }), env, id);
  const syncRow = db.prepare(`SELECT id FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?`).get(id);

  let fetchCalled = false;
  globalThis.fetch = async () => { fetchCalled = true; return { ok: true, headers: { get: () => "" }, json: async () => ({}) }; };
  const response = await handleAdminTaxExemptionSyncRetry(await makeAdminRequest(env, { body: { expectedVersion: "1999-01-01T00:00:00.000Z" }, token }), env, id, syncRow.id);
  assert.equal(response.status, 409);
  assert.equal(fetchCalled, false);
});

// ---------------------------------------------------------------------
// Reconciliation route
// ---------------------------------------------------------------------

await test("reconcile route: unauthorized request is rejected", async () => {
  const { env } = makeD1Env();
  const response = await handleAdminTaxExemptionSyncReconcile(await makeAdminRequest(env, { body: { action: "accept_external", reason: "x" } }), env, "texmp_fake", "texsync_fake");
  assert.equal(response.status, 401);
});

await test("reconcile route: invalid action returns 422", async () => {
  const { env, db } = makeD1Env();
  const { token } = await issueAdminSession(env, "Test Admin");
  seedRegistration(db, { reference: "AGP-REG-C1", parishId: "st-basil", stripeCustomerId: "cus_c1" });
  const id = await createTaxExemptionClaim(env, { registrationReference: "AGP-REG-C1", parishId: "st-basil", jurisdiction: "TX", exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer" });
  env.STRIPE_SECRET_KEY = "sk_test_123";
  globalThis.fetch = mockFetch({ cus_c1: { get: { ok: true, body: { id: "cus_c1", tax_exempt: "exempt" } }, post: { ok: true, body: { id: "cus_c1", tax_exempt: "exempt" } } } });
  await handleAdminTaxExemptionApprove(await makeAdminRequest(env, { body: { expectedVersion: currentVersion(db, id) }, token }), env, id);
  const syncRow = db.prepare(`SELECT id FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?`).get(id);

  const response = await handleAdminTaxExemptionSyncReconcile(await makeAdminRequest(env, { body: { action: "delete_everything", reason: "x" }, token }), env, id, syncRow.id);
  assert.equal(response.status, 422);
});

await test("reconcile route: missing reason returns 422", async () => {
  const { env, db } = makeD1Env();
  const { token } = await issueAdminSession(env, "Test Admin");
  seedRegistration(db, { reference: "AGP-REG-C2", parishId: "st-cyprian", stripeCustomerId: "cus_c2" });
  const id = await createTaxExemptionClaim(env, { registrationReference: "AGP-REG-C2", parishId: "st-cyprian", jurisdiction: "TX", exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer" });
  env.STRIPE_SECRET_KEY = "sk_test_123";
  globalThis.fetch = mockFetch({ cus_c2: { get: { ok: true, body: { id: "cus_c2", tax_exempt: "exempt" } }, post: { ok: true, body: { id: "cus_c2", tax_exempt: "exempt" } } } });
  await handleAdminTaxExemptionApprove(await makeAdminRequest(env, { body: { expectedVersion: currentVersion(db, id) }, token }), env, id);
  const syncRow = db.prepare(`SELECT id FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?`).get(id);

  const response = await handleAdminTaxExemptionSyncReconcile(await makeAdminRequest(env, { body: { action: "accept_external" }, token }), env, id, syncRow.id);
  assert.equal(response.status, 422);
});

await test("reconcile route: force_apply without confirm returns 422", async () => {
  const { env, db } = makeD1Env();
  const { token } = await issueAdminSession(env, "Test Admin");
  seedRegistration(db, { reference: "AGP-REG-C3", parishId: "st-dionysios", stripeCustomerId: "cus_c3" });
  const id = await createTaxExemptionClaim(env, { registrationReference: "AGP-REG-C3", parishId: "st-dionysios", jurisdiction: "TX", exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer" });
  env.STRIPE_SECRET_KEY = "sk_test_123";
  globalThis.fetch = mockFetch({ cus_c3: { get: { ok: true, body: { id: "cus_c3", tax_exempt: "exempt" } }, post: { ok: true, body: { id: "cus_c3", tax_exempt: "exempt" } } } });
  await handleAdminTaxExemptionApprove(await makeAdminRequest(env, { body: { expectedVersion: currentVersion(db, id) }, token }), env, id);
  const syncRow = db.prepare(`SELECT id FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?`).get(id);

  const response = await handleAdminTaxExemptionSyncReconcile(await makeAdminRequest(env, { body: { action: "force_apply", reason: "x" }, token }), env, id, syncRow.id);
  assert.equal(response.status, 422);
});

await test("reconcile route: accept_external succeeds and returns only safe sync fields", async () => {
  const { env, db } = makeD1Env();
  const { token } = await issueAdminSession(env, "Test Admin");
  seedRegistration(db, { reference: "AGP-REG-C4", parishId: "st-eusebios", stripeCustomerId: "cus_c4" });
  const id = await createTaxExemptionClaim(env, { registrationReference: "AGP-REG-C4", parishId: "st-eusebios", jurisdiction: "TX", exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer" });
  env.STRIPE_SECRET_KEY = "sk_test_123";
  // Externally exempt before AGAPAY approval -- forces reconciliation_required on later revoke.
  globalThis.fetch = mockFetch({ cus_c4: { get: { ok: true, body: { id: "cus_c4", tax_exempt: "exempt" } }, post: { ok: true, body: { id: "cus_c4", tax_exempt: "exempt" } } } });
  await handleAdminTaxExemptionApprove(await makeAdminRequest(env, { body: { expectedVersion: currentVersion(db, id) }, token }), env, id);
  const registration = JSON.parse(db.prepare(`SELECT data FROM registrations WHERE reference='AGP-REG-C4'`).get().data);
  const { revokeTaxExemption } = await import("../src/lib/tax-exemption.js");
  await revokeTaxExemption(env, { taxExemptionId: id, registration, actor: "admin", reason: "x" });
  const syncRow = db.prepare(`SELECT id FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?`).get(id);

  const response = await handleAdminTaxExemptionSyncReconcile(await makeAdminRequest(env, { body: { action: "accept_external", reason: "confirmed with parish", expectedVersion: currentVersion(db, id) }, token }), env, id, syncRow.id);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.resolution, "accept_external");
  assert.deepEqual(Object.keys(body.syncRow).sort(), ["agapayOwnedChange", "id", "previousStatus", "stripeCustomerId", "syncStatus"].sort());
});

await test("reconcile route: stale version returns 409", async () => {
  const { env, db } = makeD1Env();
  const { token } = await issueAdminSession(env, "Test Admin");
  seedRegistration(db, { reference: "AGP-REG-C5", parishId: "st-fotini", stripeCustomerId: "cus_c5" });
  const id = await createTaxExemptionClaim(env, { registrationReference: "AGP-REG-C5", parishId: "st-fotini", jurisdiction: "TX", exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer" });
  env.STRIPE_SECRET_KEY = "sk_test_123";
  globalThis.fetch = mockFetch({ cus_c5: { get: { ok: true, body: { id: "cus_c5", tax_exempt: "exempt" } }, post: { ok: true, body: { id: "cus_c5", tax_exempt: "exempt" } } } });
  await handleAdminTaxExemptionApprove(await makeAdminRequest(env, { body: { expectedVersion: currentVersion(db, id) }, token }), env, id);
  const syncRow = db.prepare(`SELECT id FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?`).get(id);

  const response = await handleAdminTaxExemptionSyncReconcile(await makeAdminRequest(env, { body: { action: "accept_external", reason: "x", expectedVersion: "1999-01-01T00:00:00.000Z" }, token }), env, id, syncRow.id);
  assert.equal(response.status, 409);
});

// ---------------------------------------------------------------------
// Manual expiration route
// ---------------------------------------------------------------------

await test("expire route: unauthorized request is rejected", async () => {
  const { env } = makeD1Env();
  const response = await handleAdminTaxExemptionExpire(await makeAdminRequest(env, { body: { reason: "x", confirm: true } }), env, "texmp_fake");
  assert.equal(response.status, 401);
});

await test("expire route: valid request succeeds", async () => {
  const { env, db } = makeD1Env();
  const { token } = await issueAdminSession(env, "Test Admin");
  seedRegistration(db, { reference: "AGP-REG-E1", parishId: "st-gabriel", stripeCustomerId: "cus_e1" });
  const id = await createTaxExemptionClaim(env, { registrationReference: "AGP-REG-E1", parishId: "st-gabriel", jurisdiction: "TX", exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer" });
  env.STRIPE_SECRET_KEY = "sk_test_123";
  globalThis.fetch = mockFetch({ cus_e1: { get: { ok: true, body: { id: "cus_e1", tax_exempt: "none" } }, post: { ok: true, body: { id: "cus_e1", tax_exempt: "exempt" } } } });
  await handleAdminTaxExemptionApprove(await makeAdminRequest(env, { body: { expectedVersion: currentVersion(db, id) }, token }), env, id);

  globalThis.fetch = mockFetch({ cus_e1: { get: { ok: true, body: { id: "cus_e1", tax_exempt: "exempt" } }, post: { ok: true, body: { id: "cus_e1", tax_exempt: "none" } } } });
  const response = await handleAdminTaxExemptionExpire(await makeAdminRequest(env, { body: { reason: "certificate expired", confirm: true, expectedVersion: currentVersion(db, id) }, token }), env, id);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "expired");

  const claim = await getTaxExemptionById(env, id);
  assert.equal(claim.status, "expired");
});

await test("expire route: invalid current state returns 422", async () => {
  const { env, db } = makeD1Env();
  const { token } = await issueAdminSession(env, "Test Admin");
  seedRegistration(db, { reference: "AGP-REG-E2", parishId: "st-helen", stripeCustomerId: "cus_e2" });
  const id = await createTaxExemptionClaim(env, { registrationReference: "AGP-REG-E2", parishId: "st-helen", jurisdiction: "TX", exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer" });
  // Still pending -- cannot be manually expired.
  const response = await handleAdminTaxExemptionExpire(await makeAdminRequest(env, { body: { reason: "x", confirm: true }, token }), env, id);
  assert.equal(response.status, 422);
});

await test("expire route: missing reason returns 422", async () => {
  const { env, db } = makeD1Env();
  const { token } = await issueAdminSession(env, "Test Admin");
  seedRegistration(db, { reference: "AGP-REG-E3", parishId: "st-irene", stripeCustomerId: "cus_e3" });
  const id = await createTaxExemptionClaim(env, { registrationReference: "AGP-REG-E3", parishId: "st-irene", jurisdiction: "TX", exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer" });
  const response = await handleAdminTaxExemptionExpire(await makeAdminRequest(env, { body: { confirm: true }, token }), env, id);
  assert.equal(response.status, 422);
});

await test("expire route: stale version returns 409", async () => {
  const { env, db } = makeD1Env();
  const { token } = await issueAdminSession(env, "Test Admin");
  seedRegistration(db, { reference: "AGP-REG-E4", parishId: "st-joachim", stripeCustomerId: "cus_e4" });
  const id = await createTaxExemptionClaim(env, { registrationReference: "AGP-REG-E4", parishId: "st-joachim", jurisdiction: "TX", exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer" });
  env.STRIPE_SECRET_KEY = "sk_test_123";
  globalThis.fetch = mockFetch({ cus_e4: { get: { ok: true, body: { id: "cus_e4", tax_exempt: "none" } }, post: { ok: true, body: { id: "cus_e4", tax_exempt: "exempt" } } } });
  await handleAdminTaxExemptionApprove(await makeAdminRequest(env, { body: { expectedVersion: currentVersion(db, id) }, token }), env, id);

  const response = await handleAdminTaxExemptionExpire(await makeAdminRequest(env, { body: { reason: "x", confirm: true, expectedVersion: "1999-01-01T00:00:00.000Z" }, token }), env, id);
  assert.equal(response.status, 409);
});

await test("expire route: an externally-owned Stripe exemption is preserved, not erased", async () => {
  const { env, db } = makeD1Env();
  const { token } = await issueAdminSession(env, "Test Admin");
  seedRegistration(db, { reference: "AGP-REG-E5", parishId: "st-kyriaki", stripeCustomerId: "cus_e5" });
  const id = await createTaxExemptionClaim(env, { registrationReference: "AGP-REG-E5", parishId: "st-kyriaki", jurisdiction: "TX", exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer" });
  env.STRIPE_SECRET_KEY = "sk_test_123";
  globalThis.fetch = mockFetch({ cus_e5: { get: { ok: true, body: { id: "cus_e5", tax_exempt: "exempt" } }, post: { ok: true, body: { id: "cus_e5", tax_exempt: "exempt" } } } });
  await handleAdminTaxExemptionApprove(await makeAdminRequest(env, { body: { expectedVersion: currentVersion(db, id) }, token }), env, id);

  let postCalled = false;
  globalThis.fetch = async (url, options) => {
    if (options?.method === "POST") postCalled = true;
    return { ok: true, headers: { get: () => "" }, json: async () => ({ id: "cus_e5", tax_exempt: "exempt" }) };
  };
  const response = await handleAdminTaxExemptionExpire(await makeAdminRequest(env, { body: { reason: "certificate expired", confirm: true, expectedVersion: currentVersion(db, id) }, token }), env, id);
  const body = await response.json();
  assert.equal(postCalled, false, "must never erase an externally-owned Stripe exemption");
  assert.equal(body.status, "expired", "the legal claim itself is still marked expired even though Stripe wasn't touched");
});

await test("retry route: missing expectedVersion returns 422 (mandatory, not optional)", async () => {
  const { env, db } = makeD1Env();
  const { token } = await issueAdminSession(env, "Test Admin");
  seedRegistration(db, { reference: "AGP-REG-R6", parishId: "st-mercurius", stripeCustomerId: "cus_r6" });
  const id = await createTaxExemptionClaim(env, { registrationReference: "AGP-REG-R6", parishId: "st-mercurius", jurisdiction: "TX", exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer" });
  env.STRIPE_SECRET_KEY = "sk_test_123";
  globalThis.fetch = mockFetch({ cus_r6: { get: { ok: true, body: { id: "cus_r6", tax_exempt: "none" } }, post: { ok: false, status: 402, body: {} } } });
  await handleAdminTaxExemptionApprove(await makeAdminRequest(env, { body: { expectedVersion: currentVersion(db, id) }, token }), env, id);
  const syncRow = db.prepare(`SELECT id FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?`).get(id);

  const response = await handleAdminTaxExemptionSyncRetry(await makeAdminRequest(env, { body: {}, token }), env, id, syncRow.id);
  assert.equal(response.status, 422);
});

await test("approve route: missing expectedVersion returns 422", async () => {
  const { env, db } = makeD1Env();
  const { token } = await issueAdminSession(env, "Test Admin");
  seedRegistration(db, { reference: "AGP-REG-R7", parishId: "st-nikodemos", stripeCustomerId: "cus_r7" });
  const id = await createTaxExemptionClaim(env, { registrationReference: "AGP-REG-R7", parishId: "st-nikodemos", jurisdiction: "TX", exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer" });
  const response = await handleAdminTaxExemptionApprove(await makeAdminRequest(env, { body: {}, token }), env, id);
  assert.equal(response.status, 422);
});

await test("expire route: missing expectedVersion returns 422", async () => {
  const { env, db } = makeD1Env();
  const { token } = await issueAdminSession(env, "Test Admin");
  seedRegistration(db, { reference: "AGP-REG-R8", parishId: "st-olympia", stripeCustomerId: "cus_r8" });
  const id = await createTaxExemptionClaim(env, { registrationReference: "AGP-REG-R8", parishId: "st-olympia", jurisdiction: "TX", exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer" });
  env.STRIPE_SECRET_KEY = "sk_test_123";
  globalThis.fetch = mockFetch({ cus_r8: { get: { ok: true, body: { id: "cus_r8", tax_exempt: "none" } }, post: { ok: true, body: { id: "cus_r8", tax_exempt: "exempt" } } } });
  await handleAdminTaxExemptionApprove(await makeAdminRequest(env, { body: { expectedVersion: currentVersion(db, id) }, token }), env, id);

  const response = await handleAdminTaxExemptionExpire(await makeAdminRequest(env, { body: { reason: "x", confirm: true }, token }), env, id);
  assert.equal(response.status, 422);
});

await test("reconcile route: missing expectedVersion returns 422", async () => {
  const { env, db } = makeD1Env();
  const { token } = await issueAdminSession(env, "Test Admin");
  seedRegistration(db, { reference: "AGP-REG-R9", parishId: "st-pambo", stripeCustomerId: "cus_r9" });
  const id = await createTaxExemptionClaim(env, { registrationReference: "AGP-REG-R9", parishId: "st-pambo", jurisdiction: "TX", exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer" });
  env.STRIPE_SECRET_KEY = "sk_test_123";
  globalThis.fetch = mockFetch({ cus_r9: { get: { ok: true, body: { id: "cus_r9", tax_exempt: "exempt" } }, post: { ok: true, body: { id: "cus_r9", tax_exempt: "exempt" } } } });
  await handleAdminTaxExemptionApprove(await makeAdminRequest(env, { body: { expectedVersion: currentVersion(db, id) }, token }), env, id);
  const syncRow = db.prepare(`SELECT id FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?`).get(id);

  const response = await handleAdminTaxExemptionSyncReconcile(await makeAdminRequest(env, { body: { action: "accept_external", reason: "x" }, token }), env, id, syncRow.id);
  assert.equal(response.status, 422);
});

await test("queue and detail responses never include a raw (unmasked) certificate number", async () => {
  const { env, db } = makeD1Env();
  const { token } = await issueAdminSession(env, "Test Admin");
  seedRegistration(db, { reference: "AGP-REG-R10", parishId: "st-quirinus", stripeCustomerId: "cus_r10" });
  const id = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-R10", parishId: "st-quirinus", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer",
    certificateNumber: "SUPER-SECRET-CERT-998877"
  });
  const { handleAdminTaxExemptionDetail, handleAdminTaxExemptionQueue } = await import("../src/handlers/tax-exemption.js");

  const detailResponse = await handleAdminTaxExemptionDetail(await makeAdminRequest(env, { method: "GET", token }), env, id);
  const detailBody = await detailResponse.json();
  assert.ok(!JSON.stringify(detailBody).includes("SUPER-SECRET-CERT-998877"), "detail response must never contain the full certificate number");
  assert.equal(detailBody.claim.maskedCertificateNumber.includes("9877") || detailBody.claim.maskedCertificateNumber.includes("8877"), true, "masked form should still be present");

  const queueRequest = new Request("https://example.test/route", { method: "GET", headers: { Authorization: `Bearer ${token}` } });
  const queueResponse = await handleAdminTaxExemptionQueue(queueRequest, env);
  const queueBody = await queueResponse.json();
  assert.ok(!JSON.stringify(queueBody).includes("SUPER-SECRET-CERT-998877"), "queue response must never contain the full certificate number");
});

console.log(`\n${passed} test(s) passed.`);
if (process.exitCode) {
  console.error("Some tax exemption route tests FAILED.");
} else {
  console.log("All tax exemption route tests passed.");
}
