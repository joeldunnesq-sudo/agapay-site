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
  executeDirectoryDuplicateMerge,
  generateDuplicateCandidates,
  getDirectoryDuplicateCandidate,
  linkExternalIdentity,
  listDirectoryReviewQueue,
  planDirectoryDuplicateMerge,
  decideDirectoryDuplicateCandidate,
  resolveDirectoryAdminContext,
  runDirectoryDuplicateScan
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
    "0029_directory_duplicates_phase3b.sql"
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
}

function seedActor(capabilities = ["directory.manage"]) {
  return { userId: "seed-admin", parishId: "st-fiacre", capabilities };
}

async function fixture() {
  const { env, db } = makeD1Env();
  const user = await ensurePlatformUser(env, { email: "duplicates@example.org", displayName: "Duplicate Reviewer" });
  grant(db, {
    userId: user.id,
    capabilities: [
      "directory.duplicates.review",
      "directory.duplicates.merge",
      "directory.assignments.manage",
      "directory.people.manage",
      "directory.households.manage",
      "directory.private_contact.view",
      "directory.audit.view"
    ]
  });
  const session = await issuePlatformUserSession(env, user.id);
  const request = new Request("https://agapay.app/api/parish/dashboard/st-fiacre/directory/admin/context", {
    headers: { Authorization: `Bearer ${session.token}`, [PLATFORM_USER_EMAIL_HEADER]: user.email }
  });
  const context = await resolveDirectoryAdminContext(env, { request, parishId: "st-fiacre" });
  return { env, db, context };
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

await test("migration creates duplicate candidate, alias, and merge history tables", async () => {
  const { db } = makeD1Env();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
  assert.ok(tables.includes("directory_duplicate_candidates"));
  assert.ok(tables.includes("directory_merge_aliases"));
  assert.ok(tables.includes("directory_merge_events"));
});

await test("person duplicate scan is deterministic, explainable, and queue-integrated", async () => {
  const { env, context } = await fixture();
  const admin = seedActor();
  const left = await createPerson(env, { actor: admin, preferredName: "Anna Dunn" });
  const right = await createPerson(env, { actor: admin, preferredName: "Anna Dunn" });
  await addParishAffiliation(env, { actor: admin, personId: left.id, status: "member" });
  await addParishAffiliation(env, { actor: admin, personId: right.id, status: "member" });
  await createContactMethod(env, { actor: admin, parishId: "st-fiacre", ownerType: "person", ownerId: left.id, contactType: "email", value: "anna@example.org" });
  await createContactMethod(env, { actor: admin, parishId: "st-fiacre", ownerType: "person", ownerId: right.id, contactType: "email", value: "ANNA@example.org" });
  const scan = await runDirectoryDuplicateScan(env, { context, entityType: "person" });
  assert.equal(scan.generatedCount, 1);
  const queue = await listDirectoryReviewQueue(env, { context, filters: { type: "person_duplicate_review" } });
  assert.equal(queue.length, 1);
  assert.equal(queue[0].sourceType, "duplicate_candidate");
  const detail = await getDirectoryDuplicateCandidate(env, { context, candidateId: queue[0].sourceId });
  assert.equal(detail.candidate.signals.some((signal) => signal.code === "PERSON_EMAIL_EXACT"), true);
});

await test("not-duplicate decision suppresses repeated resurfacing without new evidence", async () => {
  const { env, context } = await fixture();
  const admin = seedActor();
  const left = await createPerson(env, { actor: admin, preferredName: "John Smith" });
  const right = await createPerson(env, { actor: admin, preferredName: "John Smith" });
  await addParishAffiliation(env, { actor: admin, personId: left.id, status: "member" });
  await addParishAffiliation(env, { actor: admin, personId: right.id, status: "member" });
  await generateDuplicateCandidates(env, { context, entityType: "person" });
  const queue = await listDirectoryReviewQueue(env, { context, filters: { type: "person_duplicate_review" } });
  const candidate = await getDirectoryDuplicateCandidate(env, { context, candidateId: queue[0].sourceId });
  await decideDirectoryDuplicateCandidate(env, { context, candidateId: candidate.candidate.id, decision: "not_duplicate", reasonCode: "different_people", expectedVersion: candidate.candidate.version });
  await generateDuplicateCandidates(env, { context, entityType: "person" });
  const remaining = await listDirectoryReviewQueue(env, { context, filters: { type: "person_duplicate_review" } });
  assert.equal(remaining.length, 0);
});

await test("identity-link conflict blocks person merge until resolved", async () => {
  const { env, context } = await fixture();
  const admin = seedActor();
  const userA = await ensurePlatformUser(env, { email: "a@example.org" });
  const userB = await ensurePlatformUser(env, { email: "b@example.org" });
  const left = await createPerson(env, { actor: admin, preferredName: "Mary Stone" });
  const right = await createPerson(env, { actor: admin, preferredName: "Mary Stone" });
  await addParishAffiliation(env, { actor: admin, personId: left.id, status: "member" });
  await addParishAffiliation(env, { actor: admin, personId: right.id, status: "member" });
  await linkExternalIdentity(env, { actor: admin, personId: left.id, linkType: "platform_user", externalId: userA.id });
  await linkExternalIdentity(env, { actor: admin, personId: right.id, linkType: "platform_user", externalId: userB.id });
  await generateDuplicateCandidates(env, { context, entityType: "person" });
  const [item] = await listDirectoryReviewQueue(env, { context, filters: { type: "person_duplicate_review" } });
  const detail = await getDirectoryDuplicateCandidate(env, { context, candidateId: item.sourceId });
  await decideDirectoryDuplicateCandidate(env, { context, candidateId: item.sourceId, decision: "confirmed_duplicate", expectedVersion: detail.candidate.version });
  const planned = await planDirectoryDuplicateMerge(env, { context, candidateId: item.sourceId, survivorId: left.id });
  assert.ok(planned.plan.blockers.includes("conflicting_platform_user_links"));
});

await test("controlled person merge deactivates retired record and creates alias/history", async () => {
  const { env, db, context } = await fixture();
  const admin = seedActor();
  const left = await createPerson(env, { actor: admin, preferredName: "Peter Lake" });
  const right = await createPerson(env, { actor: admin, preferredName: "Peter Lake" });
  const household = await createHousehold(env, { actor: admin, displayName: "Lake Household" });
  await addHouseholdMember(env, { actor: admin, householdId: household.id, personId: right.id, relationship: "head" });
  await addParishAffiliation(env, { actor: admin, personId: left.id, status: "member" });
  await addParishAffiliation(env, { actor: admin, personId: right.id, status: "member" });
  await generateDuplicateCandidates(env, { context, entityType: "person" });
  const [item] = await listDirectoryReviewQueue(env, { context, filters: { type: "person_duplicate_review" } });
  let detail = await getDirectoryDuplicateCandidate(env, { context, candidateId: item.sourceId });
  await decideDirectoryDuplicateCandidate(env, { context, candidateId: item.sourceId, decision: "confirmed_duplicate", expectedVersion: detail.candidate.version });
  detail = await getDirectoryDuplicateCandidate(env, { context, candidateId: item.sourceId });
  const planned = await planDirectoryDuplicateMerge(env, { context, candidateId: item.sourceId, survivorId: left.id, expectedVersion: detail.candidate.version });
  assert.deepEqual(planned.plan.blockers, []);
  const ready = await getDirectoryDuplicateCandidate(env, { context, candidateId: item.sourceId });
  const result = await executeDirectoryDuplicateMerge(env, { context, candidateId: item.sourceId, expectedVersion: ready.candidate.version });
  assert.equal(result.survivorId, left.id);
  assert.equal(db.prepare("SELECT active FROM directory_people WHERE id = ?").get(right.id).active, 0);
  assert.equal(db.prepare("SELECT survivor_entity_id FROM directory_merge_aliases WHERE old_entity_id = ?").get(right.id).survivor_entity_id, left.id);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM directory_merge_events WHERE candidate_id = ?").get(item.sourceId).count, 1);
});

await test("household duplicate scan and merge preserve one survivor household", async () => {
  const { env, db, context } = await fixture();
  const admin = seedActor();
  const left = await createHousehold(env, { actor: admin, displayName: "Stone Household" });
  const right = await createHousehold(env, { actor: admin, displayName: "Stone Household" });
  const person = await createPerson(env, { actor: admin, preferredName: "Olivia Stone" });
  await addHouseholdMember(env, { actor: admin, householdId: right.id, personId: person.id, relationship: "head" });
  await generateDuplicateCandidates(env, { context, entityType: "household" });
  const [item] = await listDirectoryReviewQueue(env, { context, filters: { type: "household_duplicate_review" } });
  assert.ok(item);
  let detail = await getDirectoryDuplicateCandidate(env, { context, candidateId: item.sourceId });
  await decideDirectoryDuplicateCandidate(env, { context, candidateId: item.sourceId, decision: "confirmed_duplicate", expectedVersion: detail.candidate.version });
  detail = await getDirectoryDuplicateCandidate(env, { context, candidateId: item.sourceId });
  await planDirectoryDuplicateMerge(env, { context, candidateId: item.sourceId, survivorId: left.id, expectedVersion: detail.candidate.version });
  const ready = await getDirectoryDuplicateCandidate(env, { context, candidateId: item.sourceId });
  await executeDirectoryDuplicateMerge(env, { context, candidateId: item.sourceId, expectedVersion: ready.candidate.version });
  assert.equal(db.prepare("SELECT active FROM directory_households WHERE id = ?").get(right.id).active, 0);
  assert.equal(db.prepare("SELECT household_id FROM directory_household_members WHERE person_id = ? AND active = 1").get(person.id).household_id, left.id);
});

if (process.exitCode) {
  console.error(`\n${passed} Phase 3B assertion group(s) passed before failure.`);
  process.exit(process.exitCode);
}

console.log(`\n${passed} assertion group(s) passed. directory-phase3b-tests.mjs OK.`);
