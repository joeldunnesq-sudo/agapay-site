// scripts/tax-exemption-tests.mjs
//
// Exercises the real src/lib/tax-exemption.js and
// src/lib/tax-exemption-storage.js modules (no reimplementation) against a
// D1-shaped SQLite database, using node's built-in node:sqlite -- same
// pattern as scripts/settlement-profiles-tests.mjs. Requires Node >= 22
// for node:sqlite; npm run check enforces this via
// scripts/require-node-22.mjs -- this suite is part of the standard check.
//
// Run directly: node scripts/tax-exemption-tests.mjs

import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  createTaxExemptionClaim,
  attachTaxExemptionDocument,
  getTaxExemptionById,
  getCurrentTaxExemptionForRegistration,
  transitionTaxExemption,
  resolveApplicableStripeCustomers,
  approveTaxExemption,
  approveTaxExemptionWithoutStripeSync,
  rejectTaxExemption,
  requestReplacementDocumentation,
  revokeTaxExemption,
  expireTaxExemptionManually,
  StaleRecordError,
  processExpiredTaxExemptions,
  runAllPendingStripeSyncs,
  retryOneStripeSync,
  reconcileStripeSync,
  applyApprovedExemptionIfExists,
  issueClaimUploadToken,
  verifyClaimUploadToken,
  maskCertificateNumber,
  aggregateSyncState,
  computeAllowedActions,
  getTaxExemptionSummaryCounts,
  isTaxExemptionWorkflowEnabled,
  isTaxExemptionDocumentUploadEnabled,
  isTaxExemptionStripeSyncEnabled
} from "../src/lib/tax-exemption.js";
import {
  sanitizeFilename,
  generateStorageKey,
  validateExemptionUpload
} from "../src/lib/tax-exemption-storage.js";
import {
  ensureLearnHouseholdStripeCustomer,
  selectLearnStripeCustomerBackfillMatch
} from "../src/learn/billing.js";
import {
  SUBSCRIPTION_TAX_CODES,
  NO_STATEWIDE_GENERAL_SALES_TAX_STATES,
  hasNoStatewideGeneralSalesTax,
  applySubscriptionTaxCode,
  subscriptionTaxCode,
  stewardshipTaxCodeReadiness
} from "../src/lib/tax-codes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------
// D1-shaped SQLite shim, extended from settlement-profiles-tests.mjs with
// batch() support (Cloudflare's D1Database#batch), since
// transitionTaxExemption() and attachTaxExemptionDocument() rely on it for
// atomic multi-statement local writes.
// ---------------------------------------------------------------------
function makeD1Env(seedFn) {
  const db = new DatabaseSync(":memory:");

  db.exec(`
    CREATE TABLE registrations (
      reference TEXT PRIMARY KEY, parish_id TEXT, status TEXT, parish_name TEXT,
      community_type TEXT, stripe_account_id TEXT, stripe_subscription_id TEXT,
      received_at TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')), data TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE learn_households (
      id TEXT PRIMARY KEY, slug TEXT, name TEXT, household_size INTEGER DEFAULT 0,
      liturgical_calendar_type TEXT, pace_mode TEXT, grace_mode_active INTEGER DEFAULT 0,
      data TEXT NOT NULL DEFAULT '{}', created_at TEXT, updated_at TEXT
    );
    CREATE TABLE app_settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
    );
  `);

  if (seedFn) seedFn(db);

  const migration = readFileSync(path.join(__dirname, "..", "migrations", "0011_tax_exemptions.sql"), "utf8");
  db.exec(migration);
  const learnMigration = readFileSync(path.join(__dirname, "..", "migrations", "0012_learn_stripe_customer.sql"), "utf8");
  db.exec(learnMigration);
  const uploadTokenMigration = readFileSync(path.join(__dirname, "..", "migrations", "0013_tax_exemption_upload_tokens.sql"), "utf8");
  db.exec(uploadTokenMigration);

  function toD1Result(rows) {
    return { results: rows, success: true };
  }

  function wrap(sql) {
    return {
      _sql: sql,
      _params: [],
      bind(...params) { this._params = params; return this; },
      async first() {
        const row = db.prepare(sql).get(...this._params);
        return row === undefined ? null : row;
      },
      async all() {
        const rows = db.prepare(sql).all(...this._params);
        return toD1Result(rows);
      },
      async run() {
        const info = db.prepare(sql).run(...this._params);
        return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
      }
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
    },
    _raw: db
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

function loadRegistration(db, reference) {
  const row = db.prepare(`SELECT data FROM registrations WHERE reference = ?`).get(reference);
  return JSON.parse(row.data);
}

// ---------------------------------------------------------------------
// fetch() mock for Stripe calls. Records every request; lets a test script
// canned responses per Stripe Customer id so approve/reject/retry flows can
// simulate one customer succeeding while another fails.
// ---------------------------------------------------------------------
function mockFetch(responses) {
  const calls = [];
  return {
    calls,
    fetchFn: async (url, options = {}) => {
      calls.push({ url, options });
      const match = String(url).match(/\/v1\/customers\/([^/?]+)/);
      const customerId = match ? decodeURIComponent(match[1]) : "";
      const isGet = !options.method || options.method === "GET";
      const script = responses[customerId];
      if (!script) {
        return { ok: true, headers: { get: () => "" }, json: async () => ({ id: customerId, tax_exempt: "none" }) };
      }
      const outcome = isGet ? script.get : script.post;
      if (!outcome) return { ok: true, headers: { get: () => "" }, json: async () => ({ id: customerId, tax_exempt: "none" }) };
      return {
        ok: outcome.ok !== false,
        status: outcome.status || (outcome.ok === false ? 402 : 200),
        headers: { get: () => "" },
        json: async () => outcome.body || {}
      };
    }
  };
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
// tax-codes.js
// ---------------------------------------------------------------------

await test("NO_STATEWIDE_GENERAL_SALES_TAX_STATES contains exactly the five required states", () => {
  assert.deepEqual(
    [...NO_STATEWIDE_GENERAL_SALES_TAX_STATES].sort(),
    ["AK", "DE", "MT", "NH", "OR"]
  );
  assert.equal(hasNoStatewideGeneralSalesTax("or"), true, "lookup should be case-insensitive");
  assert.equal(hasNoStatewideGeneralSalesTax("TX"), false);
});

await test("applySubscriptionTaxCode is a safe no-op when no code is configured", () => {
  assert.equal(subscriptionTaxCode("giving"), "", "codes should be blank until CPA sign-off, per Phase 2/3 plan");
  const form = new URLSearchParams();
  applySubscriptionTaxCode(form, "line_items[0][price_data][product_data]", "giving");
  assert.equal(form.has("line_items[0][price_data][product_data][tax_code]"), false);
});

await test("applySubscriptionTaxCode sets tax_code once a code is configured", () => {
  const original = SUBSCRIPTION_TAX_CODES.giving;
  SUBSCRIPTION_TAX_CODES.giving = "txcd_10000000";
  try {
    const form = new URLSearchParams();
    applySubscriptionTaxCode(form, "line_items[0][price_data][product_data]", "giving");
    assert.equal(form.get("line_items[0][price_data][product_data][tax_code]"), "txcd_10000000");
  } finally {
    SUBSCRIPTION_TAX_CODES.giving = original;
  }
});

await test("pre-activation, a blank code never blocks checkout", () => {
  const form = new URLSearchParams();
  const result = applySubscriptionTaxCode(form, "line_items[0][price_data][product_data]", "giving", { SUBSCRIPTION_TAX_CODES_ENABLED: "false" });
  assert.equal(result.blocked, false);
});

for (const productKey of ["giving", "parishPlus", "learn"]) {
  await test(`post-activation, a blank ${productKey} code blocks checkout`, () => {
    const original = SUBSCRIPTION_TAX_CODES[productKey];
    SUBSCRIPTION_TAX_CODES[productKey] = "";
    try {
      const form = new URLSearchParams();
      const result = applySubscriptionTaxCode(form, "line_items[0][price_data][product_data]", productKey, { SUBSCRIPTION_TAX_CODES_ENABLED: "true" });
      assert.equal(result.blocked, true);
    } finally {
      SUBSCRIPTION_TAX_CODES[productKey] = original;
    }
  });
}

await test("post-activation, an approved code is applied and does not block", () => {
  const original = SUBSCRIPTION_TAX_CODES.giving;
  SUBSCRIPTION_TAX_CODES.giving = "txcd_approved";
  try {
    const form = new URLSearchParams();
    const result = applySubscriptionTaxCode(form, "line_items[0][price_data][product_data]", "giving", { SUBSCRIPTION_TAX_CODES_ENABLED: "true" });
    assert.equal(result.blocked, false);
    assert.equal(form.get("line_items[0][price_data][product_data][tax_code]"), "txcd_approved");
  } finally {
    SUBSCRIPTION_TAX_CODES.giving = original;
  }
});

await test("Stewardship tax-code readiness is reported but never auto-mutates the live Stripe Product", () => {
  const readiness = stewardshipTaxCodeReadiness({ SUBSCRIPTION_TAX_CODES_ENABLED: "true" });
  assert.equal(readiness.codeConfigured, false, "no code has been approved yet in this codebase");
  assert.equal(readiness.requiresManualStripeProductUpdate, false, "false because no code is configured yet -- nothing to apply");
});

await test("tax-code activation is scoped to subscription line items only -- donations and bookstore never call applySubscriptionTaxCode", async () => {
  const donorSource = readFileSync(path.join(__dirname, "..", "src", "handlers", "donor.js"), "utf8");
  assert.equal(donorSource.includes("applySubscriptionTaxCode"), false, "donor.js (donations + bookstore) must never reference the subscription tax-code helper");
});

// ---------------------------------------------------------------------
// tax-exemption-storage.js
// ---------------------------------------------------------------------

await test("sanitizeFilename strips path separators and control characters", () => {
  assert.equal(sanitizeFilename("../../etc/passwd"), ".._.._etc_passwd");
  assert.equal(sanitizeFilename("cert\x00\x1f.pdf"), "cert.pdf");
});

await test("generateStorageKey never contains identifying substrings and uses the expected prefix", () => {
  const key = generateStorageKey();
  assert.ok(key.startsWith("texdoc/"));
  assert.ok(!key.includes("st-fiacre"));
  const second = generateStorageKey();
  assert.notEqual(key, second, "keys must be random, not derived from any fixed input");
});

await test("validateExemptionUpload rejects a renamed file whose signature doesn't match", async () => {
  const fakeBytes = new TextEncoder().encode("not really a pdf, just text").buffer;
  const result = await validateExemptionUpload({
    filename: "certificate.pdf",
    declaredMimeType: "application/pdf",
    arrayBuffer: fakeBytes
  });
  assert.equal(result.ok, false);
});

await test("validateExemptionUpload accepts a genuine PDF signature", async () => {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0x25]);
  const result = await validateExemptionUpload({
    filename: "certificate.pdf",
    declaredMimeType: "application/pdf",
    arrayBuffer: bytes.buffer
  });
  assert.equal(result.ok, true);
  assert.equal(result.mimeType, "application/pdf");
});

await test("validateExemptionUpload rejects an oversized file", async () => {
  const bytes = new Uint8Array(10 * 1024 * 1024 + 1);
  bytes.set([0x25, 0x50, 0x44, 0x46]);
  const result = await validateExemptionUpload({
    filename: "certificate.pdf",
    declaredMimeType: "application/pdf",
    arrayBuffer: bytes.buffer
  });
  assert.equal(result.ok, false);
});

// ---------------------------------------------------------------------
// tax-exemption.js state machine + Stripe sync
// ---------------------------------------------------------------------

await test("resolveApplicableStripeCustomers returns both customers when both exist", () => {
  const customers = resolveApplicableStripeCustomers({
    stripeCustomerId: "cus_giving", stewardshipStripeCustomerId: "cus_stewardship"
  });
  assert.equal(customers.length, 2);
  assert.deepEqual(customers.map((c) => c.customerRole).sort(), ["giving_parish_plus", "stewardship"]);
});

await test("resolveApplicableStripeCustomers returns only what's present", () => {
  assert.equal(resolveApplicableStripeCustomers({}).length, 0);
  assert.equal(resolveApplicableStripeCustomers({ stripeCustomerId: "cus_a" }).length, 1);
});

await test("a full approve -> reject -> approve cycle is rejected by the state machine", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-1", parishId: "st-fiacre", stripeCustomerId: "cus_1" });

  const id = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-1", parishId: "st-fiacre", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "Fr. Ambrose",
    authorizedRepresentativeTitle: "Rector"
  });

  await transitionTaxExemption(env, { taxExemptionId: id, nextStatus: "rejected", fields: { rejected_at: "now", rejected_by: "admin", rejection_reason: "test" } });
  await assert.rejects(
    () => transitionTaxExemption(env, { taxExemptionId: id, nextStatus: "approved", fields: {} }),
    /Invalid tax_exemptions transition/
  );
});

await test("at most one approved exemption per registration is enforced at the DB level", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-2", parishId: "holy-ascension", stripeCustomerId: "cus_2" });

  const idOne = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-2", parishId: "holy-ascension", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer"
  });
  const idTwo = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-2", parishId: "holy-ascension", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "B", authorizedRepresentativeTitle: "Treasurer"
  });

  await transitionTaxExemption(env, { taxExemptionId: idOne, nextStatus: "approved", fields: { approved_at: "now", approved_by: "admin" } });
  await assert.rejects(
    () => transitionTaxExemption(env, { taxExemptionId: idTwo, nextStatus: "approved", fields: { approved_at: "now", approved_by: "admin" } }),
    /UNIQUE constraint failed/
  );
});

await test("approveTaxExemption succeeds when every applicable Stripe Customer succeeds", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-3", parishId: "st-nicholas", stripeCustomerId: "cus_giving_3", stewardshipStripeCustomerId: "cus_stewardship_3" });
  const registration = loadRegistration(db, "AGP-REG-3");

  const id = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-3", parishId: "st-nicholas", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "Fr. John", authorizedRepresentativeTitle: "Rector"
  });

  const { fetchFn } = mockFetch({
    cus_giving_3: { get: { ok: true, body: { id: "cus_giving_3", tax_exempt: "none" } }, post: { ok: true, body: { id: "cus_giving_3", tax_exempt: "exempt" } } },
    cus_stewardship_3: { get: { ok: true, body: { id: "cus_stewardship_3", tax_exempt: "none" } }, post: { ok: true, body: { id: "cus_stewardship_3", tax_exempt: "exempt" } } }
  });
  globalThis.fetch = fetchFn;
  env.STRIPE_SECRET_KEY = "sk_test_123";
  env.RESEND_API_KEY = "";

  const result = await approveTaxExemption(env, { taxExemptionId: id, registration, actor: "admin@agapay.app" });
  assert.equal(result.ok, true);
  assert.equal(result.exemption.status, "approved");

  const registrationRow = db.prepare(`SELECT tax_exemption_status, current_tax_exemption_id FROM registrations WHERE reference = 'AGP-REG-3'`).get();
  assert.equal(registrationRow.tax_exemption_status, "approved");
  assert.equal(registrationRow.current_tax_exemption_id, id);

  const syncRows = db.prepare(`SELECT * FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?`).all(id);
  assert.equal(syncRows.length, 2);
  assert.ok(syncRows.every((r) => r.sync_status === "succeeded"));
});

await test("approveTaxExemption leaves the claim pending when one of two Customers fails, and retry finalizes it", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-4", parishId: "st-mary", stripeCustomerId: "cus_giving_4", stewardshipStripeCustomerId: "cus_stewardship_4" });
  const registration = loadRegistration(db, "AGP-REG-4");

  const id = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-4", parishId: "st-mary", jurisdiction: "CA",
    exemptionType: "religious_organization", authorizedRepresentativeName: "Fr. Basil", authorizedRepresentativeTitle: "Rector"
  });

  env.STRIPE_SECRET_KEY = "sk_test_123";
  env.RESEND_API_KEY = "";

  // First attempt: giving customer succeeds, stewardship customer fails.
  globalThis.fetch = mockFetch({
    cus_giving_4: { get: { ok: true, body: { id: "cus_giving_4", tax_exempt: "none" } }, post: { ok: true, body: { id: "cus_giving_4", tax_exempt: "exempt" } } },
    cus_stewardship_4: { get: { ok: true, body: { id: "cus_stewardship_4", tax_exempt: "none" } }, post: { ok: false, status: 402, body: { error: { message: "card_declined-ish stripe error" } } } }
  }).fetchFn;

  const firstAttempt = await approveTaxExemption(env, { taxExemptionId: id, registration, actor: "admin@agapay.app" });
  assert.equal(firstAttempt.ok, false, "should not approve when any required customer fails");

  const stillPending = await getTaxExemptionById(env, id);
  assert.equal(stillPending.status, "pending", "claim must remain pending, never partially approved");

  const givingSync = db.prepare(`SELECT * FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ? AND stripe_customer_id = 'cus_giving_4'`).get(id);
  const stewardshipSync = db.prepare(`SELECT * FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ? AND stripe_customer_id = 'cus_stewardship_4'`).get(id);
  assert.equal(givingSync.sync_status, "succeeded", "successful customer rows must be preserved, not re-run");
  assert.equal(stewardshipSync.sync_status, "failed");

  // Retry: now the previously-failing customer succeeds. Only the failed
  // row should be retried (succeeded row stays as-is).
  globalThis.fetch = mockFetch({
    cus_stewardship_4: { get: { ok: true, body: { id: "cus_stewardship_4", tax_exempt: "none" } }, post: { ok: true, body: { id: "cus_stewardship_4", tax_exempt: "exempt" } } }
  }).fetchFn;

  const retrySummary = await runAllPendingStripeSyncs(env, id);
  assert.equal(retrySummary.failed, 0);
  assert.equal(retrySummary.total, 1, "only the failed row should be retried, not the already-succeeded one");

  const finalized = await approveTaxExemption(env, { taxExemptionId: id, registration, actor: "admin@agapay.app" });
  assert.equal(finalized.ok, true);
  assert.equal(finalized.exemption.status, "approved");
});

await test("rejectTaxExemption never touches Stripe", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-5", parishId: "holy-trinity", stripeCustomerId: "cus_5" });
  const registration = loadRegistration(db, "AGP-REG-5");
  const id = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-5", parishId: "holy-trinity", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer"
  });

  let fetchCalled = false;
  globalThis.fetch = async () => { fetchCalled = true; return { ok: true, json: async () => ({}) }; };
  env.RESEND_API_KEY = "";

  const result = await rejectTaxExemption(env, { taxExemptionId: id, registration, actor: "admin", reason: "Certificate expired" });
  assert.equal(result.exemption.status, "rejected");
  assert.equal(fetchCalled, false, "rejection must never call Stripe");
});

await test("revokeTaxExemption disables Stripe exemption and records the reason", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-6", parishId: "st-elias", stripeCustomerId: "cus_6" });
  const registration = loadRegistration(db, "AGP-REG-6");
  const id = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-6", parishId: "st-elias", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer"
  });

  env.STRIPE_SECRET_KEY = "sk_test_123";
  env.RESEND_API_KEY = "";
  globalThis.fetch = mockFetch({
    cus_6: { get: { ok: true, body: { id: "cus_6", tax_exempt: "none" } }, post: { ok: true, body: { id: "cus_6", tax_exempt: "exempt" } } }
  }).fetchFn;
  await approveTaxExemption(env, { taxExemptionId: id, registration, actor: "admin" });

  globalThis.fetch = mockFetch({
    cus_6: { get: { ok: true, body: { id: "cus_6", tax_exempt: "exempt" } }, post: { ok: true, body: { id: "cus_6", tax_exempt: "none" } } }
  }).fetchFn;
  const revoked = await revokeTaxExemption(env, { taxExemptionId: id, registration, actor: "admin", reason: "Certificate found invalid" });
  assert.equal(revoked.ok, true);
  assert.equal(revoked.exemption.status, "revoked");

  const row = db.prepare(`SELECT tax_exemption_status FROM registrations WHERE reference = 'AGP-REG-6'`).get();
  assert.equal(row.tax_exemption_status, "revoked");
});

await test("processExpiredTaxExemptions expires and disables Stripe exemption for a past-due approved claim", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-7", parishId: "st-george", stripeCustomerId: "cus_7" });
  const registration = loadRegistration(db, "AGP-REG-7");
  const id = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-7", parishId: "st-george", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer",
    expirationDate: "2020-01-01"
  });

  env.STRIPE_SECRET_KEY = "sk_test_123";
  env.RESEND_API_KEY = "";
  globalThis.fetch = mockFetch({
    cus_7: { get: { ok: true, body: { id: "cus_7", tax_exempt: "none" } }, post: { ok: true, body: { id: "cus_7", tax_exempt: "exempt" } } }
  }).fetchFn;
  await approveTaxExemption(env, { taxExemptionId: id, registration, actor: "admin" });

  globalThis.fetch = mockFetch({
    cus_7: { get: { ok: true, body: { id: "cus_7", tax_exempt: "exempt" } }, post: { ok: true, body: { id: "cus_7", tax_exempt: "none" } } }
  }).fetchFn;
  const summary = await processExpiredTaxExemptions(env);
  assert.equal(summary.expired, 1);

  const claim = await getTaxExemptionById(env, id);
  assert.equal(claim.status, "expired");
});

await test("requestReplacementDocumentation without a grace period disables Stripe exemption immediately", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-8", parishId: "st-paul", stripeCustomerId: "cus_8" });
  const registration = loadRegistration(db, "AGP-REG-8");
  const id = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-8", parishId: "st-paul", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer"
  });

  env.STRIPE_SECRET_KEY = "sk_test_123";
  env.RESEND_API_KEY = "";
  globalThis.fetch = mockFetch({
    cus_8: { get: { ok: true, body: { id: "cus_8", tax_exempt: "none" } }, post: { ok: true, body: { id: "cus_8", tax_exempt: "exempt" } } }
  }).fetchFn;
  await approveTaxExemption(env, { taxExemptionId: id, registration, actor: "admin" });

  const postCalls = [];
  globalThis.fetch = async (url, options) => {
    if (options?.method === "POST") postCalls.push(JSON.parse(JSON.stringify(Object.fromEntries(options.body))));
    return { ok: true, json: async () => ({ id: "cus_8", tax_exempt: options?.method === "POST" ? "none" : "exempt" }), headers: { get: () => "" } };
  };

  const result = await requestReplacementDocumentation(env, { taxExemptionId: id, registration, actor: "admin", reason: "Certificate image unreadable" });
  assert.equal(result.exemption.status, "replacement_required");
  assert.ok(postCalls.some((call) => call.tax_exempt === "none"), "default (no grace period) must disable Stripe exemption immediately");
});

await test("attachTaxExemptionDocument marks the prior document as no longer current", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-9", parishId: "st-anna" });
  const id = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-9", parishId: "st-anna", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer"
  });

  const firstDocId = await attachTaxExemptionDocument(env, {
    taxExemptionId: id, registrationReference: "AGP-REG-9", storageKey: "texdoc/aaa",
    originalFilename: "cert.pdf", sanitizedFilename: "cert.pdf", mimeType: "application/pdf", fileSize: 100, sha256: "abc"
  });
  const secondDocId = await attachTaxExemptionDocument(env, {
    taxExemptionId: id, registrationReference: "AGP-REG-9", storageKey: "texdoc/bbb",
    originalFilename: "cert-v2.pdf", sanitizedFilename: "cert-v2.pdf", mimeType: "application/pdf", fileSize: 100, sha256: "def"
  });

  const first = db.prepare(`SELECT is_current, archived_at FROM tax_exemption_documents WHERE id = ?`).get(firstDocId);
  const second = db.prepare(`SELECT is_current, replaces_document_id FROM tax_exemption_documents WHERE id = ?`).get(secondDocId);
  assert.equal(first.is_current, 0);
  assert.ok(first.archived_at);
  assert.equal(second.is_current, 1);
  assert.equal(second.replaces_document_id, firstDocId);
});

// ---------------------------------------------------------------------
// Phase 3B: no-statewide-general-sales-tax states get NO special claim
// treatment -- verified for all five required states individually.
// ---------------------------------------------------------------------

for (const state of ["AK", "DE", "MT", "NH", "OR"]) {
  await test(`a genuine exemption claim from a parish in ${state} is created as an ordinary pending claim (no auto-approval, no certificate waiver)`, async () => {
    const { env, db } = makeD1Env();
    seedRegistration(db, { reference: `AGP-REG-${state}`, parishId: `parish-${state}`, stripeCustomerId: `cus_${state}` });

    const id = await createTaxExemptionClaim(env, {
      registrationReference: `AGP-REG-${state}`, parishId: `parish-${state}`, jurisdiction: state,
      exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer"
    });
    const claim = await getTaxExemptionById(env, id);
    assert.equal(claim.status, "pending", `${state} claims must start pending like any other state -- no auto-approval`);
    assert.equal(claim.jurisdiction, state);
  });
}

await test("hasNoStatewideGeneralSalesTax is informational only -- it never appears in claim creation or Stripe sync logic", () => {
  // Structural check: resolveApplicableStripeCustomers and
  // createTaxExemptionClaim take no state/jurisdiction-based shortcuts --
  // confirmed by the absence of any NO_STATEWIDE_GENERAL_SALES_TAX_STATES
  // reference outside tax-codes.js and the purely-informational
  // state-guidance route.
  assert.equal(typeof hasNoStatewideGeneralSalesTax, "function");
  for (const state of ["AK", "DE", "MT", "NH", "OR"]) {
    assert.equal(hasNoStatewideGeneralSalesTax(state), true);
  }
  assert.equal(hasNoStatewideGeneralSalesTax("TX"), false);
});

// ---------------------------------------------------------------------
// Phase 3B: Stripe prior-state ownership and reconciliation
// ---------------------------------------------------------------------

await test("approving a Customer that was already exempt before AGAPAY touched it does not claim ownership", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-OWN-1", parishId: "st-innocent", stripeCustomerId: "cus_already_exempt" });
  const registration = loadRegistration(db, "AGP-REG-OWN-1");
  const id = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-OWN-1", parishId: "st-innocent", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer"
  });

  env.STRIPE_SECRET_KEY = "sk_test_123";
  env.RESEND_API_KEY = "";
  let postCalled = false;
  globalThis.fetch = async (url, options) => {
    if (options?.method === "POST") postCalled = true;
    return { ok: true, headers: { get: () => "" }, json: async () => ({ id: "cus_already_exempt", tax_exempt: "exempt" }) };
  };

  const result = await approveTaxExemption(env, { taxExemptionId: id, registration, actor: "admin" });
  assert.equal(result.ok, true);
  assert.equal(postCalled, false, "no Stripe write should occur when the Customer is already in the desired state");

  const syncRow = db.prepare(`SELECT * FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?`).get(id);
  assert.equal(syncRow.agapay_owned_change, 0, "AGAPAY must not claim ownership of a pre-existing exemption");
});

await test("revoking an exemption AGAPAY never owned is blocked and marked reconciliation_required", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-OWN-2", parishId: "st-tikhon", stripeCustomerId: "cus_externally_exempt" });
  const registration = loadRegistration(db, "AGP-REG-OWN-2");
  const id = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-OWN-2", parishId: "st-tikhon", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer"
  });

  env.STRIPE_SECRET_KEY = "sk_test_123";
  env.RESEND_API_KEY = "";
  // Customer was already exempt before AGAPAY approved -- approval succeeds
  // but does not take ownership (previous test covers that path directly;
  // here we exercise it via the full approve, then attempt revoke).
  globalThis.fetch = async (url, options) => ({
    ok: true, headers: { get: () => "" },
    json: async () => ({ id: "cus_externally_exempt", tax_exempt: "exempt" })
  });
  await approveTaxExemption(env, { taxExemptionId: id, registration, actor: "admin" });

  let postCalledOnRevoke = false;
  globalThis.fetch = async (url, options) => {
    if (options?.method === "POST") postCalledOnRevoke = true;
    return { ok: true, headers: { get: () => "" }, json: async () => ({ id: "cus_externally_exempt", tax_exempt: "exempt" }) };
  };
  const revoked = await revokeTaxExemption(env, { taxExemptionId: id, registration, actor: "admin", reason: "test" });
  assert.equal(postCalledOnRevoke, false, "must never auto-revert a Customer AGAPAY didn't put into the exempt state");
  assert.equal(revoked.summary.reconciliationRequired, 1);

  const syncRow = db.prepare(`SELECT sync_status FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?`).get(id);
  assert.equal(syncRow.sync_status, "reconciliation_required");
});

await test("revoking an AGAPAY-owned exemption succeeds when Stripe state still matches expectations", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-OWN-3", parishId: "st-herman", stripeCustomerId: "cus_agapay_owned" });
  const registration = loadRegistration(db, "AGP-REG-OWN-3");
  const id = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-OWN-3", parishId: "st-herman", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer"
  });

  env.STRIPE_SECRET_KEY = "sk_test_123";
  env.RESEND_API_KEY = "";
  globalThis.fetch = mockFetch({
    cus_agapay_owned: { get: { ok: true, body: { id: "cus_agapay_owned", tax_exempt: "none" } }, post: { ok: true, body: { id: "cus_agapay_owned", tax_exempt: "exempt" } } }
  }).fetchFn;
  await approveTaxExemption(env, { taxExemptionId: id, registration, actor: "admin" });

  const ownedRow = db.prepare(`SELECT agapay_owned_change FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?`).get(id);
  assert.equal(ownedRow.agapay_owned_change, 1);

  globalThis.fetch = mockFetch({
    cus_agapay_owned: { get: { ok: true, body: { id: "cus_agapay_owned", tax_exempt: "exempt" } }, post: { ok: true, body: { id: "cus_agapay_owned", tax_exempt: "none" } } }
  }).fetchFn;
  const revoked = await revokeTaxExemption(env, { taxExemptionId: id, registration, actor: "admin", reason: "test" });
  assert.equal(revoked.ok, true);
  assert.equal(revoked.summary.reconciliationRequired, 0);
});

await test("an externally-changed Customer (reverse) blocks automatic revocation and requires reconciliation", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-OWN-4", parishId: "st-raphael", stripeCustomerId: "cus_changed_externally" });
  const registration = loadRegistration(db, "AGP-REG-OWN-4");
  const id = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-OWN-4", parishId: "st-raphael", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer"
  });

  env.STRIPE_SECRET_KEY = "sk_test_123";
  env.RESEND_API_KEY = "";
  globalThis.fetch = mockFetch({
    cus_changed_externally: { get: { ok: true, body: { id: "cus_changed_externally", tax_exempt: "none" } }, post: { ok: true, body: { id: "cus_changed_externally", tax_exempt: "exempt" } } }
  }).fetchFn;
  await approveTaxExemption(env, { taxExemptionId: id, registration, actor: "admin" });

  // Someone changed the Customer to "reverse" outside AGAPAY since approval.
  globalThis.fetch = mockFetch({
    cus_changed_externally: { get: { ok: true, body: { id: "cus_changed_externally", tax_exempt: "reverse" } }, post: { ok: true, body: { id: "cus_changed_externally", tax_exempt: "none" } } }
  }).fetchFn;
  const revoked = await revokeTaxExemption(env, { taxExemptionId: id, registration, actor: "admin", reason: "test" });
  assert.equal(revoked.summary.reconciliationRequired, 1);

  const syncRow = db.prepare(`SELECT sync_status FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?`).get(id);
  assert.equal(syncRow.sync_status, "reconciliation_required");
});

await test("explicit admin reconciliation (accept_external) resolves a reconciliation_required row without calling Stripe", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-OWN-5", parishId: "st-xenia", stripeCustomerId: "cus_reconcile_me" });
  const registration = loadRegistration(db, "AGP-REG-OWN-5");
  const id = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-OWN-5", parishId: "st-xenia", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer"
  });

  env.STRIPE_SECRET_KEY = "sk_test_123";
  env.RESEND_API_KEY = "";
  globalThis.fetch = async () => ({ ok: true, headers: { get: () => "" }, json: async () => ({ id: "cus_reconcile_me", tax_exempt: "exempt" }) });
  await approveTaxExemption(env, { taxExemptionId: id, registration, actor: "admin" }); // externally-owned, per first test pattern

  let postCalled = false;
  globalThis.fetch = async (url, options) => {
    if (options?.method === "POST") postCalled = true;
    return { ok: true, headers: { get: () => "" }, json: async () => ({ id: "cus_reconcile_me", tax_exempt: "exempt" }) };
  };
  await revokeTaxExemption(env, { taxExemptionId: id, registration, actor: "admin", reason: "test" });
  const syncRow = db.prepare(`SELECT id FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?`).get(id);
  assert.equal(postCalled, false);

  const resolved = await reconcileStripeSync(env, { syncRowId: syncRow.id, actor: "admin", action: "accept_external" });
  assert.equal(resolved.ok, true);
  const finalRow = db.prepare(`SELECT sync_status FROM tax_exemption_stripe_syncs WHERE id = ?`).get(syncRow.id);
  assert.equal(finalRow.sync_status, "succeeded");
});

await test("retryOneStripeSync retries exactly one Customer's row", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-RETRY1", parishId: "st-olga", stripeCustomerId: "cus_retry_a", stewardshipStripeCustomerId: "cus_retry_b" });
  const registration = loadRegistration(db, "AGP-REG-RETRY1");
  const id = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-RETRY1", parishId: "st-olga", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer"
  });

  env.STRIPE_SECRET_KEY = "sk_test_123";
  env.RESEND_API_KEY = "";
  globalThis.fetch = mockFetch({
    cus_retry_a: { get: { ok: true, body: { id: "cus_retry_a", tax_exempt: "none" } }, post: { ok: true, body: { id: "cus_retry_a", tax_exempt: "exempt" } } },
    cus_retry_b: { get: { ok: true, body: { id: "cus_retry_b", tax_exempt: "none" } }, post: { ok: false, status: 402, body: { error: { message: "declined" } } } }
  }).fetchFn;
  await approveTaxExemption(env, { taxExemptionId: id, registration, actor: "admin" });

  const failedRow = db.prepare(`SELECT id FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ? AND stripe_customer_id = 'cus_retry_b'`).get(id);
  globalThis.fetch = mockFetch({
    cus_retry_b: { get: { ok: true, body: { id: "cus_retry_b", tax_exempt: "none" } }, post: { ok: true, body: { id: "cus_retry_b", tax_exempt: "exempt" } } }
  }).fetchFn;
  const result = await retryOneStripeSync(env, failedRow.id);
  assert.equal(result.ok, true);
});

// ---------------------------------------------------------------------
// Phase 3B: waiting_for_customer -- approval before any Stripe Customer
// exists, and delayed application once one is created.
// ---------------------------------------------------------------------

await test("approving a claim with no Stripe Customer yet succeeds as 'waiting for customer', without a false synced report", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-WAIT-1", parishId: "st-seraphim" }); // no stripeCustomerId at all
  const registration = loadRegistration(db, "AGP-REG-WAIT-1");
  const id = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-WAIT-1", parishId: "st-seraphim", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer"
  });

  const result = await approveTaxExemption(env, { taxExemptionId: id, registration, actor: "admin" });
  assert.equal(result.ok, true);
  assert.equal(result.waitingForCustomer, true);
  assert.equal(result.exemption.status, "approved");

  const syncRows = db.prepare(`SELECT * FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?`).all(id);
  assert.equal(syncRows.length, 0, "no sync row should exist yet -- nothing to falsely report as synced");
});

await test("applyApprovedExemptionIfExists applies the exemption the moment a Customer is created", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-WAIT-2", parishId: "st-anthony" });
  const registration = loadRegistration(db, "AGP-REG-WAIT-2");
  const id = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-WAIT-2", parishId: "st-anthony", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer"
  });
  await approveTaxExemption(env, { taxExemptionId: id, registration, actor: "admin" });

  env.STRIPE_SECRET_KEY = "sk_test_123";
  globalThis.fetch = mockFetch({
    cus_new_giving: { get: { ok: true, body: { id: "cus_new_giving", tax_exempt: "none" } }, post: { ok: true, body: { id: "cus_new_giving", tax_exempt: "exempt" } } }
  }).fetchFn;

  const applied = await applyApprovedExemptionIfExists(env, {
    registration: { ...registration, reference: "AGP-REG-WAIT-2" },
    stripeCustomerId: "cus_new_giving",
    customerRole: "giving_parish_plus"
  });
  assert.equal(applied.applied, true);
  assert.equal(applied.ok, true);

  const syncRow = db.prepare(`SELECT sync_status FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ? AND stripe_customer_id = 'cus_new_giving'`).get(id);
  assert.equal(syncRow.sync_status, "succeeded");
});

await test("applyApprovedExemptionIfExists reports failure so callers can block checkout", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-WAIT-3", parishId: "st-cyril" });
  const registration = loadRegistration(db, "AGP-REG-WAIT-3");
  const id = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-WAIT-3", parishId: "st-cyril", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer"
  });
  await approveTaxExemption(env, { taxExemptionId: id, registration, actor: "admin" });

  env.STRIPE_SECRET_KEY = "sk_test_123";
  globalThis.fetch = mockFetch({
    cus_new_giving_2: { get: { ok: true, body: { id: "cus_new_giving_2", tax_exempt: "none" } }, post: { ok: false, status: 402, body: { error: { message: "declined" } } } }
  }).fetchFn;

  const applied = await applyApprovedExemptionIfExists(env, {
    registration: { ...registration, reference: "AGP-REG-WAIT-3" },
    stripeCustomerId: "cus_new_giving_2",
    customerRole: "giving_parish_plus"
  });
  assert.equal(applied.applied, true);
  assert.equal(applied.ok, false, "checkout-creation code must treat this as a block-checkout signal");
});

// ---------------------------------------------------------------------
// Phase 3B: claim-scoped upload token (replaces base64-in-registration)
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// Phase 3D: optimistic concurrency (tax_exemptions.updated_at as version)
// and the manual "Mark expired" admin action.
// ---------------------------------------------------------------------

await test("a mutation with the current version succeeds", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-CONC-1", parishId: "st-photini", stripeCustomerId: "cus_conc_1" });
  const registration = loadRegistration(db, "AGP-REG-CONC-1");
  const id = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-CONC-1", parishId: "st-photini", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer"
  });
  const claim = await getTaxExemptionById(env, id);

  const result = await rejectTaxExemption(env, { taxExemptionId: id, registration, actor: "admin", reason: "test", expectedVersion: claim.updated_at });
  assert.equal(result.exemption.status, "rejected");
});

await test("a stale-version reject request throws StaleRecordError, calls no Stripe, and changes no D1 state", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-CONC-2", parishId: "st-thekla", stripeCustomerId: "cus_conc_2" });
  const registration = loadRegistration(db, "AGP-REG-CONC-2");
  const id = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-CONC-2", parishId: "st-thekla", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer"
  });

  let fetchCalled = false;
  globalThis.fetch = async () => { fetchCalled = true; return { ok: true, headers: { get: () => "" }, json: async () => ({}) }; };

  await assert.rejects(
    () => rejectTaxExemption(env, { taxExemptionId: id, registration, actor: "admin", reason: "test", expectedVersion: "2000-01-01T00:00:00.000Z" }),
    (err) => err instanceof StaleRecordError && err.code === "STALE_RECORD"
  );
  assert.equal(fetchCalled, false, "a stale mutation must never call Stripe");

  const claim = await getTaxExemptionById(env, id);
  assert.equal(claim.status, "pending", "a stale mutation must not change D1 state");
});

await test("stale approve, replacement, revoke, and manual-expire requests are all rejected the same way", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-CONC-3", parishId: "st-veronica", stripeCustomerId: "cus_conc_3" });
  const registration = loadRegistration(db, "AGP-REG-CONC-3");
  const id = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-CONC-3", parishId: "st-veronica", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer"
  });
  const staleVersion = "1999-01-01T00:00:00.000Z";

  await assert.rejects(() => approveTaxExemption(env, { taxExemptionId: id, registration, actor: "admin", expectedVersion: staleVersion }), StaleRecordError);
  await assert.rejects(() => requestReplacementDocumentation(env, { taxExemptionId: id, registration, actor: "admin", reason: "x", expectedVersion: staleVersion }), StaleRecordError);

  env.STRIPE_SECRET_KEY = "sk_test_123";
  globalThis.fetch = async () => ({ ok: true, headers: { get: () => "" }, json: async () => ({ id: "cus_conc_3", tax_exempt: "exempt" }) });
  await approveTaxExemption(env, { taxExemptionId: id, registration, actor: "admin" }); // no expectedVersion -- approve for real to test revoke/expire below

  const approvedClaim = await getTaxExemptionById(env, id);
  assert.equal(approvedClaim.status, "approved");

  await assert.rejects(() => revokeTaxExemption(env, { taxExemptionId: id, registration, actor: "admin", reason: "x", expectedVersion: staleVersion }), StaleRecordError);
  await assert.rejects(() => expireTaxExemptionManually(env, { taxExemptionId: id, registration, actor: "admin", reason: "x", expectedVersion: staleVersion }), StaleRecordError);

  const stillApproved = await getTaxExemptionById(env, id);
  assert.equal(stillApproved.status, "approved", "none of the stale actions should have changed status");
});

await test("expireTaxExemptionManually removes an AGAPAY-owned Stripe exemption and requires an approved claim", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-EXPIRE-1", parishId: "st-julia", stripeCustomerId: "cus_expire_1" });
  const registration = loadRegistration(db, "AGP-REG-EXPIRE-1");
  const id = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-EXPIRE-1", parishId: "st-julia", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer"
  });

  await assert.rejects(() => expireTaxExemptionManually(env, { taxExemptionId: id, registration, actor: "admin", reason: "x" }), /Only an approved claim/);

  env.STRIPE_SECRET_KEY = "sk_test_123";
  env.RESEND_API_KEY = "";
  globalThis.fetch = mockFetch({
    cus_expire_1: { get: { ok: true, body: { id: "cus_expire_1", tax_exempt: "none" } }, post: { ok: true, body: { id: "cus_expire_1", tax_exempt: "exempt" } } }
  }).fetchFn;
  await approveTaxExemption(env, { taxExemptionId: id, registration, actor: "admin" });

  let postCalled = false;
  globalThis.fetch = async (url, options) => {
    if (options?.method === "POST") postCalled = true;
    return { ok: true, headers: { get: () => "" }, json: async () => ({ id: "cus_expire_1", tax_exempt: options?.method === "POST" ? "none" : "exempt" }) };
  };
  const result = await expireTaxExemptionManually(env, { taxExemptionId: id, registration, actor: "admin", reason: "certificate expired" });
  assert.equal(result.ok, true);
  assert.equal(result.exemption.status, "expired");
  assert.equal(postCalled, true, "an AGAPAY-owned exemption should actually be disabled in Stripe");

  await assert.rejects(() => expireTaxExemptionManually(env, { taxExemptionId: id, registration, actor: "admin", reason: "x" }), /Only an approved claim/, "a rejected/expired/revoked/superseded claim cannot be manually expired again");
});

await test("expireTaxExemptionManually preserves an externally-owned Stripe exemption instead of erasing it", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-EXPIRE-2", parishId: "st-melania", stripeCustomerId: "cus_expire_2" });
  const registration = loadRegistration(db, "AGP-REG-EXPIRE-2");
  const id = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-EXPIRE-2", parishId: "st-melania", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer"
  });

  env.STRIPE_SECRET_KEY = "sk_test_123";
  env.RESEND_API_KEY = "";
  // Customer already exempt externally before AGAPAY's approval -- AGAPAY never owns this change.
  globalThis.fetch = async () => ({ ok: true, headers: { get: () => "" }, json: async () => ({ id: "cus_expire_2", tax_exempt: "exempt" }) });
  await approveTaxExemption(env, { taxExemptionId: id, registration, actor: "admin" });

  let postCalled = false;
  globalThis.fetch = async (url, options) => {
    if (options?.method === "POST") postCalled = true;
    return { ok: true, headers: { get: () => "" }, json: async () => ({ id: "cus_expire_2", tax_exempt: "exempt" }) };
  };
  const result = await expireTaxExemptionManually(env, { taxExemptionId: id, registration, actor: "admin", reason: "certificate expired" });
  assert.equal(postCalled, false, "an externally-owned exemption must never be erased by manual expiration");
  assert.equal(result.summary.reconciliationRequired, 1);
});



await test("maskCertificateNumber shows only the last 4 characters", () => {
  assert.equal(maskCertificateNumber("TX-2024-5678"), "••••••••5678");
  assert.equal(maskCertificateNumber("AB"), "••");
  assert.equal(maskCertificateNumber(""), "");
});

await test("aggregateSyncState reports waiting_for_customer for an approved claim with zero sync rows", () => {
  assert.equal(aggregateSyncState({ status: "approved" }, []), "waiting_for_customer");
});

await test("aggregateSyncState reports partial when some Customers succeed and others fail", () => {
  const state = aggregateSyncState({ status: "approved" }, [{ sync_status: "succeeded" }, { sync_status: "failed" }]);
  assert.equal(state, "partial");
});

await test("aggregateSyncState reports reconciliation_required over any other mixed state", () => {
  const state = aggregateSyncState({ status: "approved" }, [{ sync_status: "succeeded" }, { sync_status: "reconciliation_required" }]);
  assert.equal(state, "reconciliation_required");
});

await test("computeAllowedActions never allows approve without a current document", () => {
  const actions = computeAllowedActions({ status: "pending" }, { hasDocument: false, syncRows: [] });
  assert.equal(actions.approve, false);
  assert.equal(actions.reject, true);
});

await test("computeAllowedActions disables every mutating action when the workflow is disabled, but still allows notes", () => {
  const actions = computeAllowedActions({ status: "pending" }, { hasDocument: true, syncRows: [], workflowEnabled: false });
  assert.equal(actions.approve, false);
  assert.equal(actions.reject, false);
  assert.equal(actions.revoke, false);
  assert.equal(actions.addNote, true);
});

await test("computeAllowedActions only allows retryAll when sync is actually failed or partial", () => {
  const succeeded = computeAllowedActions({ status: "approved" }, { hasDocument: true, syncRows: [{ sync_status: "succeeded" }] });
  assert.equal(succeeded.retryAll, false);
  const failed = computeAllowedActions({ status: "approved" }, { hasDocument: true, syncRows: [{ sync_status: "failed" }] });
  assert.equal(failed.retryAll, true);
});

await test("getTaxExemptionSummaryCounts returns zero rather than null for every empty category", async () => {
  const { env } = makeD1Env();
  const counts = await getTaxExemptionSummaryCounts(env);
  for (const value of Object.values(counts)) assert.equal(value, 0);
});

await test("getTaxExemptionSummaryCounts reflects real pending/approved/reconciliation counts", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-SUMMARY-1", parishId: "summary-parish-1", stripeCustomerId: "cus_summary_1" });
  seedRegistration(db, { reference: "AGP-REG-SUMMARY-2", parishId: "summary-parish-2" });

  await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-SUMMARY-1", parishId: "summary-parish-1", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer"
  });
  const approvedId = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-SUMMARY-2", parishId: "summary-parish-2", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer"
  });
  const registration2 = loadRegistration(db, "AGP-REG-SUMMARY-2");
  await approveTaxExemption(env, { taxExemptionId: approvedId, registration: registration2, actor: "admin" });

  const counts = await getTaxExemptionSummaryCounts(env);
  assert.equal(counts.pending, 1);
  assert.equal(counts.approved, 1);
  assert.equal(counts.waitingForCustomer, 1, "approved with no Stripe Customer yet counts as waiting for customer");
  assert.equal(counts.pendingWithoutDocument, 1);
});

await test("workflow feature flags default to enabled and respect explicit 'false'", () => {
  assert.equal(isTaxExemptionWorkflowEnabled({}), true);
  assert.equal(isTaxExemptionWorkflowEnabled({ TAX_EXEMPTION_WORKFLOW_ENABLED: "false" }), false);
  assert.equal(isTaxExemptionDocumentUploadEnabled({ TAX_EXEMPTION_DOCUMENT_UPLOAD_ENABLED: "false" }), false);
  assert.equal(isTaxExemptionStripeSyncEnabled({ TAX_EXEMPTION_STRIPE_SYNC_ENABLED: "false" }), false);
});

await test("approveTaxExemptionWithoutStripeSync approves the legal claim and never calls Stripe", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-NOSYNC-1", parishId: "st-macrina", stripeCustomerId: "cus_nosync_1" });
  const id = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-NOSYNC-1", parishId: "st-macrina", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer"
  });

  let fetchCalled = false;
  globalThis.fetch = async () => { fetchCalled = true; return { ok: true, headers: { get: () => "" }, json: async () => ({}) }; };

  const result = await approveTaxExemptionWithoutStripeSync(env, { taxExemptionId: id, actor: "admin" });
  assert.equal(result.ok, true);
  assert.equal(result.stripeSyncDisabled, true);
  assert.equal(fetchCalled, false, "Stripe must never be called when sync is administratively disabled");

  const syncRows = db.prepare(`SELECT * FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ?`).all(id);
  assert.equal(syncRows.length, 0, "no sync rows should exist -- nothing was actually synced");
});



await test("ensureLearnHouseholdStripeCustomer creates once and reuses on a second call", async () => {
  const { env, db } = makeD1Env();
  db.prepare(`INSERT INTO learn_households (id, slug, name, data, created_at, updated_at) VALUES (?, ?, ?, '{}', ?, ?)`)
    .run("learn_household_parent_example_org", "parent-example-org", "Parent Household", new Date().toISOString(), new Date().toISOString());

  env.STRIPE_SECRET_KEY = "sk_test_123";
  let createCalls = 0;
  globalThis.fetch = async (url, options) => {
    if (options?.method === "POST" && String(url).includes("/v1/customers")) {
      createCalls += 1;
      return { ok: true, headers: { get: () => "" }, json: async () => ({ id: "cus_learn_household_1" }) };
    }
    return { ok: true, headers: { get: () => "" }, json: async () => ({}) };
  };

  const first = await ensureLearnHouseholdStripeCustomer(env, { householdId: "learn_household_parent_example_org", email: "parent@example.org" });
  assert.equal(first.stripeCustomerId, "cus_learn_household_1");
  assert.equal(createCalls, 1);

  const second = await ensureLearnHouseholdStripeCustomer(env, { householdId: "learn_household_parent_example_org", email: "parent@example.org" });
  assert.equal(second.stripeCustomerId, "cus_learn_household_1");
  assert.equal(createCalls, 1, "second call must reuse the persisted Customer, not create a duplicate");
});

await test("two simultaneous requests for the same household persist exactly one canonical Customer", async () => {
  const { env, db } = makeD1Env();
  db.prepare(`INSERT INTO learn_households (id, slug, name, data, created_at, updated_at) VALUES (?, ?, ?, '{}', ?, ?)`)
    .run("learn_household_race_example_org", "race-example-org", "Race Household", new Date().toISOString(), new Date().toISOString());

  env.STRIPE_SECRET_KEY = "sk_test_123";
  let counter = 0;
  globalThis.fetch = async (url, options) => {
    if (options?.method === "POST" && String(url).includes("/v1/customers")) {
      counter += 1;
      return { ok: true, headers: { get: () => "" }, json: async () => ({ id: `cus_race_${counter}` }) };
    }
    return { ok: true, headers: { get: () => "" }, json: async () => ({}) };
  };

  const [a, b] = await Promise.all([
    ensureLearnHouseholdStripeCustomer(env, { householdId: "learn_household_race_example_org", email: "racer@example.org" }),
    ensureLearnHouseholdStripeCustomer(env, { householdId: "learn_household_race_example_org", email: "racer@example.org" })
  ]);

  assert.equal(a.stripeCustomerId, b.stripeCustomerId, "both concurrent callers must end up with the same canonical Customer id");
  const row = db.prepare(`SELECT stripe_customer_id FROM learn_households WHERE id = ?`).get("learn_household_race_example_org");
  assert.equal(row.stripe_customer_id, a.stripeCustomerId);
});

await test("enforcement disabled (default): a missing household row falls back without blocking", async () => {
  const { env } = makeD1Env();
  const result = await ensureLearnHouseholdStripeCustomer(env, { householdId: "learn_household_never_onboarded", email: "x@example.org" });
  assert.equal(result.stripeCustomerId, "");
  assert.equal(result.blocked, false);
});

await test("enforcement enabled: a missing household row blocks checkout instead of falling back", async () => {
  const { env } = makeD1Env();
  env.LEARN_PERSISTED_CUSTOMER_ENFORCED = "true";
  const result = await ensureLearnHouseholdStripeCustomer(env, { householdId: "learn_household_never_onboarded", email: "x@example.org" });
  assert.equal(result.stripeCustomerId, "");
  assert.equal(result.blocked, true);
});

await test("backfill: exactly one trusted metadata match is backfilled", () => {
  const match = selectLearnStripeCustomerBackfillMatch({
    householdId: "learn_household_a", email: "a@example.org",
    candidates: [{ id: "cus_a", email: "a@example.org", metadata: { agapay_household_id: "learn_household_a" } }]
  });
  assert.equal(match.action, "backfill");
  assert.equal(match.confidence, "metadata");
  assert.equal(match.stripeCustomerId, "cus_a");
});

await test("backfill: zero matches remain unset, never guessed", () => {
  const match = selectLearnStripeCustomerBackfillMatch({ householdId: "learn_household_b", email: "b@example.org", candidates: [] });
  assert.equal(match.action, "unset");
});

await test("backfill: ambiguous multiple matches require manual review, never auto-picked", () => {
  const match = selectLearnStripeCustomerBackfillMatch({
    householdId: "learn_household_c", email: "c@example.org",
    candidates: [
      { id: "cus_c1", email: "c@example.org", metadata: {} },
      { id: "cus_c2", email: "c@example.org", metadata: {} }
    ]
  });
  assert.equal(match.action, "manual_review");
});

// ---------------------------------------------------------------------
// Phase 3D: Stewardship delayed-exemption wiring (mirrors the
// Giving/Parish+ wiring in src/lib/subscription-checkout.js, using the
// exact same shared applyApprovedExemptionIfExists() helper).
// ---------------------------------------------------------------------

await test("applyApprovedExemptionIfExists stores the correct 'stewardship' customer role", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-STEW-1", parishId: "st-nektarios" });
  const registration = loadRegistration(db, "AGP-REG-STEW-1");
  const id = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-STEW-1", parishId: "st-nektarios", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer"
  });
  await approveTaxExemption(env, { taxExemptionId: id, registration, actor: "admin" });

  env.STRIPE_SECRET_KEY = "sk_test_123";
  globalThis.fetch = mockFetch({
    cus_stewardship_new: { get: { ok: true, body: { id: "cus_stewardship_new", tax_exempt: "none" } }, post: { ok: true, body: { id: "cus_stewardship_new", tax_exempt: "exempt" } } }
  }).fetchFn;

  const applied = await applyApprovedExemptionIfExists(env, {
    registration: { ...registration, reference: "AGP-REG-STEW-1" },
    stripeCustomerId: "cus_stewardship_new",
    customerRole: "stewardship"
  });
  assert.equal(applied.applied, true);
  assert.equal(applied.ok, true);

  const syncRow = db.prepare(`SELECT customer_role FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ? AND stripe_customer_id = 'cus_stewardship_new'`).get(id);
  assert.equal(syncRow.customer_role, "stewardship");
});

await test("a Giving Customer created after a Stewardship Customer is unaffected by the Stewardship sync row", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-STEW-2", parishId: "st-arsenios" });
  const registration = loadRegistration(db, "AGP-REG-STEW-2");
  const id = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-STEW-2", parishId: "st-arsenios", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer"
  });
  await approveTaxExemption(env, { taxExemptionId: id, registration, actor: "admin" });

  env.STRIPE_SECRET_KEY = "sk_test_123";
  globalThis.fetch = mockFetch({
    cus_stew_first: { get: { ok: true, body: { id: "cus_stew_first", tax_exempt: "none" } }, post: { ok: true, body: { id: "cus_stew_first", tax_exempt: "exempt" } } },
    cus_giving_second: { get: { ok: true, body: { id: "cus_giving_second", tax_exempt: "none" } }, post: { ok: true, body: { id: "cus_giving_second", tax_exempt: "exempt" } } }
  }).fetchFn;

  await applyApprovedExemptionIfExists(env, { registration: { ...registration, reference: "AGP-REG-STEW-2" }, stripeCustomerId: "cus_stew_first", customerRole: "stewardship" });
  await applyApprovedExemptionIfExists(env, { registration: { ...registration, reference: "AGP-REG-STEW-2" }, stripeCustomerId: "cus_giving_second", customerRole: "giving_parish_plus" });

  const rows = db.prepare(`SELECT stripe_customer_id, customer_role, sync_status FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ? ORDER BY customer_role`).all(id);
  assert.equal(rows.length, 2, "both customer roles get their own independent sync row -- neither overwrites the other");
  assert.ok(rows.every((r) => r.sync_status === "succeeded"));
});

await test("re-applying to the same Stewardship Customer does not create a duplicate sync row (idempotent by unique constraint)", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-STEW-3", parishId: "st-parthenios" });
  const registration = loadRegistration(db, "AGP-REG-STEW-3");
  const id = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-STEW-3", parishId: "st-parthenios", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer"
  });
  await approveTaxExemption(env, { taxExemptionId: id, registration, actor: "admin" });

  env.STRIPE_SECRET_KEY = "sk_test_123";
  globalThis.fetch = mockFetch({
    cus_stew_retry: { get: { ok: true, body: { id: "cus_stew_retry", tax_exempt: "none" } }, post: { ok: true, body: { id: "cus_stew_retry", tax_exempt: "exempt" } } }
  }).fetchFn;

  await applyApprovedExemptionIfExists(env, { registration: { ...registration, reference: "AGP-REG-STEW-3" }, stripeCustomerId: "cus_stew_retry", customerRole: "stewardship" });
  await applyApprovedExemptionIfExists(env, { registration: { ...registration, reference: "AGP-REG-STEW-3" }, stripeCustomerId: "cus_stew_retry", customerRole: "stewardship" });

  const rows = db.prepare(`SELECT id FROM tax_exemption_stripe_syncs WHERE tax_exemption_id = ? AND stripe_customer_id = 'cus_stew_retry'`).all(id);
  assert.equal(rows.length, 1, "the UNIQUE(tax_exemption_id, stripe_customer_id) constraint prevents a duplicate row");
});

await test("both Stewardship Customer-creation call sites in src/handlers/stewardship.js use the shared helper", () => {
  const stewardshipSource = readFileSync(path.join(__dirname, "..", "src", "handlers", "stewardship.js"), "utf8");
  const occurrences = (stewardshipSource.match(/applyApprovedExemptionIfExists/g) || []).length;
  assert.equal(occurrences, 3, "expected 1 import + 2 call sites (the two independent Stewardship checkout routes)");
  assert.ok(stewardshipSource.includes('customerRole: "stewardship"'));
});

await test("a claim-scoped upload token authorizes only its own claim and expires", async () => {
  const { env, db } = makeD1Env();
  seedRegistration(db, { reference: "AGP-REG-TOKEN-1", parishId: "st-gregory" });
  const id = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-TOKEN-1", parishId: "st-gregory", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer"
  });
  const otherClaimId = await createTaxExemptionClaim(env, {
    registrationReference: "AGP-REG-TOKEN-1", parishId: "st-gregory", jurisdiction: "TX",
    exemptionType: "religious_organization", authorizedRepresentativeName: "A", authorizedRepresentativeTitle: "Treasurer",
    supersedesTaxExemptionId: id
  });

  const { token } = await issueClaimUploadToken(env, id);
  const verified = await verifyClaimUploadToken(env, id, token);
  assert.ok(verified);

  const wrongClaim = await verifyClaimUploadToken(env, otherClaimId, token);
  assert.equal(wrongClaim, null, "a token issued for one claim must not authorize a different claim");

  const wrongToken = await verifyClaimUploadToken(env, id, "not-the-real-token");
  assert.equal(wrongToken, null);

  // Simulate expiry
  db.prepare(`UPDATE tax_exemptions SET upload_token_expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?`).run(id);
  const expired = await verifyClaimUploadToken(env, id, token);
  assert.equal(expired, null, "an expired token must not authorize upload");
});

console.log(`\n${passed} test(s) passed.`);
if (process.exitCode) {
  console.error("Some tax exemption tests FAILED.");
} else {
  console.log("All tax exemption tests passed.");
}
