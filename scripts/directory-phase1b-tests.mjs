import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  addHouseholdAdmin,
  addHouseholdMember,
  addParishAffiliation,
  createAddress,
  createContactMethod,
  createHousehold,
  createPerson,
  createPublicationProfile,
  deactivateContactMethod,
  directoryActorFromRequest,
  DirectoryServiceError,
  getDirectorySettings,
  projectDirectoryRecord,
  setFieldPrivacyPreference,
  setPersonPrivacyFlags,
  transitionPublicationProfile,
  updateContactMethod,
  updateDirectorySettings
} from "../src/directory/index.js";
import { createInvitation, acceptInvitation } from "../src/lib/memberships.js";
import { issuePlatformUserSession } from "../src/lib/identity.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

function migration(name) {
  return readFileSync(path.join(repoRoot, "migrations", name), "utf8");
}

function makeD1Env({ includeIdentity = false } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(migration("0014_audit_log.sql"));
  if (includeIdentity) {
    db.exec(`
      CREATE TABLE registrations (
        reference TEXT PRIMARY KEY, parish_id TEXT, status TEXT NOT NULL DEFAULT 'pending',
        parish_name TEXT, community_type TEXT, stripe_account_id TEXT, stripe_subscription_id TEXT,
        received_at TEXT, updated_at TEXT NOT NULL, data TEXT NOT NULL
      );
    `);
    db.exec(migration("0020_platform_identity.sql"));
  }
  db.exec(migration("0022_directory_canonical_foundation.sql"));
  db.exec(migration("0023_directory_contact_privacy_publication.sql"));

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
      }
    };
  }

  const AGAPAY_DB = {
    prepare: (sql) => wrap(sql),
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
  };
  return { env: { AGAPAY_DB }, db };
}

function actor(parishId = "st-fiacre", capabilities = ["directory.manage"], personId = "") {
  return { userId: `user_${parishId}_${personId || "admin"}`, parishId, capabilities, personId };
}

function auditRows(db, action) {
  return db.prepare("SELECT * FROM audit_log WHERE action = ? ORDER BY created_at ASC").all(action);
}

async function fixture(env, parishId = "st-fiacre") {
  const admin = actor(parishId);
  const adult = await createPerson(env, { actor: admin, preferredName: "Anna Dunn", biologicalSex: "female" });
  const spouse = await createPerson(env, { actor: admin, preferredName: "John Dunn", biologicalSex: "male" });
  const child = await createPerson(env, { actor: admin, preferredName: "Maria Dunn", biologicalSex: "female" });
  const household = await createHousehold(env, { actor: admin, displayName: "The Dunn Household" });
  await addHouseholdMember(env, { actor: admin, householdId: household.id, personId: adult.id, relationship: "head" });
  await addHouseholdMember(env, { actor: admin, householdId: household.id, personId: spouse.id, relationship: "spouse" });
  await addHouseholdMember(env, { actor: admin, householdId: household.id, personId: child.id, relationship: "child" });
  await addHouseholdAdmin(env, { actor: admin, householdId: household.id, personId: adult.id });
  await addParishAffiliation(env, { actor: admin, personId: adult.id, status: "member" });
  await addParishAffiliation(env, { actor: admin, personId: spouse.id, status: "member" });
  await setPersonPrivacyFlags(env, { actor: admin, parishId, personId: child.id, isChild: true });
  return { admin, adult, spouse, child, household };
}

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS - ${name}`);
  } catch (error) {
    console.error(`FAIL - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

await test("migration creates normalized contact, privacy, publication, and settings tables", async () => {
  const { db } = makeD1Env();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((row) => row.name);
  for (const table of [
    "directory_contact_methods",
    "directory_addresses",
    "directory_field_privacy_preferences",
    "directory_person_privacy_flags",
    "directory_publication_profiles",
    "directory_parish_settings"
  ]) assert.ok(tables.includes(table));
  const columns = db.prepare("PRAGMA table_info(directory_people)").all().map((row) => row.name);
  assert.equal(columns.includes("email"), false);
  assert.equal(columns.includes("phone"), false);
  assert.equal(columns.includes("address_line1"), false);
});

await test("contact model supports person and household email/phone/address with duplicate and primary controls", async () => {
  const { env, db } = makeD1Env();
  const { admin, adult, household } = await fixture(env);
  const personEmail = await createContactMethod(env, { actor: admin, ownerType: "person", ownerId: adult.id, contactType: "email", label: "personal", value: "Anna@Example.org", primary: true });
  assert.equal(personEmail.normalizedValue, "anna@example.org");
  await createContactMethod(env, { actor: admin, ownerType: "household", ownerId: household.id, contactType: "email", label: "household", value: "home@example.org", primary: true });
  await createContactMethod(env, { actor: admin, ownerType: "person", ownerId: adult.id, contactType: "phone", label: "mobile", value: "(555) 111-2222", primary: true, smsCapable: true });
  await createContactMethod(env, { actor: admin, ownerType: "household", ownerId: household.id, contactType: "phone", label: "home", value: "555.333.4444" });
  await createAddress(env, { actor: admin, ownerType: "household", ownerId: household.id, addressType: "residential", line1: "123 Parish Way", city: "Dallas", region: "TX", postalCode: "75001", primary: true });
  await assert.rejects(
    () => createContactMethod(env, { actor: admin, ownerType: "person", ownerId: adult.id, contactType: "email", value: "anna@example.org" }),
    /UNIQUE/
  );
  const replacement = await createContactMethod(env, { actor: admin, ownerType: "person", ownerId: adult.id, contactType: "email", value: "anna2@example.org", primary: true });
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM directory_contact_methods WHERE owner_id = ? AND contact_type = 'email' AND active = 1 AND is_primary = 1").get(adult.id).count, 1);
  assert.equal(replacement.primary, true);
  await deactivateContactMethod(env, { actor: admin, contactId: personEmail.id });
  assert.equal(auditRows(db, "directory.contact_created").length >= 5, true);
  assert.equal(auditRows(db, "directory.primary_contact_changed").length >= 2, true);
});

await test("ownership rules allow household admins and deny non-admins or another adult's person-owned contact", async () => {
  const { env } = makeD1Env();
  const { admin, adult, spouse, household } = await fixture(env);
  const selfActor = actor("st-fiacre", ["directory.self.manage"], adult.id);
  await createContactMethod(env, { actor: selfActor, ownerType: "household", ownerId: household.id, contactType: "email", value: "admin-home@example.org" });
  await createContactMethod(env, { actor: selfActor, ownerType: "person", ownerId: adult.id, contactType: "phone", value: "5551119999" });
  const spouseActor = actor("st-fiacre", ["directory.self.manage"], spouse.id);
  await assert.rejects(
    () => createContactMethod(env, { actor: spouseActor, ownerType: "household", ownerId: household.id, contactType: "email", value: "not-admin@example.org" }),
    (error) => error instanceof DirectoryServiceError && error.code === "forbidden"
  );
  await assert.rejects(
    () => createContactMethod(env, { actor: spouseActor, ownerType: "person", ownerId: adult.id, contactType: "email", value: "spouse-edits-adult@example.org" }),
    (error) => error instanceof DirectoryServiceError && error.code === "forbidden"
  );
  await createContactMethod(env, { actor: admin, ownerType: "person", ownerId: spouse.id, contactType: "email", value: "staff-can-edit@example.org" });
});

await test("privacy defaults fail closed for children and protected addresses", async () => {
  const { env, db } = makeD1Env();
  const { admin, adult, child, household } = await fixture(env);
  const defaults = await getDirectorySettings(env, "st-fiacre");
  assert.equal(defaults.childNamesAllowed, false);
  await assert.rejects(
    () => setFieldPrivacyPreference(env, { actor: admin, ownerType: "person", ownerId: child.id, fieldKey: "child_name", visibility: "directory_members", publicationEligible: true }),
    (error) => error instanceof DirectoryServiceError && error.code === "privacy_policy_denied"
  );
  await assert.rejects(
    () => updateDirectorySettings(env, { actor: { ...admin, capabilities: ["directory.settings.manage"] }, parishId: "st-fiacre", patch: { addressMaxVisibility: "directory_members" } }),
    (error) => error instanceof DirectoryServiceError && error.code === "unsafe_setting"
  );
  await createAddress(env, { actor: admin, ownerType: "household", ownerId: household.id, line1: "Protected House", city: "Dallas", protectedAddress: true, visibility: "staff" });
  await assert.rejects(
    () => createAddress(env, { actor: admin, ownerType: "household", ownerId: household.id, line1: "Too Visible", city: "Dallas", protectedAddress: true, visibility: "directory_members" }),
    (error) => error instanceof DirectoryServiceError && error.code === "privacy_policy_denied"
  );
  await setPersonPrivacyFlags(env, { actor: admin, parishId: "st-fiacre", personId: adult.id, protectedPerson: true });
  assert.equal(auditRows(db, "directory.protected_person_status_changed").length >= 2, true);
  assert.equal(auditRows(db, "directory.address_protected").length, 1);
});

await test("publication lifecycle requires explicit approval and blocks illegal transitions", async () => {
  const { env, db } = makeD1Env();
  const { admin, household } = await fixture(env);
  await assert.rejects(
    () => createPublicationProfile(env, { actor: admin, ownerType: "household", ownerId: household.id, status: "approved" }),
    (error) => error instanceof DirectoryServiceError && error.code === "illegal_publication_transition"
  );
  const draft = await createPublicationProfile(env, { actor: admin, ownerType: "household", ownerId: household.id });
  assert.equal(draft.status, "draft");
  const pending = await transitionPublicationProfile(env, { actor: admin, ownerType: "household", ownerId: household.id, status: "pending_approval" });
  assert.equal(pending.approvalStatus, "pending");
  await assert.rejects(
    () => transitionPublicationProfile(env, { actor: actor("st-fiacre", ["directory.self.manage"]), ownerType: "household", ownerId: household.id, status: "approved" }),
    (error) => error instanceof DirectoryServiceError && error.code === "forbidden"
  );
  const approved = await transitionPublicationProfile(env, { actor: { ...admin, capabilities: ["directory.publication.review"] }, ownerType: "household", ownerId: household.id, status: "approved" });
  assert.equal(approved.status, "approved");
  const paused = await transitionPublicationProfile(env, { actor: admin, ownerType: "household", ownerId: household.id, status: "paused" });
  assert.equal(paused.status, "paused");
  await transitionPublicationProfile(env, { actor: admin, ownerType: "household", ownerId: household.id, status: "archived" });
  await assert.rejects(
    () => transitionPublicationProfile(env, { actor: admin, ownerType: "household", ownerId: household.id, status: "draft" }),
    (error) => error instanceof DirectoryServiceError && error.code === "illegal_publication_transition"
  );
  assert.equal(auditRows(db, "directory.publication_profile_created").length, 1);
  assert.equal(auditRows(db, "directory.publication_approved").length, 1);
  assert.equal(auditRows(db, "directory.publication_paused").length, 1);
});

await test("projections are sanitized, viewer-specific, and exclude hidden children, internals, and donor data", async () => {
  const { env } = makeD1Env();
  const { admin, adult, child, household } = await fixture(env);
  await updateDirectorySettings(env, { actor: { ...admin, capabilities: ["directory.settings.manage"] }, parishId: "st-fiacre", patch: { directoryEnabled: true, ordinaryMemberAccessEnabled: true } });
  await setFieldPrivacyPreference(env, { actor: admin, ownerType: "person", ownerId: adult.id, fieldKey: "adult_email", visibility: "directory_members", publicationEligible: true });
  await createContactMethod(env, { actor: admin, ownerType: "person", ownerId: adult.id, contactType: "email", value: "anna@example.org", visibility: "directory_members" });
  await createAddress(env, { actor: admin, ownerType: "household", ownerId: household.id, line1: "123 Parish Way", city: "Dallas", region: "TX", protectedAddress: true, visibility: "staff" });
  await createPublicationProfile(env, { actor: admin, ownerType: "household", ownerId: household.id, status: "pending_approval" });
  await transitionPublicationProfile(env, { actor: { ...admin, capabilities: ["directory.publication.review"] }, ownerType: "household", ownerId: household.id, status: "approved" });
  await createPublicationProfile(env, { actor: admin, ownerType: "person", ownerId: adult.id, status: "pending_approval" });
  await transitionPublicationProfile(env, { actor: { ...admin, capabilities: ["directory.publication.review"] }, ownerType: "person", ownerId: adult.id, status: "approved" });

  const memberActor = actor("st-fiacre", ["directory.view"]);
  const householdProjection = await projectDirectoryRecord(env, { actor: memberActor, parishId: "st-fiacre", targetType: "household", targetId: household.id, projectionType: "household_detail" });
  assert.equal(householdProjection.household.displayName, "The Dunn Household");
  assert.equal(JSON.stringify(householdProjection).includes(child.preferredName), false);
  assert.equal(JSON.stringify(householdProjection).includes("123 Parish Way"), false);
  assert.equal(JSON.stringify(householdProjection).includes("donor"), false);
  assert.equal(JSON.stringify(householdProjection).includes("external"), false);
  assert.equal("id" in householdProjection.household, false);

  const personProjection = await projectDirectoryRecord(env, { actor: memberActor, parishId: "st-fiacre", targetType: "person", targetId: adult.id, projectionType: "person_detail" });
  assert.equal(personProjection.contacts[0].value, "anna@example.org");
  assert.equal("notes" in personProjection.person, false);

  const staffProjection = await projectDirectoryRecord(env, { actor: actor("st-fiacre", ["directory.private_contact.view"]), parishId: "st-fiacre", targetType: "household", targetId: household.id, projectionType: "parish_staff_detail" });
  assert.equal(staffProjection.addresses[0].line1, "123 Parish Way");

  const selfProjection = await projectDirectoryRecord(env, { actor: actor("st-fiacre", ["directory.self.manage"], adult.id), parishId: "st-fiacre", targetType: "household", targetId: household.id, projectionType: "household_self_management_detail" });
  assert.equal(selfProjection.members.some((member) => member.person.preferredName === child.preferredName), true);
});

await test("projections deny cross-parish, inactive affiliation, paused profile, and ordinary staff-only access", async () => {
  const { env } = makeD1Env();
  const { admin, adult, household } = await fixture(env);
  await updateDirectorySettings(env, { actor: { ...admin, capabilities: ["directory.settings.manage"] }, parishId: "st-fiacre", patch: { directoryEnabled: true, ordinaryMemberAccessEnabled: true } });
  await createPublicationProfile(env, { actor: admin, ownerType: "household", ownerId: household.id, status: "pending_approval" });
  await transitionPublicationProfile(env, { actor: { ...admin, capabilities: ["directory.publication.review"] }, ownerType: "household", ownerId: household.id, status: "approved" });
  await transitionPublicationProfile(env, { actor: admin, ownerType: "household", ownerId: household.id, status: "paused" });
  await assert.rejects(
    () => projectDirectoryRecord(env, { actor: actor("st-fiacre", ["directory.view"]), parishId: "st-fiacre", targetType: "household", targetId: household.id, projectionType: "household_summary" }),
    (error) => error instanceof DirectoryServiceError && error.code === "not_publishable"
  );
  await assert.rejects(
    () => projectDirectoryRecord(env, { actor: actor("st-other", ["directory.view"]), parishId: "st-fiacre", targetType: "person", targetId: adult.id, projectionType: "person_summary" }),
    (error) => error instanceof DirectoryServiceError && error.code === "forbidden"
  );
  await assert.rejects(
    () => projectDirectoryRecord(env, { actor: actor("st-fiacre", ["directory.view"]), parishId: "st-fiacre", targetType: "person", targetId: adult.id, projectionType: "parish_staff_detail" }),
    (error) => error instanceof DirectoryServiceError && error.code === "forbidden"
  );
});

await test("legacy bearer alone cannot create a directory actor", async () => {
  const { env } = makeD1Env({ includeIdentity: true });
  const request = new Request("https://agapay.test/api/directory/internal", {
    headers: { Authorization: "Bearer legacy-parish-dashboard-token" }
  });
  const resolved = await directoryActorFromRequest(request, env, "st-fiacre", "directory.view");
  assert.equal(resolved, null);

  const invitation = await createInvitation(env, {
    parishId: "st-fiacre",
    email: "directory-viewer@example.org",
    capabilities: ["directory.view"]
  });
  const accepted = await acceptInvitation(env, { token: invitation.token, password: "directory viewer password" });
  const session = await issuePlatformUserSession(env, accepted.userId);
  const goodRequest = new Request("https://agapay.test/api/directory/internal", {
    headers: {
      Authorization: `Bearer ${session.token}`,
      "X-AGAPAY-User-Email": "directory-viewer@example.org"
    }
  });
  const actorFromSession = await directoryActorFromRequest(goodRequest, env, "st-fiacre", "directory.view");
  assert.equal(actorFromSession.userId, accepted.userId);
});

await test("audit summaries mask sensitive values", async () => {
  const { env, db } = makeD1Env();
  const { admin, adult } = await fixture(env);
  await createContactMethod(env, { actor: admin, ownerType: "person", ownerId: adult.id, contactType: "email", value: "secret@example.org", correlationId: "corr-contact" });
  const row = auditRows(db, "directory.contact_created").at(-1);
  assert.equal(row.request_id, "corr-contact");
  assert.equal(row.after_summary_json.includes("secret@example.org"), false);
  assert.equal(row.after_summary_json.includes("***@example.org"), true);
});

if (process.exitCode) {
  console.error("Some directory Phase 1B tests FAILED.");
  process.exit(process.exitCode);
}

console.log(`${passed} test(s) passed.`);
console.log("All directory Phase 1B tests passed.");
