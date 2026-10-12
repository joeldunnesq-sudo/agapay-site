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
  recordOrganizationRegistrationAcceptance,
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
const priorVersions = db.prepare("SELECT * FROM legal_terms_versions ORDER BY version").all();
db.exec(readFileSync(path.join(root, "migrations", "0113_portability_legal_notices.sql"), "utf8"));
assert.deepEqual(db.prepare("SELECT * FROM legal_terms_versions WHERE version <> ? ORDER BY version").all(CURRENT_TERMS_VERSION), priorVersions, "publishing revised Terms must preserve prior version records");
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM legal_acceptances").get().n, 0, "publishing a notice must not fabricate user acceptance");
const publishedVersion = db.prepare("SELECT * FROM legal_terms_versions WHERE version = ?").get(CURRENT_TERMS_VERSION);
assert.equal(publishedVersion.content_sha256, CURRENT_TERMS_SHA256);
assert.equal(publishedVersion.snapshot_path, `docs/legal/terms/terms-${CURRENT_TERMS_VERSION}.html`);
assert.equal(publishedVersion.effective_for_new_users_at, "2026-08-30T00:00:00.000Z");
assert.equal(publishedVersion.effective_for_existing_users_at, "2026-09-29T00:00:00.000Z");
const previousSnapshot = readFileSync(path.join(root, "docs", "legal", "terms", "terms-2026-08-02-final.html"), "utf8").replace(/\r\n/g, "\n");
assert.equal(createHash("sha256").update(previousSnapshot).digest("hex"), priorVersions.find(row => row.version === "2026-08-02-final").content_sha256, "the prior accepted Terms must remain unchanged");
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

const input = {
  actorType: 'organization_representative', actorName: 'Test', actorEmail: ' TEST@EXAMPLE.TEST ', actorRole: 'Officer',
  disclosureText: ORGANIZATION_ACCEPTANCE_DISCLOSURE, acceptanceSource: 'test', transactionReference: 'test-reference',
};
const kvRecords = new Map();
let writes = 0;
const kvEnv = { AGAPAY_REGISTRATIONS: {
  async get(key) { return kvRecords.get(key) || null; },
  async put(key, value) { writes++; kvRecords.set(key, value); },
} };
const firstKv = await recordLegalAcceptance(kvEnv, request, input);
const originalStored = kvRecords.get('legal_acceptance:' + firstKv.id);
const repeated = await recordLegalAcceptance(kvEnv, request, { ...input, actorName: 'Changed' });
assert.equal(repeated.id, firstKv.id);
assert.equal(writes, 1, 'repeated acceptance identity must not overwrite evidence');
assert.equal(kvRecords.get('legal_acceptance:' + firstKv.id), originalStored);
assert.equal(firstKv.actorEmail, 'test@example.test');
for (const key of ['actorType', 'actorName', 'actorEmail', 'actorRole', 'disclosureText', 'acceptanceSource', 'transactionReference']) {
  await assert.rejects(recordLegalAcceptance(kvEnv, request, { ...input, [key]: ' ' }), /required to preserve legal acceptance evidence/);
}
assert.equal(writes, 1, 'validation failures must not write records');
await assert.rejects(recordLegalAcceptance({}, request, input), /legal acceptance store is required/);
await assert.rejects(recordLegalAcceptance({ AGAPAY_REGISTRATIONS: { async get() { throw new Error('store read failed'); } } }, request, input), /store read failed/);
const org = await recordOrganizationRegistrationAcceptance(kvEnv, new Request('https://example.test', { headers: { 'X-Forwarded-For': '203.0.113.1, 203.0.113.2' } }), {
  body: { acceptingName: 'Officer', acceptingEmail: 'officer@example.test', acceptingRole: 'Secretary' }, parishId: 'parish-a', reference: 'organization-reference',
});
assert.equal(org.organizationId, 'parish-a');
assert.equal(org.subjectUserId, 'officer@example.test');
assert.equal(org.acceptanceSource, 'church_registration');
assert.equal(org.disclosureText, ORGANIZATION_ACCEPTANCE_DISCLOSURE);
assert.equal(org.ipAddress, '203.0.113.1');
const duplicateD1 = await recordLegalAcceptance(env, request, { ...input, transactionReference: 'd1-duplicate' });
await recordLegalAcceptance(env, request, { ...input, transactionReference: 'd1-duplicate', actorName: 'Changed' });
assert.equal(db.prepare('SELECT actor_name FROM legal_acceptances WHERE id = ?').get(duplicateD1.id).actor_name, 'Test');
const long = await recordLegalAcceptance(kvEnv, new Request('https://example.test', { headers: { 'User-Agent': 'x'.repeat(1100) } }), { ...input, transactionReference: 'long', actorName: 'x'.repeat(300), subjectUserId: 'x'.repeat(400), organizationId: 'x'.repeat(300) });
assert.equal(long.actorName.length, 200);
assert.equal(long.subjectUserId.length, 320);
assert.equal(long.organizationId.length, 200);
assert.equal(long.userAgent.length, 1000);
db.close();

console.log("Append-only legal acceptance tests passed.");
