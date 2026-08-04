import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  addHouseholdMember,
  addParishAffiliation,
  createContactMethod,
  createHousehold,
  createPerson,
  DirectoryServiceError,
  linkExternalIdentity,
  resolveMemberDirectoryContext,
  getMemberDirectoryHome,
  getMemberDirectoryHousehold,
  getMemberDirectoryPerson,
  listMemberDirectoryHouseholds,
  listMemberDirectoryPeople,
  searchMemberDirectory,
  setPersonPrivacyFlags,
  streamMemberDirectoryMediaVariant
} from "../src/directory/index.js";
import { handleDirectoryMember } from "../src/handlers/directory-member.js";
import { ensurePlatformUser, issuePlatformUserSession, PLATFORM_USER_EMAIL_HEADER } from "../src/lib/identity.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
let passed = 0;

function migration(name) {
  return readFileSync(path.join(repoRoot, "migrations", name), "utf8");
}

function makeD1Env() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE registrations (
      reference TEXT PRIMARY KEY,
      parish_id TEXT,
      parish_name TEXT,
      updated_at TEXT,
      data TEXT
    );
    INSERT INTO registrations (reference, parish_id, parish_name, updated_at, data)
    VALUES (
      'reg_st_fiacre',
      'st-fiacre',
      'St. Fiacre Orthodox Church',
      '2026-07-28T00:00:00.000Z',
      '{"parishName":"St. Fiacre Orthodox Church","city":"Dallas","state":"TX"}'
    );
  `);
  for (const name of [
    "0014_audit_log.sql",
    "0020_platform_identity.sql",
    "0022_directory_canonical_foundation.sql",
    "0023_directory_contact_privacy_publication.sql",
    "0024_directory_invitations_claims.sql",
    "0025_directory_self_service_phase2a.sql",
    "0026_directory_media_phase2b.sql",
    "0027_directory_admin_phase3a.sql",
    "0028_directory_media_secure_transformation.sql",
    "0029_directory_duplicates_phase3b.sql",
    "0030_directory_child_publication_phase4b.sql",
    "0031_directory_ministries_phase5a.sql",
    "0032_directory_phase5b_skills_completion.sql",
    "0033_directory_household_namedays.sql"
  ]) db.exec(migration(name));

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

  return {
    env: {
      AGAPAY_DB: {
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
      },
      AGAPAY_ENVIRONMENT: "test"
    },
    db
  };
}

function grant(db, { userId, parishId = "st-fiacre", status = "active", capabilities = [] }) {
  const membershipId = `m_${userId}_${parishId}`.replace(/[^a-zA-Z0-9_]/g, "_");
  db.prepare(`INSERT INTO parish_memberships
    (id, user_id, parish_id, role_template, status, invited_by_user_id, accepted_at, created_at, updated_at)
    VALUES (?, ?, ?, 'volunteer', ?, 'test', datetime('now'), datetime('now'), datetime('now'))`)
    .run(membershipId, userId, parishId, status);
  for (const capability of capabilities) {
    db.prepare("INSERT INTO membership_capabilities (id, membership_id, capability, granted_by_user_id, granted_at) VALUES (?, ?, ?, 'test', datetime('now'))")
      .run(`${membershipId}_${capability}`.replace(/[^a-zA-Z0-9_]/g, "_"), membershipId, capability);
  }
}

function seedActor() {
  return { userId: "seed-admin", parishId: "st-fiacre", capabilities: ["directory.manage", "directory.households.manage"] };
}

function enableDirectory(db, parishId = "st-fiacre") {
  db.prepare(`INSERT INTO directory_parish_settings
    (parish_id, directory_enabled, publication_approval_required, child_names_allowed, child_photos_allowed,
     address_max_visibility, contact_max_visibility, ordinary_member_access_enabled, clergy_staff_access_policy,
     reconfirmation_interval_days, default_household_publication_status, created_at, updated_at)
    VALUES (?, 1, 1, 0, 0, 'staff', 'directory_members', 1, 'capability_required', 365, 'draft', 1, 1)`)
    .run(parishId);
}

function approve(db, { parishId = "st-fiacre", ownerType, ownerId }) {
  db.prepare(`INSERT INTO directory_publication_profiles
    (id, parish_id, owner_type, owner_id, status, approval_status, approved_by_user_id, approved_at, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'approved', 'approved', 'seed-admin', 1, 1, 1, 1)`)
    .run(`pub_${ownerType}_${ownerId}`.replace(/[^a-zA-Z0-9_]/g, "_"), parishId, ownerType, ownerId);
}

function pref(db, { parishId = "st-fiacre", ownerType, ownerId, fieldKey, visibility = "directory_members", eligible = 1 }) {
  db.prepare(`INSERT INTO directory_field_privacy_preferences
    (id, parish_id, owner_type, owner_id, field_key, visibility, publication_eligible, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 1)`)
    .run(`pref_${ownerType}_${ownerId}_${fieldKey}`.replace(/[^a-zA-Z0-9_]/g, "_"), parishId, ownerType, ownerId, fieldKey, visibility, eligible);
}

function seedApprovedPhoto(db, { ownerType, ownerId, visibility = "directory_members" }) {
  const assetId = `media_${ownerType}_${ownerId}`.replace(/[^a-zA-Z0-9_]/g, "_");
  const assignmentId = `assignment_${assetId}`;
  const variantType = ownerType === "household" ? "household_card" : "avatar_medium";
  const mediaPurpose = ownerType === "household" ? "household_profile_photo" : "person_profile_photo";
  db.prepare(`INSERT INTO directory_media_assets
    (id, parish_id, owner_type, owner_id, media_purpose, lifecycle_status, processing_status,
     visibility, publication_eligible, source_filename, detected_mime_type, original_byte_size,
     original_width, original_height, decoded_pixel_count, content_hash, source_retained,
     reupload_required, uploaded_by_user_id, active_assignment_id, processing_attempt_count,
     pipeline_version, created_at, updated_at)
    VALUES (?, 'st-fiacre', ?, ?, ?, 'approved', 'securely_transformed', ?, ?, 'family.jpg',
      'image/jpeg', 128, 800, 600, 480000, 'test-hash', 1, 0, 'seed-admin', ?, 1,
      'directory-media-v1', 1, 1)`)
    .run(assetId, ownerType, ownerId, mediaPurpose, visibility, visibility === "directory_members" ? 1 : 0, assignmentId);
  db.prepare(`INSERT INTO directory_media_assignments
    (id, parish_id, owner_type, owner_id, media_purpose, media_asset_id, assignment_status,
     assigned_by_user_id, created_at, updated_at)
    VALUES (?, 'st-fiacre', ?, ?, ?, ?, 'active', 'seed-admin', 1, 1)`)
    .run(assignmentId, ownerType, ownerId, mediaPurpose, assetId);
  db.prepare(`INSERT INTO directory_media_variants
    (id, media_asset_id, variant_type, width, height, mime_type, byte_size, r2_object_key,
     content_hash, ready, created_at, secure_transform_status, pipeline_version,
     metadata_stripped, verified_at)
    VALUES (?, ?, ?, 512, 512, 'image/jpeg', 128, ?, 'test-hash', 1, 1,
      'securely_transformed', 'directory-media-v1', 1, 1)`)
    .run(`variant_${assetId}`, assetId, variantType, `test/${assetId}/${variantType}.jpg`);
  return { assetId, variantType };
}

function approveChildPhotoPublication(db, { householdId, childPersonId }) {
  db.prepare(`INSERT INTO directory_child_publication_requests
    (id, parish_id, household_id, child_person_id, requester_user_id, status,
     requested_fields_json, approved_fields_json, requested_photo, approved_photo,
     policy_revision, created_at, updated_at, approved_at)
    VALUES (?, 'st-fiacre', ?, ?, 'parent-user', 'approved', '["preferred_name"]',
      '["preferred_name"]', 1, 1, 'child-publication-v1', 1, 1, 1)`)
    .run(`child_photo_${childPersonId}`, householdId, childPersonId);
}

async function requestFor(env, db, user, path) {
  const session = await issuePlatformUserSession(env, user.id);
  grant(db, { userId: user.id, capabilities: [] });
  return new Request(`https://agapay.test${path}`, {
    headers: {
      Authorization: `Bearer ${session.token}`,
      [PLATFORM_USER_EMAIL_HEADER]: user.email
    }
  });
}

async function fixture() {
  const { env, db } = makeD1Env();
  enableDirectory(db);
  const actor = seedActor();
  const viewer = await ensurePlatformUser(env, { email: "viewer@example.org", displayName: "Viewer" });
  const donorOnly = await ensurePlatformUser(env, { email: "donor-only@example.org", displayName: "Donor Only" });
  const household = await createHousehold(env, { actor, displayName: "Antioch Household" });
  const visible = await createPerson(env, { actor, preferredName: "Maria Antioch", legalName: "Maria Private Legal" });
  const hidden = await createPerson(env, { actor, preferredName: "Hidden Antioch" });
  const child = await createPerson(env, { actor, preferredName: "Child Antioch" });
  await addHouseholdMember(env, { actor, householdId: household.id, personId: visible.id, relationship: "head" });
  await addHouseholdMember(env, { actor, householdId: household.id, personId: hidden.id, relationship: "spouse" });
  await addHouseholdMember(env, { actor, householdId: household.id, personId: child.id, relationship: "child" });
  await addParishAffiliation(env, { actor, personId: visible.id, status: "member" });
  await linkExternalIdentity(env, { actor, personId: visible.id, linkType: "platform_user", externalId: viewer.id });
  await createContactMethod(env, { actor, ownerType: "person", ownerId: visible.id, contactType: "email", value: "published@example.org", visibility: "directory_members", verified: true });
  await createContactMethod(env, { actor, ownerType: "person", ownerId: visible.id, contactType: "phone", value: "555-222-3333", visibility: "private", verified: true });
  approve(db, { ownerType: "person", ownerId: visible.id });
  approve(db, { ownerType: "person", ownerId: hidden.id });
  approve(db, { ownerType: "person", ownerId: child.id });
  approve(db, { ownerType: "household", ownerId: household.id });
  pref(db, { ownerType: "person", ownerId: visible.id, fieldKey: "adult_preferred_name" });
  pref(db, { ownerType: "household", ownerId: household.id, fieldKey: "household_display_name" });
  await setPersonPrivacyFlags(env, { actor, personId: hidden.id, protectedPerson: true });
  await setPersonPrivacyFlags(env, { actor, personId: child.id, isChild: true });
  return { env, db, viewer, donorOnly, household, visible, hidden, child };
}

async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS - ${name}`);
}

await test("active linked parish member can resolve private member-directory context", async () => {
  const { env, db, viewer } = await fixture();
  const request = await requestFor(env, db, viewer, "/api/directory/member");
  const context = await resolveMemberDirectoryContext(env, { request });
  assert.equal(context.parishId, "st-fiacre");
  assert.equal(context.viewerClass, "parish_member");
});

await test("AGAPAY user without parish affiliation is denied", async () => {
  const { env, donorOnly } = await fixture();
  const session = await issuePlatformUserSession(env, donorOnly.id);
  const request = new Request("https://agapay.test/api/directory/member", { headers: { Authorization: `Bearer ${session.token}`, [PLATFORM_USER_EMAIL_HEADER]: donorOnly.email } });
  await assert.rejects(() => resolveMemberDirectoryContext(env, { request }), /Directory profile was not found/);
});

await test("browse returns only approved visible people and omits private contact fields", async () => {
  const { env, db, viewer, visible } = await fixture();
  const context = await resolveMemberDirectoryContext(env, { request: await requestFor(env, db, viewer, "/api/directory/member") });
  const people = await listMemberDirectoryPeople(env, { context });
  assert.deepEqual(people.items.map((item) => item.displayName), ["Maria Antioch"]);
  const detail = await getMemberDirectoryPerson(env, { context, personId: visible.id });
  assert.equal(detail.person.contacts.length, 1);
  assert.equal(detail.person.contacts[0].value, "published@example.org");
  assert.equal(detail.person.contacts.some((contact) => String(contact.value || "").includes("555")), false);
  assert.equal(JSON.stringify(detail).includes("Maria Private Legal"), false);
});

await test("approved person photos are included with the authorized avatar variant", async () => {
  const { env, db, viewer, visible } = await fixture();
  const seeded = seedApprovedPhoto(db, { ownerType: "person", ownerId: visible.id });
  const context = await resolveMemberDirectoryContext(env, { request: await requestFor(env, db, viewer, "/api/directory/member") });
  const detail = await getMemberDirectoryPerson(env, { context, personId: visible.id });
  assert.deepEqual(detail.person.photo, {
    mediaAssetId: seeded.assetId,
    variantType: "avatar_medium",
    url: `/api/directory/member/media/${seeded.assetId}/variants/avatar_medium`,
    alt: "Maria Antioch"
  });
});

await test("private photos are omitted from member payloads", async () => {
  const { env, db, viewer, visible } = await fixture();
  seedApprovedPhoto(db, { ownerType: "person", ownerId: visible.id, visibility: "private" });
  const context = await resolveMemberDirectoryContext(env, { request: await requestFor(env, db, viewer, "/api/directory/member") });
  const detail = await getMemberDirectoryPerson(env, { context, personId: visible.id });
  assert.equal(detail.person.photo, null);
});

await test("household photos are omitted from payload and delivery while any child lacks photo authorization", async () => {
  const { env, db, viewer, household } = await fixture();
  const seeded = seedApprovedPhoto(db, { ownerType: "household", ownerId: household.id });
  const context = await resolveMemberDirectoryContext(env, { request: await requestFor(env, db, viewer, "/api/directory/member") });
  const detail = await getMemberDirectoryHousehold(env, { context, householdId: household.id });
  assert.equal(detail.household.photo, null, "an unauthorized child must prevent the family-photo reference from reaching the browser");
  await assert.rejects(
    () => streamMemberDirectoryMediaVariant(env, { context, mediaAssetId: seeded.assetId, variantType: seeded.variantType }),
    (error) => error instanceof DirectoryServiceError && error.code === "not_found"
  );
});

await test("household photos use the household-card variant after every child has explicit photo authorization", async () => {
  const { env, db, viewer, household, child } = await fixture();
  const seeded = seedApprovedPhoto(db, { ownerType: "household", ownerId: household.id });
  approveChildPhotoPublication(db, { householdId: household.id, childPersonId: child.id });
  const context = await resolveMemberDirectoryContext(env, { request: await requestFor(env, db, viewer, "/api/directory/member") });
  const detail = await getMemberDirectoryHousehold(env, { context, householdId: household.id });
  assert.deepEqual(detail.household.photo, {
    mediaAssetId: seeded.assetId,
    variantType: "household_card",
    url: `/api/directory/member/media/${seeded.assetId}/variants/household_card`,
    alt: "Antioch Household"
  });
});

await test("household detail includes each adult's shared contacts and name day without another profile request", async () => {
  const { env, db, viewer, household, visible } = await fixture();
  db.prepare(`INSERT INTO directory_household_namedays
    (id, parish_id, household_id, person_id, display_name, saint_name, feast_month_day, visibility, active, created_by_user_id, created_at, updated_at)
    VALUES ('nameday_maria', 'st-fiacre', ?, ?, 'Maria Antioch', 'St. Maria', '07-22', 'directory_members', 1, 'seed-admin', 1, 1)`)
    .run(household.id, visible.id);
  db.prepare(`INSERT INTO directory_household_namedays
    (id, parish_id, household_id, person_id, display_name, saint_name, feast_month_day, visibility, active, created_by_user_id, created_at, updated_at)
    VALUES ('nameday_private', 'st-fiacre', ?, ?, 'Maria Antioch', 'Private Saint', '01-01', 'private', 1, 'seed-admin', 1, 1)`)
    .run(household.id, visible.id);
  const context = await resolveMemberDirectoryContext(env, { request: await requestFor(env, db, viewer, "/api/directory/member") });
  const detail = await getMemberDirectoryHousehold(env, { context, householdId: household.id });
  assert.equal(detail.household.members.length, 1);
  assert.equal(detail.household.members[0].contacts[0].value, "published@example.org");
  assert.deepEqual(detail.household.members[0].namedays, [{ saintName: "St. Maria", feastMonthDay: "07-22" }]);
});

await test("active member-shared skills appear on person and family cards while private skills stay hidden", async () => {
  const { env, db, viewer, household, visible } = await fixture();
  db.prepare(`INSERT INTO directory_skill_catalog
    (id, code, name, category, is_platform_default, is_active, created_at, updated_at)
    VALUES ('skill_woodworking', 'woodworking', 'Woodworking', 'home_and_repairs', 1, 1, 1, 1),
           ('skill_accounting', 'accounting', 'Accounting', 'professional_knowledge', 1, 1, 1, 1)`)
    .run();
  db.prepare(`INSERT INTO directory_person_skill_listings
    (id, parish_id, person_id, skill_id, visibility, status, consent_recorded_at,
     consent_policy_version, consent_source, created_by_user_id, created_at, updated_at)
    VALUES ('listing_shared', 'st-fiacre', ?, 'skill_woodworking', 'directory_members', 'active', 1,
            'phase5b-v1', 'member_self_service', ?, 1, 1),
           ('listing_private', 'st-fiacre', ?, 'skill_accounting', 'private', 'active', 1,
            'phase5b-v1', 'member_self_service', ?, 1, 1)`)
    .run(visible.id, viewer.id, visible.id, viewer.id);
  const context = await resolveMemberDirectoryContext(env, { request: await requestFor(env, db, viewer, "/api/directory/member") });

  const person = await getMemberDirectoryPerson(env, { context, personId: visible.id });
  assert.deepEqual(person.person.skillsPreview.map((skill) => skill.displayLabel), ["Woodworking"]);
  const family = await getMemberDirectoryHousehold(env, { context, householdId: household.id });
  assert.deepEqual(family.household.skillsPreview.map((skill) => skill.displayLabel), ["Woodworking"]);
  assert.deepEqual(family.household.members[0].skillsPreview.map((skill) => skill.displayLabel), ["Woodworking"]);
  const browse = await listMemberDirectoryHouseholds(env, { context });
  assert.deepEqual(browse.items[0].skillsPreview.map((skill) => skill.displayLabel), ["Woodworking"]);
});

await test("an approved household includes active non-protected adults without separate person publication", async () => {
  const { env, db, viewer, household } = await fixture();
  const actor = seedActor();
  const spouse = await createPerson(env, { actor, preferredName: "Stephanie Antioch" });
  await addHouseholdMember(env, { actor, householdId: household.id, personId: spouse.id, relationship: "spouse" });
  const context = await resolveMemberDirectoryContext(env, { request: await requestFor(env, db, viewer, "/api/directory/member") });
  const detail = await getMemberDirectoryHousehold(env, { context, householdId: household.id });
  const publishedSpouse = detail.household.members.find((member) => member.id === spouse.id);
  assert.equal(publishedSpouse?.displayName, "Stephanie Antioch");
  assert.equal(publishedSpouse?.relationship, "spouse");
  assert.deepEqual(publishedSpouse?.contacts, []);
});

await test("protected people and children are absent from browse, search, counts, and household members", async () => {
  const { env, db, viewer, hidden, child } = await fixture();
  const context = await resolveMemberDirectoryContext(env, { request: await requestFor(env, db, viewer, "/api/directory/member") });
  const home = await getMemberDirectoryHome(env, { context });
  assert.deepEqual(home.parish, {
    id: "st-fiacre",
    name: "St. Fiacre Orthodox Church",
    city: "Dallas",
    state: "TX"
  });
  assert.equal(home.counts.people, 1);
  assert.equal(home.counts.households, 1);
  assert.ok(Array.isArray(home.households.items), "home response should include the first household page");
  assert.equal(home.households.totalVisible, home.counts.households);
  assert.equal((await searchMemberDirectory(env, { context, q: "Hidden" })).items.length, 0);
  assert.equal((await searchMemberDirectory(env, { context, q: "Child" })).items.length, 0);
  const households = await listMemberDirectoryHouseholds(env, { context });
  assert.equal(households.items[0].publishedMemberCount, 1);
  await assert.rejects(() => getMemberDirectoryPerson(env, { context, personId: hidden.id }), /Directory profile was not found/);
  await assert.rejects(() => getMemberDirectoryPerson(env, { context, personId: child.id }), /Directory profile was not found/);
});

await test("search uses published fields and never private phone values", async () => {
  const { env, db, viewer } = await fixture();
  const context = await resolveMemberDirectoryContext(env, { request: await requestFor(env, db, viewer, "/api/directory/member") });
  assert.equal((await searchMemberDirectory(env, { context, q: "Maria", type: "people" })).items.length, 1);
  assert.equal((await searchMemberDirectory(env, { context, q: "2223333" })).items.length, 0);
});

await test("member API emits private noindex responses", async () => {
  const { env, db, viewer } = await fixture();
  const response = await handleDirectoryMember(await requestFor(env, db, viewer, "/api/directory/member/people"), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Cache-Control"), /private/);
  assert.match(response.headers.get("X-Robots-Tag"), /noindex/);
});

console.log(`\n${passed} assertion group(s) passed. directory-phase4-tests.mjs OK.`);
