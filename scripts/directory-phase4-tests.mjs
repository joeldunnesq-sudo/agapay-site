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
  linkExternalIdentity,
  resolveMemberDirectoryContext,
  getMemberDirectoryHome,
  getMemberDirectoryPerson,
  listMemberDirectoryHouseholds,
  listMemberDirectoryPeople,
  searchMemberDirectory,
  setPersonPrivacyFlags
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
    "0030_directory_child_publication_phase4b.sql"
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
  assert.equal(JSON.stringify(detail).includes("555"), false);
  assert.equal(JSON.stringify(detail).includes("Maria Private Legal"), false);
});

await test("protected people and children are absent from browse, search, counts, and household members", async () => {
  const { env, db, viewer, hidden, child } = await fixture();
  const context = await resolveMemberDirectoryContext(env, { request: await requestFor(env, db, viewer, "/api/directory/member") });
  const home = await getMemberDirectoryHome(env, { context });
  assert.equal(home.counts.people, 1);
  assert.equal(home.counts.households, 1);
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
