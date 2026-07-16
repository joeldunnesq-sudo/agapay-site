// scripts/directory-invitations-tests.mjs
//
// Phase 1C-1 focused test suite for src/directory/invitations.js.
// Follows the existing repository pattern (see scripts/tax-exemption-tests.mjs):
// real migrations applied to a real, in-process, throwaway SQLite database
// via node:sqlite, with a thin D1-shaped shim over it. No network calls,
// no production credentials, no mocked assertions.

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

function readMigration(name) {
  return readFileSync(path.join(repoRoot, "migrations", name), "utf8");
}

function makeD1Env() {
  const db = new DatabaseSync(":memory:");

  db.exec(readMigration("0014_audit_log.sql"));
  db.exec(readMigration("0022_directory_canonical_foundation.sql"));
  db.exec(readMigration("0023_directory_contact_privacy_publication.sql"));
  db.exec(readMigration("0024_directory_invitations_claims.sql"));

  function wrap(sql) {
    return {
      _sql: sql,
      _params: [],
      bind(...params) { this._params = params; return this; },
      async first() {
        const row = db.prepare(sql).get(...this._params);
        return row === undefined ? null : row;
      },
      async all() {
        const rows = db.prepare(sql).all(...this._params);
        return { results: rows, success: true };
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
        for (const stmt of statements) {
          const info = db.prepare(stmt._sql).run(...stmt._params);
          results.push({ success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } });
        }
        db.exec("COMMIT");
        return results;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    }
  };
  return { env: { AGAPAY_DB }, db };
}

function seedPersonAndHousehold(db, { parishId = "parish_a" } = {}) {
  const now = Date.now();
  const personId = "person_1";
  const householdId = "household_1";
  db.prepare(
    `INSERT INTO directory_people (id, preferred_name, active, deceased, created_by_parish_id, created_at, updated_at)
     VALUES (?, 'Maria Papadopoulos', 1, 0, ?, ?, ?)`
  ).run(personId, parishId, now, now);
  db.prepare(
    `INSERT INTO directory_households (id, display_name, parish_id, active, created_at, updated_at)
     VALUES (?, 'Papadopoulos Household', ?, 1, ?, ?)`
  ).run(householdId, parishId, now, now);
  db.prepare(
    `INSERT INTO directory_household_members (id, household_id, person_id, relationship, active, created_at, updated_at)
     VALUES ('mem_1', ?, ?, 'head', 1, ?, ?)`
  ).run(householdId, personId, now, now);
  return { personId, householdId };
}

function actorFor(parishId, capabilities) {
  return { userId: "user_admin_1", parishId, capabilities };
}

let passCount = 0;
function pass(label) {
  passCount += 1;
  console.log(`PASS - ${label}`);
}

const { createDirectoryInvitation, resendDirectoryInvitation, revokeDirectoryInvitation,
  inspectDirectoryInvitationByToken, expireStaleDirectoryInvitations, listParishDirectoryInvitations,
  buildAcceptInvitationStatement, buildCompleteInvitationStatement, DIRECTORY_INVITATION_CAPABILITIES }
  = await import("../src/directory/invitations.js");

// --- Test 1: create a person-claim invitation; raw token not stored ---
{
  const { env, db } = makeD1Env();
  const { personId } = seedPersonAndHousehold(db);
  const actor = actorFor("parish_a", [DIRECTORY_INVITATION_CAPABILITIES.invitationsManage]);

  const { invitation, rawToken } = await createDirectoryInvitation(env, {
    actor, parishId: "parish_a", invitationType: "person_claim",
    intendedPersonId: personId, intendedAuthority: "link_person",
    recipientEmail: "maria@example.org"
  });

  assert.equal(invitation.status, "pending");
  assert.ok(rawToken && rawToken.length >= 32);
  assert.ok(!("tokenHash" in invitation) && !("token_hash" in invitation), "DTO must not leak token hash");

  const row = db.prepare("SELECT token_hash FROM directory_invitations WHERE id = ?").get(invitation.id);
  assert.notEqual(row.token_hash, rawToken, "raw token must never be stored, even accidentally as the hash column value");
  assert.equal(row.token_hash.length, 64, "token_hash should be a 64-char hex SHA-256 digest");
  pass("person_claim invitation created; raw token returned once, only hash persisted");
}

// --- Test 2: household_admin invitation requires active membership ---
{
  const { env, db } = makeD1Env();
  const { personId, householdId } = seedPersonAndHousehold(db);
  const actor = actorFor("parish_a", [DIRECTORY_INVITATION_CAPABILITIES.invitationsManage]);

  const { invitation } = await createDirectoryInvitation(env, {
    actor, parishId: "parish_a", invitationType: "household_admin",
    intendedPersonId: personId, intendedHouseholdId: householdId,
    intendedAuthority: "grant_household_admin"
  });
  assert.equal(invitation.invitationType, "household_admin");
  pass("household_admin invitation created for an active household member");

  // now try a person who is NOT a member of the household
  db.prepare(`INSERT INTO directory_people (id, preferred_name, active, deceased, created_by_parish_id, created_at, updated_at)
              VALUES ('person_stranger', 'Not A Member', 1, 0, 'parish_a', ?, ?)`).run(Date.now(), Date.now());
  await assert.rejects(
    () => createDirectoryInvitation(env, {
      actor, parishId: "parish_a", invitationType: "household_admin",
      intendedPersonId: "person_stranger", intendedHouseholdId: householdId,
      intendedAuthority: "grant_household_admin"
    }),
    /not an active member/,
    "household_admin invitation must reject a person who is not an active member of the household"
  );
  pass("household_admin invitation rejects a non-member person");
}

// --- Test 3: cross-parish target denied ---
{
  const { env, db } = makeD1Env();
  const { personId } = seedPersonAndHousehold(db, { parishId: "parish_a" });
  const actor = actorFor("parish_b", [DIRECTORY_INVITATION_CAPABILITIES.invitationsManage]);

  await assert.rejects(
    () => createDirectoryInvitation(env, {
      actor, parishId: "parish_b", invitationType: "person_claim",
      intendedPersonId: personId, intendedAuthority: "link_person"
    }),
    (err) => err.status === 404 || err.status === 403,
    "Parish B actor must not be able to invite a claim for Parish A's person"
  );
  pass("cross-parish invitation target denied");
}

// --- Test 4: unauthorized (missing capability) denied ---
{
  const { env, db } = makeD1Env();
  const { personId } = seedPersonAndHousehold(db);
  const actor = actorFor("parish_a", []); // no capabilities

  await assert.rejects(
    () => createDirectoryInvitation(env, {
      actor, parishId: "parish_a", invitationType: "person_claim",
      intendedPersonId: personId, intendedAuthority: "link_person"
    }),
    (err) => err.code === "forbidden" && err.status === 403,
    "actor without directory.invitations.manage must be denied"
  );
  pass("invitation creation denied without directory.invitations.manage capability");
}

// --- Test 5: duplicate active invitation for same person+type rejected ---
{
  const { env, db } = makeD1Env();
  const { personId } = seedPersonAndHousehold(db);
  const actor = actorFor("parish_a", [DIRECTORY_INVITATION_CAPABILITIES.invitationsManage]);

  await createDirectoryInvitation(env, {
    actor, parishId: "parish_a", invitationType: "person_claim",
    intendedPersonId: personId, intendedAuthority: "link_person"
  });
  await assert.rejects(
    () => createDirectoryInvitation(env, {
      actor, parishId: "parish_a", invitationType: "person_claim",
      intendedPersonId: personId, intendedAuthority: "link_person"
    }),
    /already exists/,
    "a second active invitation of the same type for the same person must be rejected"
  );
  pass("duplicate active invitation for same person+type rejected");
}

// --- Test 6: resend rotates token; old token stops working ---
{
  const { env, db } = makeD1Env();
  const { personId } = seedPersonAndHousehold(db);
  const actor = actorFor("parish_a", [DIRECTORY_INVITATION_CAPABILITIES.invitationsManage]);

  const created = await createDirectoryInvitation(env, {
    actor, parishId: "parish_a", invitationType: "person_claim",
    intendedPersonId: personId, intendedAuthority: "link_person"
  });
  const oldToken = created.rawToken;

  const resent = await resendDirectoryInvitation(env, { actor, parishId: "parish_a", invitationId: created.invitation.id });
  assert.notEqual(resent.rawToken, oldToken, "resend must issue a new token");
  assert.equal(resent.invitation.status, "sent");
  assert.equal(resent.invitation.resendCount, 1);

  const foundWithOld = await inspectDirectoryInvitationByToken(env, oldToken);
  assert.equal(foundWithOld, null, "old token must no longer resolve to the invitation after resend");

  const foundWithNew = await inspectDirectoryInvitationByToken(env, resent.rawToken);
  assert.ok(foundWithNew, "new token must resolve to the invitation");
  pass("resend rotates token; old token invalidated, new token works");
}

// --- Test 7: revoked invitation cannot be inspected/accepted ---
{
  const { env, db } = makeD1Env();
  const { personId } = seedPersonAndHousehold(db);
  const actor = actorFor("parish_a", [DIRECTORY_INVITATION_CAPABILITIES.invitationsManage]);

  const created = await createDirectoryInvitation(env, {
    actor, parishId: "parish_a", invitationType: "person_claim",
    intendedPersonId: personId, intendedAuthority: "link_person"
  });
  await revokeDirectoryInvitation(env, { actor, parishId: "parish_a", invitationId: created.invitation.id });

  const found = await inspectDirectoryInvitationByToken(env, created.rawToken);
  assert.equal(found, null, "revoked invitation must not be inspectable by token");

  await assert.rejects(
    () => revokeDirectoryInvitation(env, { actor, parishId: "parish_a", invitationId: created.invitation.id }),
    /cannot move from "revoked"/,
    "revoking an already-revoked invitation must fail (illegal transition)"
  );
  pass("revoked invitation rejected from inspection and cannot be re-revoked");
}

// --- Test 8: expiration sweep ---
{
  const { env, db } = makeD1Env();
  const { personId } = seedPersonAndHousehold(db);
  const actor = actorFor("parish_a", [DIRECTORY_INVITATION_CAPABILITIES.invitationsManage]);

  const created = await createDirectoryInvitation(env, {
    actor, parishId: "parish_a", invitationType: "person_claim",
    intendedPersonId: personId, intendedAuthority: "link_person"
  });
  // createDirectoryInvitation enforces a minimum 1-hour TTL floor as a
  // safety guard against an accidental zero/near-zero ttlMs creating a
  // dead-on-arrival invitation in production -- so to test expiration we
  // simulate time passage directly, the same way a real clock would move
  // past a real expiry, rather than fighting that floor.
  db.prepare("UPDATE directory_invitations SET expires_at = ? WHERE id = ?").run(Date.now() - 1000, created.invitation.id);

  const { expiredCount } = await expireStaleDirectoryInvitations(env, { parishId: "parish_a" });
  assert.equal(expiredCount, 1);

  const found = await inspectDirectoryInvitationByToken(env, created.rawToken);
  assert.equal(found, null, "expired invitation must not be inspectable by token");
  pass("expiration sweep expires stale invitations; expired token no longer resolves");
}

// --- Test 9: malformed / unknown token returns null, not an error (no enumeration) ---
{
  const { env } = makeD1Env();
  const found = await inspectDirectoryInvitationByToken(env, "not-a-real-token-at-all");
  assert.equal(found, null);
  const foundEmpty = await inspectDirectoryInvitationByToken(env, "");
  assert.equal(foundEmpty, null);
  pass("unknown/malformed token returns null uniformly (no enumeration signal)");
}

// --- Test 10: statement builders enforce legal transitions ---
{
  assert.throws(
    () => buildAcceptInvitationStatement({ invitationId: "x", currentStatus: "completed" }),
    /cannot move from "completed"/
  );
  const acceptStmt = buildAcceptInvitationStatement({ invitationId: "x", currentStatus: "sent" });
  assert.ok(acceptStmt.sql.includes("accepted"));

  // buildCompleteInvitationStatement's contract assumes "accepted" as the
  // fromStatus and must NOT throw in that case:
  const completeStmt = buildCompleteInvitationStatement({ invitationId: "x" });
  assert.ok(completeStmt.sql.includes("completed"));
  pass("invitation statement builders enforce the central legal-transition table");
}

// --- Test 11: list invitations is parish-scoped ---
{
  const { env, db } = makeD1Env();
  const { personId } = seedPersonAndHousehold(db, { parishId: "parish_a" });
  const actorA = actorFor("parish_a", [DIRECTORY_INVITATION_CAPABILITIES.invitationsManage]);
  await createDirectoryInvitation(env, {
    actor: actorA, parishId: "parish_a", invitationType: "person_claim",
    intendedPersonId: personId, intendedAuthority: "link_person"
  });

  const listA = await listParishDirectoryInvitations(env, { actor: actorA, parishId: "parish_a" });
  assert.equal(listA.length, 1);

  const actorB = actorFor("parish_b", [DIRECTORY_INVITATION_CAPABILITIES.invitationsManage]);
  await assert.rejects(
    () => listParishDirectoryInvitations(env, { actor: actorB, parishId: "parish_a" }),
    (err) => err.status === 403,
    "Parish B actor must not be able to list Parish A's invitations"
  );
  pass("invitation listing is parish-scoped; cross-parish listing denied");
}

console.log(`\n${passCount} assertions passed. directory-invitations-tests.mjs OK.`);
