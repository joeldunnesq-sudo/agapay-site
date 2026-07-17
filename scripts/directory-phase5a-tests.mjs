import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  addHouseholdMember,
  addParishAffiliation,
  assignMinistryLeader,
  assignMinistryParticipant,
  createHousehold,
  createMinistry,
  createPerson,
  decideDirectoryReviewItem,
  DirectoryServiceError,
  getMemberDirectoryPerson,
  getMinistryAdmin,
  getMyMinistries,
  getPublishedMinistry,
  linkExternalIdentity,
  listDirectoryReviewQueue,
  listMemberDirectoryPeople,
  listPublishedMinistries,
  resolveDirectoryAdminContext,
  resolveDirectorySelfServiceContext,
  resolveMemberDirectoryContext,
  setMinistryParticipationPublication,
  setPersonPrivacyFlags,
  submitMinistryInterest,
  updateDirectorySettings,
  withdrawMinistryInterest
} from "../src/directory/index.js";
import { ensurePlatformUser, issuePlatformUserSession, PLATFORM_USER_EMAIL_HEADER } from "../src/lib/identity.js";
import { resolveAuthorizationContext } from "../src/lib/authorization.js";

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
    "0031_directory_ministries_phase5a.sql"
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
  const reviewerUser = await ensurePlatformUser(env, { email: "reviewer@example.org", displayName: "Reviewer" });
  const memberUser = await ensurePlatformUser(env, { email: "member@example.org", displayName: "Member" });
  const otherUser = await ensurePlatformUser(env, { email: "other@example.org", displayName: "Other" });

  grant(db, { userId: adminUser.id, capabilities: ["directory.ministries.manage"] });
  grant(db, { userId: reviewerUser.id, capabilities: ["directory.ministry_interest.review"] });
  grant(db, { userId: memberUser.id, capabilities: [] });

  const household = await createHousehold(env, { actor, displayName: "The Antioch Household" });
  const member = await createPerson(env, { actor, preferredName: "Maria Antioch" });
  const other = await createPerson(env, { actor, preferredName: "Nina Antioch" });
  const child = await createPerson(env, { actor, preferredName: "Little Antioch" });
  const protectedPerson = await createPerson(env, { actor, preferredName: "Hidden Antioch" });

  for (const person of [member, other, child, protectedPerson]) {
    await addHouseholdMember(env, { actor, householdId: household.id, personId: person.id, relationship: person.id === child.id ? "child" : "other" });
    await addParishAffiliation(env, { actor, personId: person.id, status: "member" });
  }
  await linkExternalIdentity(env, { actor, personId: member.id, linkType: "platform_user", externalId: memberUser.id });
  await linkExternalIdentity(env, { actor, personId: other.id, linkType: "platform_user", externalId: otherUser.id });
  await setPersonPrivacyFlags(env, { actor, personId: child.id, isChild: true });
  await setPersonPrivacyFlags(env, { actor, personId: protectedPerson.id, protectedPerson: true });
  approvePublication(db, { ownerType: "person", ownerId: member.id });
  approvePublication(db, { ownerType: "person", ownerId: other.id });
  approvePublication(db, { ownerType: "household", ownerId: household.id });

  const adminContext = await resolveDirectoryAdminContext(env, { request: await requestFor(env, adminUser, "/api/parish/dashboard/st-fiacre/directory/admin/context"), parishId: "st-fiacre" });
  const reviewerContext = await resolveDirectoryAdminContext(env, { request: await requestFor(env, reviewerUser, "/api/parish/dashboard/st-fiacre/directory/admin/context"), parishId: "st-fiacre" });
  const memberSelfContext = await resolveDirectorySelfServiceContext(env, { user: memberUser });
  const memberDirectoryContext = await resolveMemberDirectoryContext(env, { request: await requestFor(env, memberUser, "/api/directory/member") });

  return { env, db, adminUser, reviewerUser, memberUser, otherUser, household, member, other, child, protectedPerson, adminContext, reviewerContext, memberSelfContext, memberDirectoryContext };
}

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

async function createActiveMinistry(env, context, patch = {}) {
  const result = await createMinistry(env, {
    context,
    data: {
      displayName: "Hospitality",
      slug: "hospitality",
      category: "hospitality",
      status: "active",
      visibility: "parish_members",
      requestPolicy: "request_interest",
      shortDescription: "Welcomes parish members and guests.",
      ...patch
    }
  });
  return result.ministry;
}

async function reviewVersion(env, context, sourceId) {
  const queue = await listDirectoryReviewQueue(env, { context });
  const item = queue.find((entry) => entry.sourceType === "ministry_interest" && entry.sourceId === sourceId);
  assert.ok(item, "expected ministry interest request in review queue");
  return item.version;
}

await test("migration creates ministry tables and extends review metadata for ministry interest", async () => {
  const { db } = makeD1Env();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
  assert.ok(tables.includes("directory_ministries"));
  assert.ok(tables.includes("directory_ministry_leaders"));
  assert.ok(tables.includes("directory_ministry_participants"));
  assert.ok(tables.includes("directory_ministry_interest_requests"));
  db.prepare(`INSERT INTO directory_review_metadata
    (id, parish_id, source_type, source_id, queue_status, priority, created_at, updated_at)
    VALUES ('rv_ministry', 'st-fiacre', 'ministry_interest', 'req_1', 'pending_review', 'normal', 1, 1)`).run();
});

await test("authorized administrator creates a ministry; invalid category and duplicate slug are denied", async () => {
  const { env, adminContext } = await fixture();
  const ministry = await createActiveMinistry(env, adminContext);
  assert.equal(ministry.displayName, "Hospitality");
  await assert.rejects(
    () => createActiveMinistry(env, adminContext, { displayName: "Other Hospitality" }),
    (error) => error instanceof Error
  );
  await assert.rejects(
    () => createActiveMinistry(env, adminContext, { displayName: "Readers", slug: "readers", category: "ordination" }),
    (error) => error instanceof DirectoryServiceError && error.code === "validation_failed"
  );
});

await test("ordinary members cannot create ministries", async () => {
  const { env, memberSelfContext } = await fixture();
  await assert.rejects(
    () => createActiveMinistry(env, memberSelfContext, { slug: "choir" }),
    (error) => error instanceof DirectoryServiceError && error.status === 403
  );
});

await test("member browse shows active parish-member ministries and hides draft, staff-only, hidden, and archived ministries", async () => {
  const { env, adminContext, memberDirectoryContext } = await fixture();
  await createActiveMinistry(env, adminContext);
  await createMinistry(env, { context: adminContext, data: { displayName: "Draft Team", slug: "draft-team", category: "other", status: "draft", visibility: "parish_members" } });
  await createMinistry(env, { context: adminContext, data: { displayName: "Staff Team", slug: "staff-team", category: "administrative", status: "active", visibility: "staff_only" } });
  await createMinistry(env, { context: adminContext, data: { displayName: "Hidden Team", slug: "hidden-team", category: "other", status: "active", visibility: "hidden" } });
  await createMinistry(env, { context: adminContext, data: { displayName: "Archived Team", slug: "archived-team", category: "other", status: "archived", visibility: "parish_members" } });
  const browse = await listPublishedMinistries(env, { context: memberDirectoryContext });
  assert.deepEqual(browse.items.map((item) => item.displayName), ["Hospitality"]);
});

await test("eligible adult submits interest, duplicate unresolved requests are denied, and withdrawal is idempotently hidden from review", async () => {
  const { env, adminContext, memberSelfContext, reviewerContext } = await fixture();
  const ministry = await createActiveMinistry(env, adminContext);
  const request = await submitMinistryInterest(env, { context: memberSelfContext, ministryId: ministry.id, memberNote: "I can help set up tables." });
  assert.equal(request.status, "submitted");
  await assert.rejects(
    () => submitMinistryInterest(env, { context: memberSelfContext, ministryId: ministry.id }),
    (error) => error instanceof Error
  );
  const queue = await listDirectoryReviewQueue(env, { context: reviewerContext });
  assert.ok(queue.some((item) => item.sourceType === "ministry_interest" && item.sourceId === request.id));
  const withdrawn = await withdrawMinistryInterest(env, { context: memberSelfContext, requestId: request.id });
  assert.equal(withdrawn.status, "withdrawn");
  const queueAfter = await listDirectoryReviewQueue(env, { context: reviewerContext });
  assert.equal(queueAfter.some((item) => item.sourceId === request.id), false);
});

await test("children and protected people cannot hold leadership or submit ordinary ministry interest", async () => {
  const { env, adminContext, memberSelfContext, child, protectedPerson } = await fixture();
  const ministry = await createActiveMinistry(env, adminContext);
  await assert.rejects(
    () => assignMinistryLeader(env, { context: adminContext, ministryId: ministry.id, personId: child.id }),
    (error) => error instanceof DirectoryServiceError && error.code === "child_not_allowed"
  );
  await assert.rejects(
    () => assignMinistryParticipant(env, { context: adminContext, ministryId: ministry.id, personId: protectedPerson.id }),
    (error) => error instanceof DirectoryServiceError && error.code === "protected_person_denied"
  );
  const protectedUser = await ensurePlatformUser(env, { email: "protected@example.org", displayName: "Protected" });
  await linkExternalIdentity(env, { actor: seedActor(), personId: protectedPerson.id, linkType: "platform_user", externalId: protectedUser.id });
  const protectedContext = await resolveDirectorySelfServiceContext(env, { user: protectedUser });
  await assert.rejects(
    () => submitMinistryInterest(env, { context: protectedContext, ministryId: ministry.id }),
    (error) => error instanceof DirectoryServiceError && error.code === "protected_person_denied"
  );
  assert.equal(memberSelfContext.currentPerson.child, false);
});

await test("review approval is capability-bound, blocks self-approval, and creates non-published participation", async () => {
  const { env, db, adminContext, reviewerContext, memberUser, memberSelfContext, memberDirectoryContext } = await fixture();
  const ministry = await createActiveMinistry(env, adminContext);
  const request = await submitMinistryInterest(env, { context: memberSelfContext, ministryId: ministry.id });
  grant(db, { userId: memberUser.id, capabilities: ["directory.ministry_interest.review"] });
  const memberReviewerContext = await resolveDirectoryAdminContext(env, { request: await requestFor(env, memberUser, "/api/parish/dashboard/st-fiacre/directory/admin/context"), parishId: "st-fiacre" });
  await assert.rejects(
    () => decideDirectoryReviewItem(env, { context: memberReviewerContext, sourceType: "ministry_interest", sourceId: request.id, decision: "approve" }),
    (error) => error instanceof DirectoryServiceError && error.code === "self_approval_denied"
  );
  const version = await reviewVersion(env, reviewerContext, request.id);
  await decideDirectoryReviewItem(env, { context: reviewerContext, sourceType: "ministry_interest", sourceId: request.id, decision: "approve", expectedVersion: version });
  const own = await getMyMinistries(env, { context: memberSelfContext });
  assert.equal(own.participations.length, 1);
  const profile = await getMemberDirectoryPerson(env, { context: memberDirectoryContext, personId: memberSelfContext.currentPerson.id });
  assert.equal(profile.person.ministries.length, 0, "approval creates participation, not directory publication");
});

await test("participant publication is separate and then appears on profile and ministry filter", async () => {
  const { env, adminContext, member, memberDirectoryContext } = await fixture();
  const ministry = await createActiveMinistry(env, adminContext);
  await assignMinistryParticipant(env, { context: adminContext, ministryId: ministry.id, personId: member.id, participationType: "volunteer" });
  const admin = await getMinistryAdmin(env, { context: adminContext, ministryId: ministry.id });
  const participant = admin.participants[0];
  await setMinistryParticipationPublication(env, { context: adminContext, participantId: participant.id, preference: "directory", approvedPublication: true });
  const profile = await getMemberDirectoryPerson(env, { context: memberDirectoryContext, personId: member.id });
  assert.equal(profile.person.ministries[0].displayName, "Hospitality");
  const filtered = await listMemberDirectoryPeople(env, { context: memberDirectoryContext, ministryId: ministry.id });
  assert.equal(filtered.items.some((item) => item.id === member.id), true);
});

await test("published leadership is display-only and grants no platform capabilities", async () => {
  const { env, adminContext, other, otherUser, memberDirectoryContext } = await fixture();
  const ministry = await createActiveMinistry(env, adminContext);
  await assignMinistryLeader(env, { context: adminContext, ministryId: ministry.id, personId: other.id, assignmentType: "coordinator", publish: true });
  const detail = await getPublishedMinistry(env, { context: memberDirectoryContext, ministryId: ministry.id });
  assert.equal(detail.ministry.leaders[0].displayName, "Nina Antioch");
  const auth = await resolveAuthorizationContext(env, { userId: otherUser.id, parishId: "st-fiacre" });
  assert.equal(auth.capabilities.includes("directory.ministries.manage"), false);
  assert.equal(auth.capabilities.includes("commerce.manage"), false);
  assert.equal(auth.capabilities.includes("learn.manage"), false);
  assert.equal(auth.capabilities.includes("accounting.post"), false);
});

await test("alias resolution stores participation on the survivor and avoids duplicate visible rows", async () => {
  const { env, db, adminContext, other, member } = await fixture();
  const ministry = await createActiveMinistry(env, adminContext);
  db.prepare("INSERT INTO directory_merge_aliases (id, parish_id, entity_type, old_entity_id, survivor_entity_id, merge_event_id, active, created_at) VALUES ('alias_1', 'st-fiacre', 'person', ?, ?, 'merge_1', 1, 1)")
    .run(other.id, member.id);
  await assignMinistryParticipant(env, { context: adminContext, ministryId: ministry.id, personId: other.id });
  const rows = db.prepare("SELECT person_id FROM directory_ministry_participants WHERE ministry_id = ?").all(ministry.id);
  assert.deepEqual(rows.map((row) => row.person_id), [member.id]);
  await assert.rejects(
    () => assignMinistryParticipant(env, { context: adminContext, ministryId: ministry.id, personId: member.id }),
    (error) => error instanceof Error
  );
});

if (process.exitCode) {
  console.error(`\n${passed} Phase 5A assertion group(s) passed before failure.`);
  process.exit(process.exitCode);
}

console.log(`\n${passed} assertion group(s) passed. directory-phase5a-tests.mjs OK.`);
