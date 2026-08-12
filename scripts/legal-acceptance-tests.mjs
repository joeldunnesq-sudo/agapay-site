import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CURRENT_TERMS_SHA256,
  CURRENT_TERMS_VERSION,
  ORGANIZATION_ACCEPTANCE_DISCLOSURE,
  recordLegalAcceptance,
} from "../src/lib/legal-acceptance.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = path.join(root, "docs", "legal", "terms", `terms-${CURRENT_TERMS_VERSION}.html`);
const snapshot = readFileSync(snapshotPath, "utf8");
const canonicalSnapshot = snapshot.replace(/\r\n/g, "\n");
assert.equal(createHash("sha256").update(canonicalSnapshot).digest("hex"), CURRENT_TERMS_SHA256, "published Terms snapshot hash must match the acceptance record constant");
assert.equal(snapshot, readFileSync(path.join(root, "public", "terms.html"), "utf8"), "the current public Terms must exactly match the preserved snapshot");
assert.ok(readFileSync(path.join(root, "docs", "legal", "terms", "terms-2026-08-01.html"), "utf8").includes("Last updated: August 1, 2026"), "the superseded Terms version must remain preserved");

const db = new DatabaseSync(":memory:");
db.exec(readFileSync(path.join(root, "migrations", "0088_legal_acceptances.sql"), "utf8"));
db.exec(readFileSync(path.join(root, "migrations", "0095_finalized_legal_terms.sql"), "utf8"));
const env = {
  AGAPAY_DB: {
    prepare(sql) {
      return {
        params: [],
        bind(...params) { this.params = params; return this; },
        async first() { return db.prepare(sql).get(...this.params) || null; },
        async run() { const info = db.prepare(sql).run(...this.params); return { success: true, meta: { changes: info.changes } }; },
      };
    },
  },
};
const request = new Request("https://agapay.test/api/registrations", {
  method: "POST",
  headers: { "CF-Connecting-IP": "203.0.113.10", "User-Agent": "AGAPAY legal test" },
});
const record = await recordLegalAcceptance(env, request, {
  actorType: "organization_representative",
  subjectUserId: "rector@example.test",
  organizationId: "st-test",
  actorName: "Fr. Test",
  actorEmail: "rector@example.test",
  actorRole: "Rector",
  disclosureText: ORGANIZATION_ACCEPTANCE_DISCLOSURE,
  acceptanceSource: "church_registration",
  transactionReference: "AGP-REG-TEST",
});
const stored = db.prepare("SELECT * FROM legal_acceptances WHERE id = ?").get(record.id);
assert.equal(stored.terms_version, CURRENT_TERMS_VERSION);
assert.equal(stored.terms_sha256, CURRENT_TERMS_SHA256);
assert.equal(stored.disclosure_text, ORGANIZATION_ACCEPTANCE_DISCLOSURE);
assert.equal(stored.ip_address, "203.0.113.10");
assert.equal(stored.user_agent, "AGAPAY legal test");
assert.equal(stored.dispute_resolution_mode, "courts_no_mandatory_arbitration");
assert.throws(() => db.prepare("UPDATE legal_acceptances SET actor_name = 'Changed' WHERE id = ?").run(record.id), /append-only/);
assert.throws(() => db.prepare("DELETE FROM legal_acceptances WHERE id = ?").run(record.id), /append-only/);
assert.throws(() => db.prepare("UPDATE legal_terms_versions SET snapshot_path = 'changed' WHERE version = ?").run(CURRENT_TERMS_VERSION), /append-only/);
assert.throws(() => db.prepare("DELETE FROM legal_terms_versions WHERE version = ?").run(CURRENT_TERMS_VERSION), /append-only/);

const register = readFileSync(path.join(root, "public", "register.html"), "utf8");
const signup = readFileSync(path.join(root, "public", "myagapay", "signup.html"), "utf8");
const legacySignup = readFileSync(path.join(root, "public", "donor", "signup.html"), "utf8");
const accountLogin = readFileSync(path.join(root, "public", "myagapay", "login.html"), "utf8");
const parishLogin = readFileSync(path.join(root, "public", "parish", "login.html"), "utf8");
assert.match(register, /id="agreeTerms"[\s\S]*id="submitBtn"[^>]*disabled/);
assert.match(register, /target="_blank" rel="noopener noreferrer">Terms of Service/);
assert.match(signup, /id="agreeTerms" type="checkbox" required/);
assert.match(signup, /id="signupSubmit"[^>]*disabled/);
assert.match(legacySignup, /id="agreeTerms" type="checkbox" required/);
assert.match(legacySignup, /id="signupSubmit"[^>]*disabled/);
assert.doesNotMatch(accountLogin, /donorAgreeTerms|termsAccepted|Terms of Service|Privacy Policy/);
assert.doesNotMatch(parishLogin, /parishAgreeTerms|termsAccepted|Terms of Service|Privacy Policy/);

console.log("Append-only legal acceptance tests passed.");
