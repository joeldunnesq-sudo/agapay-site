import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  claimHouseholdShareInvitation,
  createHouseholdShareInvitation,
  inspectHouseholdShareInvitation
} from "../src/directory/household-share-invitations.js";
import { DirectoryServiceError } from "../src/directory/foundation.js";
import { decideDirectoryReviewItem } from "../src/directory/admin.js";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = (name) => readFileSync(path.join(repoRoot, "migrations", name), "utf8");

function makeEnv() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
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
    "0084_directory_household_share_invitations.sql"
  ]) db.exec(migration(name));
  db.exec(`CREATE TABLE directory_household_verifications (
    household_id TEXT PRIMARY KEY, parish_id TEXT NOT NULL,
    verification_status TEXT NOT NULL, updated_at INTEGER NOT NULL
  )`);

  function wrap(sql) {
    return {
      params: [],
      bind(...params) { this.params = params; return this; },
      async first() { return db.prepare(sql).get(...this.params) ?? null; },
      async all() { return { results: db.prepare(sql).all(...this.params), success: true }; },
      async run() {
        const result = db.prepare(sql).run(...this.params);
        return { success: true, meta: { changes: result.changes } };
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

function seed() {
  const { env, db } = makeEnv();
  const now = Date.now();
  db.prepare("INSERT INTO platform_users (id,email,display_name,status,created_at,updated_at) VALUES (?,?,?,?,?,?)")
    .run("user_inviter", "anna@example.org", "Anna", "active", now, now);
  db.prepare("INSERT INTO platform_users (id,email,display_name,status,created_at,updated_at) VALUES (?,?,?,?,?,?)")
    .run("user_claimant", "john@example.org", "John", "active", now, now);
  for (const [id, name] of [["person_inviter", "Anna"], ["person_target", "John"]]) {
    db.prepare("INSERT INTO directory_people (id,created_by_parish_id,preferred_name,created_at,updated_at) VALUES (?,?,?,?,?)")
      .run(id, "parish_1", name, now, now);
  }
  db.prepare("INSERT INTO directory_households (id,parish_id,display_name,created_at,updated_at) VALUES (?,?,?,?,?)")
    .run("household_1", "parish_1", "The Dunn Household", now, now);
  db.prepare("INSERT INTO directory_household_members (id,household_id,person_id,relationship,created_at,updated_at) VALUES (?,?,?,?,?,?)")
    .run("member_inviter", "household_1", "person_inviter", "head", now, now);
  db.prepare("INSERT INTO directory_household_members (id,household_id,person_id,relationship,created_at,updated_at) VALUES (?,?,?,?,?,?)")
    .run("member_target", "household_1", "person_target", "spouse", now, now);
  db.prepare("INSERT INTO directory_household_admins (id,household_id,person_id,created_at,updated_at) VALUES (?,?,?,?,?)")
    .run("admin_inviter", "household_1", "person_inviter", now, now);
  db.prepare("INSERT INTO directory_person_links (id,person_id,link_type,external_id,source,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .run("link_inviter", "person_inviter", "platform_user", "user_inviter", "manual", 1, now, now);
  db.prepare("INSERT INTO directory_household_verifications (household_id,parish_id,verification_status,updated_at) VALUES (?,?,?,?)")
    .run("household_1", "parish_1", "current", now);
  const inviterContext = {
    user: { id: "user_inviter" },
    currentPerson: { id: "person_inviter" },
    manageableHouseholds: [{ id: "household_1", parishId: "parish_1" }]
  };
  const claimantContext = { user: { id: "user_claimant" }, currentPerson: null, manageableHouseholds: [] };
  return { env, db, inviterContext, claimantContext };
}

async function invitationFixture() {
  const fixture = seed();
  const invitation = await createHouseholdShareInvitation(fixture.env, {
    context: fixture.inviterContext,
    householdId: "household_1",
    personId: "person_target"
  });
  const token = new URL(`https://agapay.test${invitation.sharePath}`).searchParams.get("token");
  return { ...fixture, invitation, token };
}

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS - ${name}`);
  } catch (error) {
    console.error(`FAIL - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

await test("stores only a token digest and advertises a 14-day review link", async () => {
  const { db, invitation, token } = await invitationFixture();
  const row = db.prepare("SELECT * FROM directory_household_invitations WHERE id = ?").get(invitation.id);
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.notEqual(row.token, token);
  assert.ok(Math.abs(Date.parse(row.expires_at) - Date.parse(row.created_at) - 14 * 86400000) < 1000);
  assert.match(invitation.sharePath, /^\/myagapay\/join-household\?token=/);
});

await test("claim creates one review proposal and changes no association or verification state", async () => {
  const { env, db, claimantContext, token } = await invitationFixture();
  const beforeMemberships = db.prepare("SELECT COUNT(*) count FROM directory_household_members").get().count;
  const beforeLinks = db.prepare("SELECT COUNT(*) count FROM directory_person_links").get().count;
  const beforeVerification = db.prepare("SELECT * FROM directory_household_verifications WHERE household_id = 'household_1'").get();
  const result = await claimHouseholdShareInvitation(env, { context: claimantContext, token });
  const request = db.prepare("SELECT * FROM directory_change_requests WHERE id = ?").get(result.requestId);
  assert.equal(request.request_type, "household_membership_add");
  assert.equal(request.status, "pending");
  assert.equal(request.requester_user_id, "user_inviter", "inviter remains requester so existing self-approval protection applies");
  assert.equal(db.prepare("SELECT COUNT(*) count FROM directory_household_members").get().count, beforeMemberships);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM directory_person_links").get().count, beforeLinks);
  assert.deepEqual(db.prepare("SELECT * FROM directory_household_verifications WHERE household_id = 'household_1'").get(), beforeVerification);
  assert.equal(db.prepare("SELECT status FROM directory_household_invitations").get().status, "claimed");
});

await test("link is single-use and an already claimed token gives a clear error", async () => {
  const { env, db, claimantContext, token } = await invitationFixture();
  await claimHouseholdShareInvitation(env, { context: claimantContext, token });
  await assert.rejects(
    claimHouseholdShareInvitation(env, { context: claimantContext, token }),
    (error) => error instanceof DirectoryServiceError && error.code === "invitation_already_claimed" && error.status === 409
  );
  assert.equal(db.prepare("SELECT COUNT(*) count FROM directory_change_requests").get().count, 1);
});

await test("inviting donor cannot approve the spouse proposal they initiated", async () => {
  const { env, claimantContext, token, inviterContext } = await invitationFixture();
  const result = await claimHouseholdShareInvitation(env, { context: claimantContext, token });
  const reviewerContext = {
    user: { id: inviterContext.user.id },
    parishId: "parish_1",
    personId: "person_inviter",
    capabilities: ["directory.memberships.review"],
    permissions: { canAssign: false, canManageProtected: false }
  };
  await assert.rejects(
    decideDirectoryReviewItem(env, {
      context: reviewerContext,
      sourceType: "change_request",
      sourceId: result.requestId,
      decision: "approve"
    }),
    (error) => error.code === "self_approval_denied" && error.status === 403
  );
});

await test("expired token is rejected and durably marked expired", async () => {
  const { env, db, token } = await invitationFixture();
  db.prepare("UPDATE directory_household_invitations SET expires_at = ?").run(new Date(Date.now() - 60000).toISOString());
  await assert.rejects(
    inspectHouseholdShareInvitation(env, { token }),
    (error) => error.code === "invitation_expired" && error.status === 410
  );
  assert.equal(db.prepare("SELECT status FROM directory_household_invitations").get().status, "expired");
});

await test("different-household claimant is distinctly flagged and cannot silently resolve on approval", async () => {
  const { env, db, claimantContext, token } = await invitationFixture();
  const now = Date.now();
  db.prepare("INSERT INTO directory_people (id,created_by_parish_id,preferred_name,created_at,updated_at) VALUES (?,?,?,?,?)")
    .run("person_existing", "parish_1", "Existing Claimant", now, now);
  db.prepare("INSERT INTO directory_households (id,parish_id,display_name,created_at,updated_at) VALUES (?,?,?,?,?)")
    .run("household_other", "parish_1", "Other Household", now, now);
  db.prepare("INSERT INTO directory_household_members (id,household_id,person_id,relationship,created_at,updated_at) VALUES (?,?,?,?,?,?)")
    .run("member_existing", "household_other", "person_existing", "head", now, now);
  db.prepare("INSERT INTO directory_person_links (id,person_id,link_type,external_id,source,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .run("link_existing", "person_existing", "platform_user", "user_claimant", "manual", 1, now, now);
  claimantContext.currentPerson = { id: "person_existing" };
  const result = await claimHouseholdShareInvitation(env, { context: claimantContext, token });
  const request = db.prepare("SELECT * FROM directory_change_requests WHERE id = ?").get(result.requestId);
  const payload = JSON.parse(request.requested_payload_json);
  assert.equal(result.conflictFlagged, true);
  assert.match(request.summary, /^CONFLICT:/);
  assert.equal(payload.shareToLink.existingHouseholdConflict, true);
  assert.match(payload.shareToLink.conflictMessage, /staff must resolve identity/i);
  assert.throws(() => db.prepare("UPDATE directory_change_requests SET status = 'completed' WHERE id = ?").run(result.requestId), /already linked to another directory person/);
  assert.equal(db.prepare("SELECT status FROM directory_change_requests WHERE id = ?").get(result.requestId).status, "pending");
});

await test("approved proposal projects the identity link only after review completes", async () => {
  const { env, db, claimantContext, token } = await invitationFixture();
  const result = await claimHouseholdShareInvitation(env, { context: claimantContext, token });
  assert.equal(db.prepare("SELECT COUNT(*) count FROM directory_person_links WHERE external_id = 'user_claimant'").get().count, 0);
  db.prepare("UPDATE directory_change_requests SET status = 'completed' WHERE id = ?").run(result.requestId);
  const link = db.prepare("SELECT * FROM directory_person_links WHERE external_id = 'user_claimant'").get();
  assert.equal(link.person_id, "person_target");
  assert.equal(link.source, "household_share_review");
});

await test("donor and recipient UI explain proposal-only behavior and expose the exact route", async () => {
  const directoryPage = readFileSync(path.join(repoRoot, "public", "myagapay", "directory.html"), "utf8");
  const joinPage = readFileSync(path.join(repoRoot, "public", "myagapay", "join-household.html"), "utf8");
  const worker = readFileSync(path.join(repoRoot, "src", "worker.js"), "utf8");
  assert.match(directoryPage, /data-share-household-member/);
  assert.match(directoryPage, /it does not connect the account automatically/i);
  assert.match(joinPage, /Submit for parish review/);
  assert.match(joinPage, /never connects an account automatically and never verifies a household/i);
  assert.match(worker, /\["\/myagapay\/join-household", "\/myagapay\/join-household\.html"\]/);
});

if (!process.exitCode) console.log(`Directory household share invitation checks passed (${passed}).`);
