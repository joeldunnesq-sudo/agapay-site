import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  addHouseholdAdmin,
  addHouseholdMember,
  addParishAffiliation,
  createHousehold,
  createPerson,
  createDirectoryChangeRequest,
  createHouseholdAdultInvitation,
  createSelfServiceAddress,
  createSelfServiceContact,
  deleteHouseholdMember,
  deleteHouseholdNameday,
  getHouseholdSelfServiceProfile,
  getSelfServiceProfile,
  linkExternalIdentity,
  resolveDirectorySelfServiceContext,
  setPersonPrivacyFlags,
  setSelfServicePrivacyPreference,
  startSelfServiceProfile,
  syncSelfServiceContactsFromDonor,
  listHouseholdNamedays,
  requestHouseholdAdultAdd,
  requestHouseholdChildAdd,
  saveHouseholdNameday,
  transitionSelfServicePublication,
  updateHouseholdMember,
  updateHouseholdSelfServiceProfile,
  updateSelfServiceContact,
  updateSelfServicePersonProfile,
  DirectoryServiceError
} from "../src/directory/index.js";
import { handleDirectorySelfService } from "../src/handlers/directory-self-service.js";
import { ensurePlatformUser, issuePlatformUserSession, PLATFORM_USER_EMAIL_HEADER } from "../src/lib/identity.js";
import { issueDonorSession } from "../src/handlers/donor.js";
import { saveDonor } from "../src/lib/core.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

function migration(name) {
  return readFileSync(path.join(repoRoot, "migrations", name), "utf8");
}

function makeD1Env() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(migration("0014_audit_log.sql"));
  db.exec(migration("0020_platform_identity.sql"));
  db.exec(migration("0022_directory_canonical_foundation.sql"));
  db.exec(migration("0023_directory_contact_privacy_publication.sql"));
  db.exec(migration("0024_directory_invitations_claims.sql"));
  db.exec(migration("0025_directory_self_service_phase2a.sql"));
  db.exec(migration("0033_directory_household_namedays.sql"));
  db.exec(migration("0104_directory_parish_milestones.sql"));
  db.exec(`
    CREATE TABLE donors (
      email TEXT PRIMARY KEY,
      default_parish_id TEXT,
      email_verified_at TEXT,
      created_at TEXT,
      updated_at TEXT NOT NULL,
      data TEXT NOT NULL
    );
  `);

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
  return { userId: `admin_${parishId}`, parishId, capabilities, personId };
}

async function fixture() {
  const { env, db } = makeD1Env();
  const admin = actor();
  const user = await ensurePlatformUser(env, { email: "anna@example.org", displayName: "Anna Dunn" });
  const session = await issuePlatformUserSession(env, user.id);
  const adult = await createPerson(env, { actor: admin, preferredName: "Anna Dunn", legalName: "Anna Catherine Dunn", biologicalSex: "female" });
  const spouse = await createPerson(env, { actor: admin, preferredName: "John Dunn", biologicalSex: "male" });
  const child = await createPerson(env, { actor: admin, preferredName: "Maria Dunn", biologicalSex: "female" });
  const household = await createHousehold(env, { actor: admin, displayName: "The Dunn Household" });
  await addHouseholdMember(env, { actor: admin, householdId: household.id, personId: adult.id, relationship: "head" });
  await addHouseholdMember(env, { actor: admin, householdId: household.id, personId: spouse.id, relationship: "spouse" });
  await addHouseholdMember(env, { actor: admin, householdId: household.id, personId: child.id, relationship: "child" });
  await addHouseholdAdmin(env, { actor: admin, householdId: household.id, personId: adult.id });
  await addParishAffiliation(env, { actor: admin, personId: adult.id, status: "member" });
  await addParishAffiliation(env, { actor: admin, personId: spouse.id, status: "member" });
  await linkExternalIdentity(env, { actor: admin, personId: adult.id, linkType: "platform_user", externalId: user.id });
  await setPersonPrivacyFlags(env, { actor: admin, personId: child.id, isChild: true });
  const context = await resolveDirectorySelfServiceContext(env, { user });
  return { env, db, admin, user, session, adult, spouse, child, household, context };
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

function auditCount(db, action) {
  return db.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE action = ?").get(action).count;
}

await test("migration creates Phase 2A change-request and notification tables", async () => {
  const { db } = makeD1Env();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
  assert.ok(tables.includes("directory_change_requests"));
  assert.ok(tables.includes("directory_notification_events"));
});

await test("linked adult receives safe self-service context; unlinked user receives claimed=false", async () => {
  const { env, context, user, household } = await fixture();
  assert.equal(context.claimed, true);
  assert.equal(context.user.email, "anna@example.org");
  assert.equal(context.currentPerson.legalName, "Anna Catherine Dunn");
  assert.equal(context.manageableHouseholds[0].id, household.id);
  assert.equal("donorId" in context.currentPerson, false);
  const unlinked = await ensurePlatformUser(env, { email: "unlinked@example.org" });
  const unlinkedContext = await resolveDirectorySelfServiceContext(env, { user: unlinked });
  assert.equal(unlinkedContext.claimed, false);
  assert.equal(unlinkedContext.permissions.canSelfManage, false);
  assert.equal(user.email, "anna@example.org");
});

await test("account settings auto-populate private directory contacts and preserve explicit sharing", async () => {
  const { env, context, adult, household } = await fixture();
  await syncSelfServiceContactsFromDonor(env, {
    context,
    donor: {
      email: "anna@example.org",
      emailVerifiedAt: "2026-07-28T00:00:00.000Z",
      contactPhone: "(555) 111-2233",
      addressLine1: "42 Settings Way",
      addressLine2: "Apt 7",
      city: "Amarillo",
      state: "TX",
      postalCode: "79101",
      country: "US"
    }
  });
  let contacts = await env.AGAPAY_DB.prepare("SELECT * FROM directory_contact_methods WHERE owner_id = ?1 ORDER BY contact_type").bind(adult.id).all();
  assert.deepEqual(contacts.results.map((row) => [row.contact_type, row.value, row.visibility]), [
    ["email", "anna@example.org", "private"],
    ["phone", "(555) 111-2233", "private"]
  ]);
  let address = await env.AGAPAY_DB.prepare("SELECT * FROM directory_addresses WHERE owner_id = ?1 AND is_primary = 1").bind(household.id).first();
  assert.equal(address.line1, "42 Settings Way");
  assert.equal(address.line2, "Apt 7");
  assert.equal(address.visibility, "private");

  const email = contacts.results.find((row) => row.contact_type === "email");
  await updateSelfServiceContact(env, {
    context,
    contactId: email.id,
    patch: { visibility: "directory_members", expectedVersion: email.updated_at }
  });
  await syncSelfServiceContactsFromDonor(env, {
    context,
    donor: {
      email: "anna.updated@example.org",
      contactPhone: "(555) 111-2233",
      addressLine1: "84 Updated Way",
      city: "Amarillo",
      state: "TX",
      postalCode: "79102",
      country: "US"
    }
  });
  contacts = await env.AGAPAY_DB.prepare("SELECT * FROM directory_contact_methods WHERE owner_id = ?1 AND contact_type = 'email' AND active = 1").bind(adult.id).all();
  assert.equal(contacts.results.length, 1);
  assert.equal(contacts.results[0].value, "anna.updated@example.org");
  assert.equal(contacts.results[0].visibility, "directory_members", "settings sync does not reset a donor's explicit opt-in");
  address = await env.AGAPAY_DB.prepare("SELECT * FROM directory_addresses WHERE owner_id = ?1 AND is_primary = 1").bind(household.id).first();
  assert.equal(address.line1, "84 Updated Way");
  assert.equal(address.visibility, "private");
});

await test("unlinked My AGAPAY user can start a private draft directory profile", async () => {
  const { env, db } = await fixture();
  const user = await ensurePlatformUser(env, { email: "newmember@example.org", displayName: "New Member" });
  const context = await resolveDirectorySelfServiceContext(env, { user });
  assert.equal(context.claimed, false);
  const profile = await startSelfServiceProfile(env, {
    context,
    data: {
      parishId: "st-fiacre",
      preferredName: "New Member",
      legalName: "New Parish Member",
      email: "newmember@example.org",
      phone: "555-101-2020",
      profileVisibility: "directory_members",
      emailVisibility: "directory_members",
      phoneVisibility: "staff"
    }
  });
  assert.equal(profile.claimed, true);
  assert.equal(profile.currentPerson.preferredName, "New Member");
  assert.equal(profile.manageableHouseholds.length, 1);
  assert.equal(profile.manageableHouseholds[0].displayName, "New Member Household");
  const link = await env.AGAPAY_DB.prepare("SELECT * FROM directory_person_links WHERE external_id = ?1 AND link_type = 'platform_user'").bind(user.id).first();
  assert.equal(link.person_id, profile.currentPerson.id);
  const householdMember = await env.AGAPAY_DB.prepare("SELECT hm.relationship FROM directory_household_members hm JOIN directory_household_admins ha ON ha.household_id = hm.household_id WHERE hm.person_id = ?1 AND ha.person_id = ?1").bind(profile.currentPerson.id).first();
  assert.equal(householdMember.relationship, "head");
  const publication = await env.AGAPAY_DB.prepare("SELECT status, approval_status FROM directory_publication_profiles WHERE owner_id = ?1").bind(profile.currentPerson.id).first();
  assert.equal(publication.status, "draft");
  assert.equal(publication.approval_status, "not_submitted");
  const request = await env.AGAPAY_DB.prepare("SELECT request_type, status, requested_payload_json FROM directory_change_requests WHERE requester_person_id = ?1").bind(profile.currentPerson.id).first();
  assert.equal(request.request_type, "person_profile_review");
  assert.equal(request.status, "pending");
  const requested = JSON.parse(request.requested_payload_json);
  assert.equal(requested.publicationPreferences.adultPreferredName.visibility, "directory_members");
  assert.equal(requested.publicationPreferences.adultEmail.visibility, "directory_members");
  assert.equal(requested.publicationPreferences.adultPhone.visibility, "staff");
  const contacts = await env.AGAPAY_DB.prepare("SELECT contact_type, visibility FROM directory_contact_methods WHERE owner_id = ?1 ORDER BY contact_type").bind(profile.currentPerson.id).all();
  assert.deepEqual(contacts.results.map((row) => ({ contact_type: row.contact_type, visibility: row.visibility })), [
    { contact_type: "email", visibility: "directory_members" },
    { contact_type: "phone", visibility: "staff" }
  ]);
  const privacy = await env.AGAPAY_DB.prepare("SELECT field_key, visibility, publication_eligible FROM directory_field_privacy_preferences WHERE owner_id = ?1 AND field_key = 'adult_preferred_name'").bind(profile.currentPerson.id).first();
  assert.equal(privacy.visibility, "directory_members");
  assert.equal(privacy.publication_eligible, 1);
  assert.equal(auditCount(db, "directory.self_service.profile_started"), 1);
});

await test("new My AGAPAY parish signup can open directory onboarding and submit its profile for review", async () => {
  const { env, db } = makeD1Env();
  const donor = {
    email: "first-visit@example.org",
    donorName: "First Visit",
    householdName: "First Visit Household",
    defaultParishId: "st-fiacre",
    emailVerifiedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await saveDonor(env, donor);
  const session = await issueDonorSession(env, donor);
  const authHeaders = {
    Authorization: `Bearer ${session.token}`,
    "X-AGAPAY-User-Email": donor.email,
    "X-AGAPAY-Donor-Email": donor.email
  };

  const firstVisit = await handleDirectorySelfService(new Request("https://agapay.test/api/directory/self/profile", {
    headers: authHeaders
  }), env);
  assert.equal(firstVisit.status, 200, "first directory visit should load onboarding instead of Unauthorized");
  const firstPayload = await firstVisit.json();
  assert.equal(firstPayload.profile.claimed, false);

  const submitted = await handleDirectorySelfService(new Request("https://agapay.test/api/directory/self/start-profile", {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      parishId: donor.defaultParishId,
      preferredName: donor.donorName,
      householdName: donor.householdName,
      email: donor.email,
      profileVisibility: "directory_members",
      emailVisibility: "staff"
    })
  }), env);
  assert.equal(submitted.status, 201);
  const submittedPayload = await submitted.json();
  assert.equal(submittedPayload.profile.claimed, true);
  assert.equal(submittedPayload.profile.activeParishContexts[0].parishId, "st-fiacre");
  const review = db.prepare("SELECT request_type, status FROM directory_change_requests WHERE requester_user_id = ?").get(submittedPayload.profile.user.id);
  assert.equal(review.request_type, "person_profile_review");
  assert.equal(review.status, "pending");
});

await test("household admin can save household name days with privacy", async () => {
  const { env, context, household, adult } = await fixture();
  const nameday = await saveHouseholdNameday(env, {
    context,
    householdId: household.id,
    data: {
      personId: adult.id,
      displayName: "Anna Dunn",
      saintName: "St. Anna",
      feastMonthDay: "07-25",
      visibility: "directory_members"
    }
  });
  assert.equal(nameday.displayName, "Anna Dunn");
  assert.equal(nameday.personId, adult.id);
  assert.equal(nameday.visibility, "directory_members");
  const list = await listHouseholdNamedays(env, { context, householdId: household.id });
  assert.equal(list.length, 1);
  assert.equal(list[0].saintName, "St. Anna");
  assert.equal(list[0].personId, adult.id);
});

await test("self-service profile without a household receives an editable household on next load", async () => {
  const { env, db } = await fixture();
  const user = await ensurePlatformUser(env, { email: "oldprofile@example.org", displayName: "Old Profile" });
  const context = await resolveDirectorySelfServiceContext(env, { user });
  const profile = await startSelfServiceProfile(env, {
    context,
    data: { parishId: "st-fiacre", preferredName: "Old Profile", legalName: "Older Self Service" }
  });
  const householdId = profile.manageableHouseholds[0].id;
  db.prepare("DELETE FROM directory_household_admins WHERE household_id = ?").run(householdId);
  db.prepare("DELETE FROM directory_household_members WHERE household_id = ?").run(householdId);
  db.prepare("DELETE FROM directory_households WHERE id = ?").run(householdId);
  const recovered = await resolveDirectorySelfServiceContext(env, { user });
  assert.equal(recovered.manageableHouseholds.length, 1);
  assert.match(recovered.manageableHouseholds[0].displayName, /Old Profile Household/);
  assert.equal(auditCount(db, "directory.self_service.household_recovered"), 1);
});

await test("self-service context recovers a missing profile link from the user's own setup request", async () => {
  const { env, db } = await fixture();
  const user = await ensurePlatformUser(env, { email: "recoverme@example.org", displayName: "Recover Me" });
  const context = await resolveDirectorySelfServiceContext(env, { user });
  const profile = await startSelfServiceProfile(env, {
    context,
    data: {
      parishId: "st-fiacre",
      preferredName: "Recover Me",
      legalName: "Recoverable Member",
      email: "recoverme@example.org"
    }
  });
  db.prepare("DELETE FROM directory_person_links WHERE person_id = ?").run(profile.currentPerson.id);
  const recovered = await resolveDirectorySelfServiceContext(env, { user });
  assert.equal(recovered.claimed, true);
  assert.equal(recovered.currentPerson.id, profile.currentPerson.id);
  const link = db.prepare("SELECT source FROM directory_person_links WHERE person_id = ? AND external_id = ?").get(profile.currentPerson.id, user.id);
  assert.equal(link.source, "self_service_recovered");
  assert.equal(auditCount(db, "directory.self_service.profile_link_recovered"), 1);
});

await test("person profile update allows permitted fields, requires version, and routes protected fields to review", async () => {
  const { env, db, context } = await fixture();
  await assert.rejects(
    () => updateSelfServicePersonProfile(env, { context, patch: { preferredName: "Anna D." } }),
    (error) => error instanceof DirectoryServiceError && error.code === "stale_update_required"
  );
  const updated = await updateSelfServicePersonProfile(env, {
    context,
    patch: { expectedVersion: context.currentPerson.version, preferredName: "Anna D.", suffix: "III" }
  });
  assert.equal(updated.preferredName, "Anna D.");
  assert.equal(auditCount(db, "directory.self_service.person_profile_updated"), 1);
  await assert.rejects(
    () => updateSelfServicePersonProfile(env, { context, patch: { expectedVersion: updated.version, parishId: "st-fiacre" } }),
    (error) => error instanceof DirectoryServiceError && error.code === "protected_field_denied"
  );
  const request = await updateSelfServicePersonProfile(env, {
    context,
    patch: { expectedVersion: updated.version, legalName: "Anna Dunn Revised" }
  });
  assert.equal(request.requestType, "person_profile_review");
});

await test("person and household contacts are distinct; platform login email is not changed or auto-verified", async () => {
  const { env, context, user, household } = await fixture();
  const personContact = await createSelfServiceContact(env, {
    context,
    ownerType: "person",
    ownerId: context.currentPerson.id,
    data: { contactType: "email", value: "directory@example.org", primary: true, visibility: "private", verified: true }
  });
  assert.equal(personContact.verified, false);
  const storedUser = await env.AGAPAY_DB.prepare("SELECT email FROM platform_users WHERE id = ?1").bind(user.id).first();
  assert.equal(storedUser.email, "anna@example.org");
  const householdContact = await createSelfServiceContact(env, {
    context,
    ownerType: "household",
    ownerId: household.id,
    data: { contactType: "phone", value: "555-222-3333", label: "home", visibility: "household" }
  });
  assert.equal(householdContact.contactType, "phone");
  await assert.rejects(
    () => updateSelfServiceContact(env, { context, contactId: personContact.id, patch: { expectedVersion: personContact.version, verified: true } }),
    (error) => error instanceof DirectoryServiceError && error.code === "protected_field_denied"
  );
});

await test("household admin can retrieve and edit household-owned profile but not canonical structure", async () => {
  const { env, db, context, household } = await fixture();
  const profile = await getHouseholdSelfServiceProfile(env, { context, householdId: household.id });
  assert.equal(profile.household.displayName, "The Dunn Household");
  assert.equal(profile.members.some((member) => member.child), true);
  assert.equal("notes" in profile.household, false);
  const updated = await updateHouseholdSelfServiceProfile(env, {
    context,
    householdId: household.id,
    patch: { expectedVersion: profile.household.version, displayName: "Dunn Household" }
  });
  assert.equal(updated.household.displayName, "Dunn Household");
  assert.equal(auditCount(db, "directory.self_service.household_profile_updated"), 1);
  await assert.rejects(
    () => updateHouseholdSelfServiceProfile(env, { context, householdId: household.id, patch: { expectedVersion: updated.household.version, active: false } }),
    (error) => error instanceof DirectoryServiceError && error.code === "protected_field_denied"
  );
});

await test("household address and privacy controls reuse Phase 1B policy and fail closed", async () => {
  const { env, context, household } = await fixture();
  const address = await createSelfServiceAddress(env, {
    context,
    householdId: household.id,
    data: { line1: "123 Parish Way", city: "Dallas", region: "TX", postalCode: "75001", protectedAddress: true, visibility: "staff" }
  });
  assert.equal(address.protectedAddress, true);
  assert.equal(address.line1, "");
  await assert.rejects(
    () => createSelfServiceAddress(env, {
      context,
      householdId: household.id,
      data: { line1: "456 Visible Way", city: "Dallas", protectedAddress: true, visibility: "directory_members" }
    }),
    (error) => error instanceof DirectoryServiceError && error.code === "privacy_policy_denied"
  );
  await setSelfServicePrivacyPreference(env, {
    context,
    ownerType: "household",
    ownerId: household.id,
    fieldKey: "city_state",
    visibility: "directory_members",
    publicationEligible: true
  });
  const staffOnlyLocation = await setSelfServicePrivacyPreference(env, {
    context,
    ownerType: "household",
    ownerId: household.id,
    fieldKey: "city_state",
    visibility: "staff",
    publicationEligible: false
  });
  assert.equal(staffOnlyLocation.visibility, "staff", "an existing directory-member preference must remain editable to staff only");
  await setSelfServicePrivacyPreference(env, {
    context,
    ownerType: "household",
    ownerId: household.id,
    fieldKey: "city_state",
    visibility: "directory_members",
    publicationEligible: true
  });
  const sharedLocation = await createSelfServiceAddress(env, {
    context,
    householdId: household.id,
    data: {
      line1: "Dallas, TX",
      city: "Dallas",
      region: "TX",
      protectedAddress: false,
      visibility: "directory_members",
      primary: true
    }
  });
  assert.equal(sharedLocation.visibility, "directory_members");
  assert.equal(sharedLocation.city, "Dallas");
  await assert.rejects(
    () => setSelfServicePrivacyPreference(env, {
      context,
      ownerType: "person",
      ownerId: context.currentPerson.id,
      fieldKey: "adult_legal_name",
      visibility: "directory_members",
      publicationEligible: true
    }),
    (error) => error instanceof DirectoryServiceError && error.code === "privacy_policy_denied"
  );
});

await test("publication self-service allows submit and pause but denies self-approval", async () => {
  const { env, context, household } = await fixture();
  const pending = await transitionSelfServicePublication(env, { context, ownerType: "household", ownerId: household.id, status: "pending_approval" });
  assert.equal(pending.status, "pending_approval");
  await assert.rejects(
    () => transitionSelfServicePublication(env, { context, ownerType: "household", ownerId: household.id, status: "approved" }),
    (error) => error instanceof DirectoryServiceError && error.code === "self_approval_denied"
  );
  const paused = await transitionSelfServicePublication(env, { context, ownerType: "household", ownerId: household.id, status: "paused" });
  assert.equal(paused.status, "paused");
});

await test("membership and relationship changes use controlled requests with duplicate protection and cancellation", async () => {
  const { env, db, context, household } = await fixture();
  const request = await createDirectoryChangeRequest(env, {
    context,
    parishId: "st-fiacre",
    targetType: "household",
    targetId: household.id,
    householdId: household.id,
    requestType: "household_relationship_change",
    summary: "Correct relationship for household member",
    payload: { personId: context.currentPerson.id, relationship: "head" }
  });
  assert.equal(request.status, "pending");
  assert.equal(auditCount(db, "directory.change_request.created"), 1);
  await assert.rejects(
    () => createDirectoryChangeRequest(env, {
      context,
      parishId: "st-fiacre",
      targetType: "household",
      targetId: household.id,
      householdId: household.id,
      requestType: "household_relationship_change",
      summary: "Correct relationship for household member",
      payload: {}
    }),
    /UNIQUE/
  );
});

await test("household admin can add a child directly without parish approval", async () => {
  const { env, db, context, household } = await fixture();
  const child = await requestHouseholdChildAdd(env, {
    context,
    householdId: household.id,
    data: { preferredName: "Lucy Dunn", relationship: "daughter", dateOfBirth: "2020-05-12" }
  });
  assert.equal(child.direct, true);
  assert.equal(child.householdId, household.id);
  assert.equal(child.relationship, "daughter");
  const flags = db.prepare("SELECT is_child, protected_person FROM directory_person_privacy_flags WHERE person_id = ?").get(child.personId);
  assert.equal(flags.is_child, 1);
  assert.equal(flags.protected_person, 0);
  const linked = db.prepare("SELECT COUNT(*) AS count FROM directory_household_members WHERE household_id = ? AND person_id = ?").get(household.id, child.personId);
  assert.equal(linked.count, 1, "child should be linked immediately");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM directory_change_requests WHERE household_id = ?").get(household.id).count, 0);
  await assert.rejects(
    () => requestHouseholdChildAdd(env, { context, householdId: household.id, data: { preferredName: "Lucy Dunn" } }),
    (error) => error instanceof DirectoryServiceError && error.code === "duplicate_member"
  );
});

await test("household admin can edit and remove members and delete duplicate namedays", async () => {
  const { env, db, context, household } = await fixture();
  const child = await requestHouseholdChildAdd(env, {
    context,
    householdId: household.id,
    data: { preferredName: "Lucy Old", relationship: "child" }
  });
  const nameday = await saveHouseholdNameday(env, {
    context,
    householdId: household.id,
    data: { displayName: "Lucy Old", saintName: "St. Lucy", feastMonthDay: "12-13", visibility: "private" }
  });
  const updated = await updateHouseholdMember(env, {
    context,
    householdId: household.id,
    personId: child.personId,
    data: { preferredName: "Lucy Dunn", relationship: "child" }
  });
  assert.equal(updated.preferredName, "Lucy Dunn");
  assert.equal(db.prepare("SELECT preferred_name FROM directory_people WHERE id = ?").get(child.personId).preferred_name, "Lucy Dunn");
  assert.equal(db.prepare("SELECT display_name FROM directory_household_namedays WHERE id = ?").get(nameday.id).display_name, "Lucy Dunn");

  await deleteHouseholdNameday(env, { context, householdId: household.id, namedayId: nameday.id });
  assert.equal(db.prepare("SELECT active FROM directory_household_namedays WHERE id = ?").get(nameday.id).active, 0);

  await deleteHouseholdMember(env, { context, householdId: household.id, personId: child.personId });
  assert.equal(db.prepare("SELECT active FROM directory_household_members WHERE household_id = ? AND person_id = ?").get(household.id, child.personId).active, 0);
  await assert.rejects(
    () => deleteHouseholdMember(env, { context, householdId: household.id, personId: context.currentPerson.id }),
    (error) => error instanceof DirectoryServiceError && error.code === "cannot_remove_self"
  );
});

await test("household admin can enter a spouse for parish confirmation", async () => {
  const { env, db, context, household } = await fixture();
  const request = await requestHouseholdAdultAdd(env, {
    context,
    householdId: household.id,
    data: { preferredName: "Alex Dunn", relationship: "spouse", dateOfBirth: "1988-08-14", email: "alex@example.org" }
  });
  const payload = JSON.parse(db.prepare("SELECT requested_payload_json FROM directory_change_requests WHERE id = ?").get(request.id).requested_payload_json);
  assert.equal(request.requestType, "household_membership_add");
  assert.equal(payload.relationship, "spouse");
  assert.equal(payload.adultAdd.preferredName, "Alex Dunn");
  const contact = db.prepare("SELECT value, visibility FROM directory_contact_methods WHERE owner_type = 'person' AND owner_id = ?").get(payload.personId);
  assert.equal(contact.value, "alex@example.org");
  assert.equal(contact.visibility, "private");
  const flags = db.prepare("SELECT is_child FROM directory_person_privacy_flags WHERE person_id = ?").get(payload.personId);
  assert.equal(flags?.is_child || 0, 0);
  const linked = db.prepare("SELECT COUNT(*) AS count FROM directory_household_members WHERE household_id = ? AND person_id = ?").get(household.id, payload.personId);
  assert.equal(linked.count, 0, "spouse should not be linked until parish review approves the request");
});

await test("verified household admin adds children and adults directly without repeat parish approval", async () => {
  const { env, db, context, household, adult: householdAdmin } = await fixture();
  db.prepare(`INSERT INTO directory_publication_profiles
    (id, parish_id, owner_type, owner_id, status, approval_status, approved_by_user_id, approved_at, active, created_at, updated_at)
    VALUES ('pub_verified_household', ?, 'household', ?, 'approved', 'approved', 'parish-admin', 1, 1, 1, 1)`)
    .run(household.parishId, household.id);

  const selfPublication = await transitionSelfServicePublication(env, {
    context,
    ownerType: "person",
    ownerId: householdAdmin.id,
    status: "pending_approval"
  });
  assert.equal(selfPublication.status, "approved");
  assert.equal(selfPublication.approvalStatus, "approved");

  const child = await requestHouseholdChildAdd(env, {
    context,
    householdId: household.id,
    data: { preferredName: "Lucy Direct", relationship: "daughter", dateOfBirth: "2020-05-12" }
  });
  assert.equal(child.direct, true);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM directory_household_members WHERE household_id = ? AND person_id = ? AND active = 1").get(household.id, child.personId).count, 1);
  assert.equal(db.prepare("SELECT is_child FROM directory_person_privacy_flags WHERE person_id = ?").get(child.personId).is_child, 1);

  const adult = await requestHouseholdAdultAdd(env, {
    context,
    householdId: household.id,
    data: { preferredName: "Alex Direct", relationship: "spouse", email: "alex-direct@example.org" }
  });
  assert.equal(adult.direct, true);
  assert.equal(adult.accountManaged, true);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM directory_household_members WHERE household_id = ? AND person_id = ? AND active = 1").get(household.id, adult.personId).count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM directory_invitations WHERE intended_person_id = ?").get(adult.personId).count, 0, "adding a spouse must not create a second family account invitation");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM directory_change_requests WHERE household_id = ? AND status = 'pending'").get(household.id).count, 0);
});

await test("adult household invitation reuses Phase 1C and denies child invitations", async () => {
  const { env, context, spouse, child, household } = await fixture();
  const invitation = await createHouseholdAdultInvitation(env, {
    context,
    householdId: household.id,
    personId: spouse.id,
    email: "john@example.org"
  });
  assert.equal(invitation.invitationType, "additional_household_admin");
  assert.equal(typeof invitation.token, "string");
  const stored = await env.AGAPAY_DB.prepare("SELECT token_hash FROM directory_invitations WHERE id = ?1").bind(invitation.id).first();
  assert.notEqual(stored.token_hash, invitation.token);
  await assert.rejects(
    () => createHouseholdAdultInvitation(env, { context, householdId: household.id, personId: child.id, email: "child@example.org" }),
    (error) => error instanceof DirectoryServiceError && error.code === "child_invitation_denied"
  );
});

await test("API route requires platform session and denies legacy bearer-only requests", async () => {
  const { env, session, user } = await fixture();
  const legacyRequest = new Request("https://agapay.app/api/directory/self/context", {
    headers: { Authorization: "Bearer legacy-parish-token" }
  });
  const denied = await handleDirectorySelfService(legacyRequest, env);
  assert.equal(denied.status, 401);
  const request = new Request("https://agapay.app/api/directory/self/context", {
    headers: {
      Authorization: `Bearer ${session.token}`,
      [PLATFORM_USER_EMAIL_HEADER]: user.email
    }
  });
  const response = await handleDirectorySelfService(request, env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.context.claimed, true);
});

if (process.exitCode) {
  console.error(`\n${passed} Phase 2A assertion group(s) passed before failure.`);
  process.exit(process.exitCode);
}

console.log(`\n${passed} assertion group(s) passed. directory-phase2a-tests.mjs OK.`);
