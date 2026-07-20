import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  addHouseholdMember,
  addParishAffiliation,
  completeHouseholdVerification,
  createHousehold,
  createParishSkill,
  createPerson,
  DirectoryServiceError,
  exportPublishedAdultsCsv,
  exportSkillsRosterCsv,
  getDirectoryMaintenanceDashboard,
  getHouseholdVerificationStatus,
  linkExternalIdentity,
  listMySkillListings,
  moderateSkillListing,
  resolveDirectoryAdminContext,
  resolveDirectorySelfServiceContext,
  resolveMemberDirectoryContext,
  saveMySkillListing,
  searchSkillListings,
  setPersonPrivacyFlags,
  updateDirectorySettings,
  updateSkillsSettings
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
    "0030_directory_child_publication_phase4b.sql",
    "0031_directory_ministries_phase5a.sql",
    "0032_directory_phase5b_skills_completion.sql"
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

function grant(db, { userId, parishId = "st-fiacre", capabilities = [] }) {
  const membershipId = `m_${userId}_${parishId}`.replace(/[^a-zA-Z0-9_]/g, "_");
  db.prepare(`INSERT OR IGNORE INTO parish_memberships
    (id, user_id, parish_id, role_template, status, invited_by_user_id, accepted_at, created_at, updated_at)
    VALUES (?, ?, ?, 'volunteer', 'active', 'test', datetime('now'), datetime('now'), datetime('now'))`)
    .run(membershipId, userId, parishId);
  for (const capability of capabilities) {
    db.prepare("INSERT OR IGNORE INTO membership_capabilities (id, membership_id, capability, granted_by_user_id, granted_at) VALUES (?, ?, ?, 'test', datetime('now'))")
      .run(`${membershipId}_${capability}`.replace(/[^a-zA-Z0-9_]/g, "_"), membershipId, capability);
  }
}

function approvePublication(db, { parishId = "st-fiacre", ownerType, ownerId }) {
  db.prepare(`INSERT INTO directory_publication_profiles
    (id, parish_id, owner_type, owner_id, status, approval_status, approved_by_user_id, approved_at, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'approved', 'approved', 'seed-admin', 1, 1, 1, 1)`)
    .run(`pub_${ownerType}_${ownerId}`.replace(/[^a-zA-Z0-9_]/g, "_"), parishId, ownerType, ownerId);
}

async function requestFor(env, user, path) {
  const session = await issuePlatformUserSession(env, user.id);
  return new Request(`https://agapay.test${path}`, {
    headers: { Authorization: `Bearer ${session.token}`, [PLATFORM_USER_EMAIL_HEADER]: user.email }
  });
}

function seedActor() {
  return { userId: "seed-admin", parishId: "st-fiacre", capabilities: ["directory.manage", "directory.households.manage"] };
}

async function fixture() {
  const { env, db } = makeD1Env();
  const actor = seedActor();
  await updateDirectorySettings(env, { actor, parishId: "st-fiacre", patch: { directoryEnabled: true, ordinaryMemberAccessEnabled: true } });

  const adminUser = await ensurePlatformUser(env, { email: "admin@example.org", displayName: "Admin" });
  const memberUser = await ensurePlatformUser(env, { email: "member@example.org", displayName: "Member" });
  const childUser = await ensurePlatformUser(env, { email: "child@example.org", displayName: "Child" });
  const protectedUser = await ensurePlatformUser(env, { email: "protected@example.org", displayName: "Protected" });

  grant(db, { userId: adminUser.id, capabilities: ["directory.skills.view", "directory.skills.manage", "directory.skills.catalog.manage", "directory.settings.manage"] });
  grant(db, { userId: memberUser.id });
  grant(db, { userId: childUser.id });
  grant(db, { userId: protectedUser.id });

  const household = await createHousehold(env, { actor, displayName: "The Loretto Household" });
  const member = await createPerson(env, { actor, preferredName: "Rosa Loretto", dateOfBirth: "1980-04-05" });
  const child = await createPerson(env, { actor, preferredName: "Young Loretto", dateOfBirth: "2015-03-01" });
  const protectedPerson = await createPerson(env, { actor, preferredName: "Quiet Loretto", dateOfBirth: "1975-08-08" });

  for (const person of [member, child, protectedPerson]) {
    await addHouseholdMember(env, { actor, householdId: household.id, personId: person.id, relationship: person.id === child.id ? "child" : "other" });
    await addParishAffiliation(env, { actor, personId: person.id, status: "member" });
  }
  await linkExternalIdentity(env, { actor, personId: member.id, linkType: "platform_user", externalId: memberUser.id });
  await linkExternalIdentity(env, { actor, personId: child.id, linkType: "platform_user", externalId: childUser.id });
  await linkExternalIdentity(env, { actor, personId: protectedPerson.id, linkType: "platform_user", externalId: protectedUser.id });
  await setPersonPrivacyFlags(env, { actor, personId: child.id, isChild: true });
  await setPersonPrivacyFlags(env, { actor, personId: protectedPerson.id, protectedPerson: true });
  approvePublication(db, { ownerType: "person", ownerId: member.id });
  approvePublication(db, { ownerType: "household", ownerId: household.id });

  const adminContext = await resolveDirectoryAdminContext(env, { request: await requestFor(env, adminUser, "/api/parish/dashboard/st-fiacre/directory/admin/context"), parishId: "st-fiacre" });
  const memberSelfContext = await resolveDirectorySelfServiceContext(env, { user: memberUser });
  memberSelfContext.manageableHouseholds = [{ id: household.id, parishId: "st-fiacre", displayName: household.displayName }];
  const memberDirectoryContext = await resolveMemberDirectoryContext(env, { request: await requestFor(env, memberUser, "/api/directory/member?parishId=st-fiacre") });
  const childSelfContext = {
    user: childUser,
    parishId: "st-fiacre",
    claimed: true,
    currentPerson: { id: child.id },
    manageableHouseholds: [{ id: household.id, parishId: "st-fiacre" }],
    capabilities: ["directory.self.manage"]
  };
  const protectedSelfContext = {
    user: protectedUser,
    parishId: "st-fiacre",
    claimed: true,
    currentPerson: { id: protectedPerson.id },
    manageableHouseholds: [{ id: household.id, parishId: "st-fiacre" }],
    capabilities: ["directory.self.manage"]
  };

  return { env, db, adminUser, memberUser, household, member, adminContext, memberSelfContext, memberDirectoryContext, childSelfContext, protectedSelfContext };
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS - ${name}`);
  } catch (error) {
    console.error(`FAIL - ${name}`);
    console.error(error);
    throw error;
  }
}

await test("Phase 5B migration creates settings, catalog, listings, and verification tables", async () => {
  const { db } = makeD1Env();
  const settingsInfo = db.prepare("PRAGMA table_info(directory_parish_settings)").all().map((row) => row.name);
  assert.ok(settingsInfo.includes("skills_directory_enabled"));
  assert.ok(settingsInfo.includes("household_verification_interval_days"));
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM directory_skill_catalog WHERE is_platform_default = 1").get().count >= 10, true);
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'directory_person_skill_listings'").get().name, "directory_person_skill_listings");
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'directory_household_verifications'").get().name, "directory_household_verifications");
});

await test("adult members can self-list skills, activate consent, search, and withdraw without re-sending skill fields", async () => {
  const fx = await fixture();
  const catalog = await listMySkillListings(fx.env, { context: fx.memberSelfContext });
  const skillId = catalog.catalog.find((skill) => skill.code === "carpentry")?.id || catalog.catalog[0].id;
  const draft = await saveMySkillListing(fx.env, {
    context: fx.memberSelfContext,
    data: { skillId, customDisplayLabel: "Cabinet repair", visibility: "private", status: "draft" }
  });
  assert.equal(draft.status, "draft");
  assert.equal((await searchSkillListings(fx.env, { context: fx.memberDirectoryContext, q: "Cabinet" })).items.length, 0);

  const active = await saveMySkillListing(fx.env, {
    context: fx.memberSelfContext,
    listingId: draft.id,
    data: { visibility: "directory_members", status: "active", contactPreference: "parish_office" }
  });
  assert.equal(active.status, "active");
  const results = await searchSkillListings(fx.env, { context: fx.memberDirectoryContext, q: "Cabinet" });
  assert.equal(results.items.length, 1);
  assert.match(results.disclaimer, /self-reported/i);

  const withdrawn = await saveMySkillListing(fx.env, {
    context: fx.memberSelfContext,
    listingId: draft.id,
    data: { status: "withdrawn" }
  });
  assert.equal(withdrawn.status, "withdrawn");
  assert.equal((await searchSkillListings(fx.env, { context: fx.memberDirectoryContext, q: "Cabinet" })).items.length, 0);
});

await test("children and protected people cannot publish skill listings", async () => {
  const fx = await fixture();
  const skillId = (await listMySkillListings(fx.env, { context: fx.memberSelfContext })).catalog[0].id;
  await assert.rejects(
    saveMySkillListing(fx.env, { context: fx.childSelfContext, data: { skillId, status: "active", visibility: "directory_members" } }),
    (error) => error instanceof DirectoryServiceError && error.code === "forbidden"
  );
  await assert.rejects(
    saveMySkillListing(fx.env, { context: fx.protectedSelfContext, data: { skillId, status: "active", visibility: "directory_members" } }),
    (error) => error instanceof DirectoryServiceError && error.code === "forbidden"
  );
});

await test("staff-only settings suppress ordinary member search", async () => {
  const fx = await fixture();
  await updateSkillsSettings(fx.env, { context: fx.adminContext, patch: { skillsStaffOnlyMode: true } });
  await assert.rejects(
    searchSkillListings(fx.env, { context: fx.memberDirectoryContext }),
    (error) => error instanceof DirectoryServiceError && error.code === "not_found"
  );
});

await test("admin catalog, moderation, exports, print data, and maintenance dashboard work", async () => {
  const fx = await fixture();
  const custom = await createParishSkill(fx.env, { context: fx.adminContext, data: { name: "Icon Restoration", category: "arts_and_media" } });
  assert.equal(custom.name, "Icon Restoration");
  const listing = await saveMySkillListing(fx.env, {
    context: fx.memberSelfContext,
    data: { skillId: custom.id, status: "active", visibility: "directory_members", serviceMode: "parish_projects" }
  });
  const hidden = await moderateSkillListing(fx.env, { context: fx.adminContext, listingId: listing.id, action: "hide", reason: "Testing review hold." });
  assert.equal(hidden.status, "hidden_by_parish");
  const restored = await moderateSkillListing(fx.env, { context: fx.adminContext, listingId: listing.id, action: "restore" });
  assert.equal(restored.status, "active");

  const skillsCsv = await exportSkillsRosterCsv(fx.env, { context: fx.adminContext });
  assert.match(skillsCsv.body, /self-reported/i);
  assert.match(skillsCsv.body, /Icon Restoration/);
  const adultsCsv = await exportPublishedAdultsCsv(fx.env, { context: fx.adminContext });
  assert.match(adultsCsv.body, /Rosa Loretto/);
  const maintenance = await getDirectoryMaintenanceDashboard(fx.env, { context: fx.adminContext });
  assert.equal(typeof maintenance.unclaimedPeople, "number");
  assert.ok(maintenance.actions && Array.isArray(maintenance.actions.overdueHouseholds));
  assert.ok(Array.isArray(maintenance.actions.unclaimedPeople));
});

await test("household verification records member confirmation and next due date", async () => {
  const fx = await fixture();
  const before = await getHouseholdVerificationStatus(fx.env, { context: fx.memberSelfContext, householdId: fx.household.id });
  assert.equal(before.status, "due");
  const after = await completeHouseholdVerification(fx.env, { context: fx.memberSelfContext, householdId: fx.household.id, reconfirmSkills: true });
  assert.equal(after.status, "current");
  assert.ok(after.dueAt > Date.now());
});

await test("member skills endpoint is private no-store JSON", async () => {
  const fx = await fixture();
  const request = await requestFor(fx.env, fx.memberUser, "/api/directory/member/skills?parishId=st-fiacre");
  const response = await handleDirectoryMember(request, fx.env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  const body = await response.json();
  assert.equal(body.ok, true);
});

console.log(`\n${passed} assertion group(s) passed. directory-phase5b-tests.mjs OK.`);
