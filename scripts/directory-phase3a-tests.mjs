import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  addHouseholdAdmin,
  addHouseholdMember,
  addParishAffiliation,
  applyHouseholdDirectCorrection,
  applyPersonDirectCorrection,
  assignDirectoryReviewItem,
  createDirectoryChangeRequest,
  createDirectoryNote,
  createHousehold,
  createPerson,
  decideDirectoryReviewItem,
  DirectoryServiceError,
  getDirectoryAdminDashboard,
  getDirectoryReviewItem,
  linkExternalIdentity,
  listDirectoryAuditHistory,
  listDirectoryHouseholdsAdmin,
  listDirectoryPeopleAdmin,
  listDirectoryReviewQueue,
  resolveDirectoryAdminContext,
  resolveDirectorySelfServiceContext,
  transitionSelfServicePublication
} from "../src/directory/index.js";
import { handleDirectoryAdmin } from "../src/handlers/directory-admin.js";
import { ensurePlatformUser, issuePlatformUserSession, PLATFORM_USER_EMAIL_HEADER } from "../src/lib/identity.js";

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
  db.exec(migration("0026_directory_media_phase2b.sql"));
  db.exec(migration("0027_directory_admin_phase3a.sql"));
  db.exec(migration("0028_directory_media_secure_transformation.sql"));

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
  return { env: { AGAPAY_DB, AGAPAY_ENVIRONMENT: "test" }, db };
}

function actor(parishId = "st-fiacre", capabilities = ["directory.manage"], userId = "seed-admin", personId = "") {
  return { userId, parishId, capabilities, personId };
}

function grant(db, { userId, parishId = "st-fiacre", capabilities }) {
  const membershipId = `m_${userId}_${parishId}`.replace(/[^a-zA-Z0-9_]/g, "_");
  db.prepare(`INSERT INTO parish_memberships
    (id, user_id, parish_id, role_template, status, invited_by_user_id, accepted_at, created_at, updated_at)
    VALUES (?, ?, ?, 'administrator', 'active', 'test', datetime('now'), datetime('now'), datetime('now'))`)
    .run(membershipId, userId, parishId);
  for (const capability of capabilities) {
    db.prepare("INSERT INTO membership_capabilities (id, membership_id, capability, granted_by_user_id, granted_at) VALUES (?, ?, ?, 'test', datetime('now'))")
      .run(`${membershipId}_${capability}`.replace(/[^a-zA-Z0-9_]/g, "_"), membershipId, capability);
  }
  return membershipId;
}

async function fixture() {
  const { env, db } = makeD1Env();
  const reviewerUser = await ensurePlatformUser(env, { email: "reviewer@example.org", displayName: "Reviewer" });
  const requesterUser = await ensurePlatformUser(env, { email: "anna@example.org", displayName: "Anna Dunn" });
  const limitedUser = await ensurePlatformUser(env, { email: "limited@example.org", displayName: "Limited" });
  grant(db, {
    userId: reviewerUser.id,
    capabilities: [
      "directory.requests.review",
      "directory.corrections.review",
      "directory.publication.review",
      "directory.people.manage",
      "directory.households.manage",
      "directory.notes.view",
      "directory.notes.manage",
      "directory.assignments.manage",
      "directory.audit.view"
    ]
  });
  grant(db, { userId: requesterUser.id, capabilities: ["directory.self.manage"] });
  grant(db, { userId: limitedUser.id, capabilities: ["directory.requests.review"] });

  const seedActor = actor();
  const reviewerPerson = await createPerson(env, { actor: seedActor, preferredName: "Reviewer" });
  const adult = await createPerson(env, { actor: seedActor, preferredName: "Anna Dunn", legalName: "Anna Dunn", biologicalSex: "female" });
  const spouse = await createPerson(env, { actor: seedActor, preferredName: "John Dunn", biologicalSex: "male" });
  const household = await createHousehold(env, { actor: seedActor, displayName: "The Dunn Household" });
  await addHouseholdMember(env, { actor: seedActor, householdId: household.id, personId: adult.id, relationship: "head" });
  await addHouseholdMember(env, { actor: seedActor, householdId: household.id, personId: spouse.id, relationship: "spouse" });
  await addHouseholdAdmin(env, { actor: seedActor, householdId: household.id, personId: adult.id });
  await addParishAffiliation(env, { actor: seedActor, personId: adult.id, status: "member" });
  await addParishAffiliation(env, { actor: seedActor, personId: spouse.id, status: "member" });
  await linkExternalIdentity(env, { actor: seedActor, personId: adult.id, linkType: "platform_user", externalId: requesterUser.id });
  await linkExternalIdentity(env, { actor: seedActor, personId: reviewerPerson.id, linkType: "platform_user", externalId: reviewerUser.id });

  const selfContext = await resolveDirectorySelfServiceContext(env, { user: requesterUser });
  const reviewerContext = await resolveDirectoryAdminContext(env, {
    request: requestWithSession("https://agapay.app/api/parish/dashboard/st-fiacre/directory/admin/context", await issuePlatformUserSession(env, reviewerUser.id), reviewerUser.email),
    parishId: "st-fiacre"
  });
  return { env, db, reviewerUser, requesterUser, limitedUser, reviewerContext, selfContext, adult, spouse, household };
}

function requestWithSession(url, session, email, init = {}) {
  return new Request(url, {
    ...init,
    headers: {
      "Authorization": `Bearer ${session.token}`,
      [PLATFORM_USER_EMAIL_HEADER]: email,
      ...(init.headers || {})
    }
  });
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

await test("migration creates review metadata and internal notes", async () => {
  const { db } = makeD1Env();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
  assert.ok(tables.includes("directory_review_metadata"));
  assert.ok(tables.includes("directory_internal_notes"));
});

await test("admin context denies legacy bearer and resolves capability-scoped platform session", async () => {
  const { env, reviewerUser } = await fixture();
  const legacy = new Request("https://agapay.app/api/parish/dashboard/st-fiacre/directory/admin/context", {
    headers: { Authorization: "Bearer legacy-parish-token" }
  });
  const denied = await handleDirectoryAdmin(legacy, env, "st-fiacre");
  assert.equal(denied.status, 401);

  const session = await issuePlatformUserSession(env, reviewerUser.id);
  const response = await handleDirectoryAdmin(requestWithSession("https://agapay.app/api/parish/dashboard/st-fiacre/directory/admin/context", session, reviewerUser.email), env, "st-fiacre");
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.context.permissions.canReviewRequests, true);
});

await test("queue aggregates Phase 2A change requests and publication submissions safely", async () => {
  const { env, reviewerContext, selfContext, adult } = await fixture();
  const change = await createDirectoryChangeRequest(env, {
    context: selfContext,
    parishId: "st-fiacre",
    targetType: "person",
    targetId: adult.id,
    requestType: "person_profile_review",
    summary: "Legal name spelling review",
    payload: { legalName: "Anna Dunne" }
  });
  await transitionSelfServicePublication(env, { context: selfContext, ownerType: "person", ownerId: adult.id, status: "pending_approval" });
  const queue = await listDirectoryReviewQueue(env, { context: reviewerContext });
  assert.equal(queue.some((item) => item.sourceId === change.id && item.reviewType === "person_canonical_correction"), true);
  assert.equal(queue.some((item) => item.reviewType === "publication_person"), true);
  assert.ok(queue.every((item) => !("requestedPayloadJson" in item)));
});

await test("assignment, detail, approval, notification, and audit are transactional", async () => {
  const { env, db, reviewerContext, selfContext, adult } = await fixture();
  const change = await createDirectoryChangeRequest(env, {
    context: selfContext,
    parishId: "st-fiacre",
    targetType: "person",
    targetId: adult.id,
    requestType: "person_profile_review",
    summary: "Legal name spelling review",
    payload: { legalName: "Anna Dunne" }
  });
  await assignDirectoryReviewItem(env, { context: reviewerContext, sourceType: "change_request", sourceId: change.id, assigneeUserId: reviewerContext.user.id });
  const detail = await getDirectoryReviewItem(env, { context: reviewerContext, sourceType: "change_request", sourceId: change.id });
  assert.equal(detail.proposed.legalName, "Anna Dunne");
  const result = await decideDirectoryReviewItem(env, {
    context: reviewerContext,
    sourceType: "change_request",
    sourceId: change.id,
    decision: "approve",
    expectedVersion: detail.item.version,
    reasonCode: "verified"
  });
  assert.equal(result.decision, "approve");
  const person = db.prepare("SELECT legal_name FROM directory_people WHERE id = ?").get(adult.id);
  assert.equal(person.legal_name, "Anna Dunne");
  assert.equal(db.prepare("SELECT status FROM directory_change_requests WHERE id = ?").get(change.id).status, "completed");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM directory_notification_events WHERE event_type = 'directory.review.approved'").get().count, 1);
  const audit = await listDirectoryAuditHistory(env, { context: reviewerContext });
  assert.equal(audit.some((event) => event.action === "directory.review_item.approved"), true);
});

await test("self approval and stale approval are denied", async () => {
  const { env, reviewerContext, selfContext, adult, requesterUser } = await fixture();
  const change = await createDirectoryChangeRequest(env, {
    context: selfContext,
    parishId: "st-fiacre",
    targetType: "person",
    targetId: adult.id,
    requestType: "person_profile_review",
    summary: "Legal name spelling review",
    payload: { legalName: "Anna Dunne" }
  });
  const requesterAdminContext = {
    user: { id: requesterUser.id, email: requesterUser.email, displayName: requesterUser.displayName },
    parishId: "st-fiacre",
    personId: adult.id,
    capabilities: ["directory.corrections.review"],
    permissions: { canManagePeople: false, canManageProtected: false, canViewNotes: false, canAssign: false, canViewAudit: false, canViewPrivateContact: false }
  };
  const detail = await getDirectoryReviewItem(env, { context: requesterAdminContext, sourceType: "change_request", sourceId: change.id });
  await assert.rejects(
    () => decideDirectoryReviewItem(env, { context: requesterAdminContext, sourceType: "change_request", sourceId: change.id, decision: "approve", expectedVersion: detail.item.version }),
    (error) => error instanceof DirectoryServiceError && error.code === "self_approval_denied"
  );
  await assert.rejects(
    () => decideDirectoryReviewItem(env, { context: reviewerContext, sourceType: "change_request", sourceId: change.id, decision: "approve", expectedVersion: "old" }),
    (error) => error instanceof DirectoryServiceError && error.code === "stale_review_item"
  );
});

await test("people, household, direct corrections, and notes are scoped and controlled", async () => {
  const { env, reviewerContext, adult, household } = await fixture();
  const people = await listDirectoryPeopleAdmin(env, { context: reviewerContext });
  assert.equal(people.some((person) => person.id === adult.id), true);
  const households = await listDirectoryHouseholdsAdmin(env, { context: reviewerContext });
  assert.equal(households.some((item) => item.id === household.id), true);
  const personDetail = await applyPersonDirectCorrection(env, { context: reviewerContext, personId: adult.id, expectedVersion: adult.updatedAt, patch: { preferredName: "Anna Dunne" } });
  assert.equal(personDetail.preferredName, "Anna Dunne");
  const householdDetail = await applyHouseholdDirectCorrection(env, { context: reviewerContext, householdId: household.id, expectedVersion: household.updatedAt, patch: { displayName: "Dunne Household" } });
  assert.equal(householdDetail.household.displayName, "Dunne Household");
  const note = await createDirectoryNote(env, { context: reviewerContext, targetType: "household", targetId: household.id, category: "verification", body: "Name spelling confirmed." });
  assert.equal(note.category, "verification");
});

if (process.exitCode) {
  console.error(`\n${passed} Phase 3A assertion group(s) passed before failure.`);
  process.exit(process.exitCode);
}

console.log(`\n${passed} assertion group(s) passed. directory-phase3a-tests.mjs OK.`);
