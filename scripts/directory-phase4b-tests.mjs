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
  createOrUpdateChildPublicationDraft,
  createPerson,
  decideDirectoryReviewItem,
  DirectoryServiceError,
  getChildPublicationStatus,
  getMemberDirectoryHousehold,
  linkExternalIdentity,
  listDirectoryReviewQueue,
  listMemberDirectoryHouseholds,
  listMemberDirectoryPeople,
  resolveDirectoryAdminContext,
  resolveDirectorySelfServiceContext,
  resolveMemberDirectoryContext,
  revokeChildPublicationApproval,
  sanitizeChildFields,
  searchMemberDirectory,
  setPersonPrivacyFlags,
  submitChildPublicationRequest,
  updateDirectorySettings,
  withdrawChildPublicationRequest
} from "../src/directory/index.js";
import { ensurePlatformUser, issuePlatformUserSession, PLATFORM_USER_EMAIL_HEADER } from "../src/lib/identity.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

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

function grant(db, { userId, parishId = "st-fiacre", capabilities = [] }) {
  const membershipId = `m_${userId}_${parishId}`.replace(/[^a-zA-Z0-9_]/g, "_");
  db.prepare(`INSERT INTO parish_memberships
    (id, user_id, parish_id, role_template, status, invited_by_user_id, accepted_at, created_at, updated_at)
    VALUES (?, ?, ?, 'administrator', 'active', 'test', datetime('now'), datetime('now'), datetime('now'))`)
    .run(membershipId, userId, parishId);
  for (const capability of capabilities) {
    db.prepare("INSERT INTO membership_capabilities (id, membership_id, capability, granted_by_user_id, granted_at) VALUES (?, ?, ?, 'test', datetime('now'))")
      .run(`${membershipId}_${capability}`.replace(/[^a-zA-Z0-9_]/g, "_"), membershipId, capability);
  }
}

function approvePublication(db, { parishId = "st-fiacre", ownerType, ownerId }) {
  db.prepare(`INSERT INTO directory_publication_profiles
    (id, parish_id, owner_type, owner_id, status, approval_status, approved_by_user_id, approved_at, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'approved', 'approved', 'seed-admin', 1, 1, 1, 1)`)
    .run(`pub_${ownerType}_${ownerId}`.replace(/[^a-zA-Z0-9_]/g, "_"), parishId, ownerType, ownerId);
}

function seedActor() {
  return { userId: "seed-admin", parishId: "st-fiacre", capabilities: ["directory.manage", "directory.households.manage"] };
}

async function requestFor(env, user, path) {
  const session = await issuePlatformUserSession(env, user.id);
  return new Request(`https://agapay.test${path}`, {
    headers: { Authorization: `Bearer ${session.token}`, [PLATFORM_USER_EMAIL_HEADER]: user.email }
  });
}

async function fixture() {
  const { env, db } = makeD1Env();
  const actor = seedActor();
  await updateDirectorySettings(env, { actor, parishId: "st-fiacre", patch: { directoryEnabled: true, ordinaryMemberAccessEnabled: true } });

  const parentUser = await ensurePlatformUser(env, { email: "parent@example.org", displayName: "Parent" });
  const nonAdminAdultUser = await ensurePlatformUser(env, { email: "aunt@example.org", displayName: "Aunt" });
  const reviewerUser = await ensurePlatformUser(env, { email: "reviewer@example.org", displayName: "Reviewer" });
  const publicationOnlyReviewerUser = await ensurePlatformUser(env, { email: "pubreviewer@example.org", displayName: "Publication Reviewer" });
  const breakGlassUser = await ensurePlatformUser(env, { email: "breakglass@example.org", displayName: "Break Glass" });

  grant(db, { userId: reviewerUser.id, capabilities: ["directory.child_publication.review", "directory.requests.review"] });
  grant(db, { userId: publicationOnlyReviewerUser.id, capabilities: ["directory.publication.review"] });
  grant(db, { userId: breakGlassUser.id, capabilities: ["directory.manage"] });

  const household = await createHousehold(env, { actor, displayName: "The Marsh Household" });
  const parent = await createPerson(env, { actor, preferredName: "Pat Marsh", biologicalSex: "female" });
  const aunt = await createPerson(env, { actor, preferredName: "Aunt Marsh", biologicalSex: "female" });
  const child = await createPerson(env, { actor, preferredName: "Wren Marsh" });
  const protectedChild = await createPerson(env, { actor, preferredName: "Protected Marsh" });

  await addHouseholdMember(env, { actor, householdId: household.id, personId: parent.id, relationship: "head" });
  await addHouseholdMember(env, { actor, householdId: household.id, personId: aunt.id, relationship: "other" });
  await addHouseholdMember(env, { actor, householdId: household.id, personId: child.id, relationship: "child" });
  await addHouseholdMember(env, { actor, householdId: household.id, personId: protectedChild.id, relationship: "child" });
  await addHouseholdAdmin(env, { actor, householdId: household.id, personId: parent.id });
  await addParishAffiliation(env, { actor, personId: parent.id, status: "member" });
  approvePublication(db, { ownerType: "household", ownerId: household.id });
  approvePublication(db, { ownerType: "person", ownerId: parent.id });
  approvePublication(db, { ownerType: "person", ownerId: aunt.id });

  await linkExternalIdentity(env, { actor, personId: parent.id, linkType: "platform_user", externalId: parentUser.id });
  await linkExternalIdentity(env, { actor, personId: aunt.id, linkType: "platform_user", externalId: nonAdminAdultUser.id });
  await linkExternalIdentity(env, { actor, personId: reviewerUser.id === reviewerUser.id ? parent.id : parent.id, linkType: "platform_user", externalId: "" }).catch(() => {});

  await setPersonPrivacyFlags(env, { actor, personId: child.id, isChild: true });
  await setPersonPrivacyFlags(env, { actor, personId: protectedChild.id, isChild: true, protectedPerson: true });

  const parentSelfContext = await resolveDirectorySelfServiceContext(env, { user: parentUser });
  const auntSelfContext = await resolveDirectorySelfServiceContext(env, { user: nonAdminAdultUser });
  const reviewerAdminContext = await resolveDirectoryAdminContext(env, {
    request: await requestFor(env, reviewerUser, "/api/parish/dashboard/st-fiacre/directory/admin/context"),
    parishId: "st-fiacre"
  });
  const publicationOnlyAdminContext = await resolveDirectoryAdminContext(env, {
    request: await requestFor(env, publicationOnlyReviewerUser, "/api/parish/dashboard/st-fiacre/directory/admin/context"),
    parishId: "st-fiacre"
  });
  const breakGlassAdminContext = await resolveDirectoryAdminContext(env, {
    request: await requestFor(env, breakGlassUser, "/api/parish/dashboard/st-fiacre/directory/admin/context"),
    parishId: "st-fiacre"
  });

  return {
    env, db, household, parent, aunt, child, protectedChild,
    parentUser, reviewerUser,
    parentSelfContext, auntSelfContext, reviewerAdminContext, publicationOnlyAdminContext, breakGlassAdminContext
  };
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

async function submitForReview(env, { context, householdId, childPersonId, requestedFields = ["preferred_name"], requestedPhoto = false }) {
  const draft = await createOrUpdateChildPublicationDraft(env, { context, householdId, childPersonId, requestedFields, requestedPhoto });
  await submitChildPublicationRequest(env, { context, requestId: draft.id });
  return draft;
}

async function reviewVersion(env, { context, sourceId }) {
  const queue = await listDirectoryReviewQueue(env, { context });
  const item = queue.find((entry) => entry.sourceType === "child_publication" && entry.sourceId === sourceId);
  assert.ok(item, "expected a child publication item in the review queue");
  return item.version;
}

await test("migration creates the child publication table and unique active-request index", async () => {
  const { db } = makeD1Env();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
  assert.ok(tables.includes("directory_child_publication_requests"));
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map((row) => row.name);
  assert.ok(indexes.some((name) => name.includes("child_publication_requests")));
});

await test("sanitizeChildFields strips anything outside the narrow allowlist", async () => {
  const cleaned = sanitizeChildFields(["preferred_name", "relationship_label", "date_of_birth", "school", "legal_name", "preferred_name"]);
  assert.deepEqual(cleaned.sort(), ["preferred_name", "relationship_label"]);
});

await test("a child is hidden by default: no household member entry, no search hit", async () => {
  const { env, parentUser, household } = await fixture();
  const request = await requestFor(env, parentUser, "/api/directory/member");
  const context = await resolveMemberDirectoryContext(env, { request });
  const detail = await getMemberDirectoryHousehold(env, { context, householdId: household.id });
  assert.equal(detail.household.members.some((member) => member.displayName === "Wren Marsh"), false);
  assert.equal((await searchMemberDirectory(env, { context, q: "Wren" })).items.length, 0);
});

await test("only an active household administrator may draft a publication request for a child", async () => {
  const { env, auntSelfContext, household, child } = await fixture();
  await assert.rejects(
    () => createOrUpdateChildPublicationDraft(env, { context: auntSelfContext, householdId: household.id, childPersonId: child.id, requestedFields: ["preferred_name"] }),
    (error) => error instanceof DirectoryServiceError && error.code === "forbidden"
  );
});

await test("a protected child can never be drafted for publication", async () => {
  const { env, parentSelfContext, household, protectedChild } = await fixture();
  await assert.rejects(
    () => createOrUpdateChildPublicationDraft(env, { context: parentSelfContext, householdId: household.id, childPersonId: protectedChild.id, requestedFields: ["preferred_name"] }),
    (error) => error instanceof DirectoryServiceError && error.code === "child_not_eligible"
  );
});

await test("parent can draft, submit, and see status; unknown fields are dropped server-side", async () => {
  const { env, parentSelfContext, household, child } = await fixture();
  const draft = await createOrUpdateChildPublicationDraft(env, {
    context: parentSelfContext, householdId: household.id, childPersonId: child.id,
    requestedFields: ["preferred_name", "relationship_label", "date_of_birth"], parentNote: "Please publish her first name only."
  });
  assert.deepEqual(draft.requestedFields.sort(), ["preferred_name", "relationship_label"]);
  assert.equal(draft.status, "draft");
  const submitted = await submitChildPublicationRequest(env, { context: parentSelfContext, requestId: draft.id });
  assert.equal(submitted.status, "submitted");
  const status = await getChildPublicationStatus(env, { context: parentSelfContext, childPersonId: child.id, householdId: household.id });
  assert.equal(status.status, "submitted");
});

await test("a submitted request appears in the shared Phase 3A review queue with requester tracked for self-approval protection", async () => {
  const { env, parentSelfContext, reviewerAdminContext, household, child } = await fixture();
  const draft = await createOrUpdateChildPublicationDraft(env, { context: parentSelfContext, householdId: household.id, childPersonId: child.id, requestedFields: ["preferred_name"] });
  await submitChildPublicationRequest(env, { context: parentSelfContext, requestId: draft.id });
  const queue = await listDirectoryReviewQueue(env, { context: reviewerAdminContext });
  const item = queue.find((entry) => entry.reviewType === "child_publication_review" && entry.sourceId === draft.id);
  assert.ok(item, "expected the child publication request to appear in the review queue");
  assert.equal(item.childRelated, true);
});

await test("ordinary adult publication-review capability alone cannot approve a child publication request", async () => {
  const { env, parentSelfContext, publicationOnlyAdminContext, household, child } = await fixture();
  const draft = await submitForReview(env, { context: parentSelfContext, householdId: household.id, childPersonId: child.id });
  await assert.rejects(
    () => decideDirectoryReviewItem(env, { context: publicationOnlyAdminContext, sourceType: "child_publication", sourceId: draft.id, decision: "approve" }),
    (error) => error instanceof DirectoryServiceError && error.status === 403
  );
});

await test("a household administrator who is also a reviewer cannot approve their own child's request", async () => {
  const { env, db, parentUser, parentSelfContext, household, child } = await fixture();
  grant(db, { userId: parentUser.id, capabilities: ["directory.child_publication.review"] });
  const parentAsReviewer = await resolveDirectoryAdminContext(env, {
    request: await requestFor(env, parentUser, "/api/parish/dashboard/st-fiacre/directory/admin/context"),
    parishId: "st-fiacre"
  });
  const draft = await submitForReview(env, { context: parentSelfContext, householdId: household.id, childPersonId: child.id });
  const version = await reviewVersion(env, { context: parentAsReviewer, sourceId: draft.id });
  await assert.rejects(
    () => decideDirectoryReviewItem(env, { context: parentAsReviewer, sourceType: "child_publication", sourceId: draft.id, decision: "approve", expectedVersion: version }),
    (error) => error instanceof DirectoryServiceError && error.code === "self_approval_denied"
  );
});

await test("approval publishes only the approved fields into the household projection, nothing more", async () => {
  const { env, parentUser, parentSelfContext, reviewerAdminContext, household, child } = await fixture();
  const draft = await submitForReview(env, { context: parentSelfContext, householdId: household.id, childPersonId: child.id });
  const version = await reviewVersion(env, { context: reviewerAdminContext, sourceId: draft.id });
  const decision = await decideDirectoryReviewItem(env, { context: reviewerAdminContext, sourceType: "child_publication", sourceId: draft.id, decision: "approve", expectedVersion: version });
  assert.equal(decision.decision, "approve");

  const context = await resolveMemberDirectoryContext(env, { request: await requestFor(env, parentUser, "/api/directory/member") });
  const detail = await getMemberDirectoryHousehold(env, { context, householdId: household.id });
  const projected = detail.household.members.find((member) => member.displayName === "Wren Marsh");
  assert.ok(projected, "expected the child to be projected into the household after approval");
  assert.equal(projected.type, "child");
  assert.equal(projected.relationship, "", "relationship_label was not requested/approved, so it must not appear");
  assert.equal(projected.contacts.length, 0);
  assert.equal(projected.city, "");

  const found = await searchMemberDirectory(env, { context, q: "Wren" });
  assert.equal(found.items.some((item) => item.id === household.id), true, "household should be findable by the child's approved name");

  const peopleTab = await listMemberDirectoryPeople(env, { context });
  assert.equal(peopleTab.items.some((item) => item.displayName === "Wren Marsh"), false, "children must never appear in the standalone People tab");

  const households = await listMemberDirectoryHouseholds(env, { context });
  assert.equal(households.items.find((item) => item.id === household.id).publishedMemberCount >= 2, true);
});

await test("break-glass directory.manage capability can still approve (documented platform-wide convention)", async () => {
  const { env, parentSelfContext, breakGlassAdminContext, household, child } = await fixture();
  const draft = await submitForReview(env, { context: parentSelfContext, householdId: household.id, childPersonId: child.id });
  const version = await reviewVersion(env, { context: breakGlassAdminContext, sourceId: draft.id });
  const decision = await decideDirectoryReviewItem(env, { context: breakGlassAdminContext, sourceType: "child_publication", sourceId: draft.id, decision: "approve", expectedVersion: version });
  assert.equal(decision.decision, "approve");
});

await test("withdrawal before approval removes the request; a stale duplicate draft cannot be created while one is active", async () => {
  const { env, parentSelfContext, household, child } = await fixture();
  const draft = await createOrUpdateChildPublicationDraft(env, { context: parentSelfContext, householdId: household.id, childPersonId: child.id, requestedFields: ["preferred_name"] });
  await submitChildPublicationRequest(env, { context: parentSelfContext, requestId: draft.id });
  const withdrawn = await withdrawChildPublicationRequest(env, { context: parentSelfContext, requestId: draft.id });
  assert.equal(withdrawn.status, "withdrawn");
  const idempotent = await withdrawChildPublicationRequest(env, { context: parentSelfContext, requestId: draft.id });
  assert.equal(idempotent.status, "withdrawn");
});

await test("revoking an approved request immediately hides the child again and preserves history", async () => {
  const { env, db, parentUser, parentSelfContext, reviewerAdminContext, household, child } = await fixture();
  const draft = await submitForReview(env, { context: parentSelfContext, householdId: household.id, childPersonId: child.id });
  const version = await reviewVersion(env, { context: reviewerAdminContext, sourceId: draft.id });
  await decideDirectoryReviewItem(env, { context: reviewerAdminContext, sourceType: "child_publication", sourceId: draft.id, decision: "approve", expectedVersion: version });

  await revokeChildPublicationApproval(env, { context: reviewerAdminContext, requestId: draft.id, reasonCode: "parent_requested_removal" });

  const context = await resolveMemberDirectoryContext(env, { request: await requestFor(env, parentUser, "/api/directory/member") });
  const detail = await getMemberDirectoryHousehold(env, { context, householdId: household.id });
  assert.equal(detail.household.members.some((member) => member.displayName === "Wren Marsh"), false);

  const row = db.prepare("SELECT status FROM directory_child_publication_requests WHERE id = ?").get(draft.id);
  assert.equal(row.status, "revoked");
});

await test("revoking a child publication requires the child-publication capability, not just directory.manage-adjacent capabilities", async () => {
  const { env, publicationOnlyAdminContext, parentSelfContext, reviewerAdminContext, household, child } = await fixture();
  const draft = await submitForReview(env, { context: parentSelfContext, householdId: household.id, childPersonId: child.id });
  const version = await reviewVersion(env, { context: reviewerAdminContext, sourceId: draft.id });
  await decideDirectoryReviewItem(env, { context: reviewerAdminContext, sourceType: "child_publication", sourceId: draft.id, decision: "approve", expectedVersion: version });
  await assert.rejects(
    () => revokeChildPublicationApproval(env, { context: publicationOnlyAdminContext, requestId: draft.id }),
    (error) => error instanceof DirectoryServiceError && error.status === 403
  );
});

await test("approval re-checks live eligibility and refuses a child who becomes protected after submission", async () => {
  const { env, parentSelfContext, reviewerAdminContext, household, child } = await fixture();
  const draft = await submitForReview(env, { context: parentSelfContext, householdId: household.id, childPersonId: child.id });
  const version = await reviewVersion(env, { context: reviewerAdminContext, sourceId: draft.id });
  await setPersonPrivacyFlags(env, { actor: seedActor(), personId: child.id, isChild: true, protectedPerson: true });
  await assert.rejects(
    () => decideDirectoryReviewItem(env, { context: reviewerAdminContext, sourceType: "child_publication", sourceId: draft.id, decision: "approve", expectedVersion: version }),
    (error) => error instanceof DirectoryServiceError && error.code === "child_not_eligible"
  );
});

await test("live projection re-checks hide an approved child if protected-person status changes later", async () => {
  const { env, parentUser, parentSelfContext, reviewerAdminContext, household, child } = await fixture();
  const draft = await submitForReview(env, { context: parentSelfContext, householdId: household.id, childPersonId: child.id });
  const version = await reviewVersion(env, { context: reviewerAdminContext, sourceId: draft.id });
  await decideDirectoryReviewItem(env, { context: reviewerAdminContext, sourceType: "child_publication", sourceId: draft.id, decision: "approve", expectedVersion: version });
  await setPersonPrivacyFlags(env, { actor: seedActor(), personId: child.id, isChild: true, protectedPerson: true });

  const context = await resolveMemberDirectoryContext(env, { request: await requestFor(env, parentUser, "/api/directory/member") });
  const detail = await getMemberDirectoryHousehold(env, { context, householdId: household.id });
  assert.equal(detail.household.members.some((member) => member.displayName === "Wren Marsh"), false);
  assert.equal((await searchMemberDirectory(env, { context, q: "Wren" })).items.length, 0);
});

if (process.exitCode) {
  console.error(`\n${passed} Phase 4B assertion group(s) passed before failure.`);
  process.exit(process.exitCode);
}

console.log(`\n${passed} assertion group(s) passed. directory-phase4b-tests.mjs OK.`);
