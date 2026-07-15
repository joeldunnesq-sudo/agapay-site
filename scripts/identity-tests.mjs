// scripts/identity-tests.mjs
//
// Exercises the real Accounting Package 0.75C/0.75D identity/membership/
// authorization modules (src/lib/identity.js, src/lib/memberships.js,
// src/lib/authorization.js, src/handlers/identity.js) against a D1-shaped
// SQLite database, using node:sqlite -- same technique as
// scripts/settlement-profiles-tests.mjs, zero extra dependencies.
//
// Run directly: node scripts/identity-tests.mjs

import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  ensurePlatformUser,
  setPlatformUserPassword,
  verifyPlatformUserPassword,
  issuePlatformUserSession,
  revokePlatformUserSession,
  requirePlatformUser,
  findPlatformUserByEmail
} from "../src/lib/identity.js";
import {
  createInvitation,
  acceptInvitation,
  revokeInvitation,
  getMembership,
  listMembershipsForUser,
  setMembershipStatus,
  grantCapability,
  revokeCapability,
  listCapabilitiesForMembership
} from "../src/lib/memberships.js";
import {
  resolveAuthorizationContext,
  hasCapability,
  hasPlatformCapability,
  requireCapability,
  requireActiveMembership,
  currentUser,
  currentMembership,
  authorize,
  expandRoleTemplate,
  isKnownCapability,
  sanitizeGrantableCapabilities,
  CAPABILITY_CATALOG,
  ROLE_TEMPLATES
} from "../src/lib/authorization.js";
import { handleMembershipInvitationCreate } from "../src/handlers/identity.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeD1Env() {
  const db = new DatabaseSync(":memory:");

  // Minimal prerequisite schema this domain's code actually touches:
  // registrations (legacy-bearer bootstrapping path in identity.js's
  // requireMembershipManagementContext) and audit_log
  // (src/lib/audit-log.js's recordAuditEvent, called throughout
  // memberships.js and authorization.js).
  db.exec(`
    CREATE TABLE registrations (
      reference TEXT PRIMARY KEY, parish_id TEXT, status TEXT NOT NULL DEFAULT 'pending',
      parish_name TEXT, community_type TEXT, stripe_account_id TEXT, stripe_subscription_id TEXT,
      received_at TEXT, updated_at TEXT NOT NULL, data TEXT NOT NULL
    );
  `);

  const auditMigration = readFileSync(path.join(__dirname, "..", "migrations", "0014_audit_log.sql"), "utf8");
  db.exec(auditMigration);

  const identityMigration = readFileSync(path.join(__dirname, "..", "migrations", "0020_platform_identity.sql"), "utf8");
  db.exec(identityMigration);

  function wrap(sql) {
    return {
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

  const AGAPAY_DB = { prepare: (sql) => wrap(sql), _raw: db };
  return { env: { AGAPAY_DB }, db };
}

function authenticatedRequest({ email, token, url = "https://agapay.test/api/identity/session", init = {} }) {
  return new Request(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      "X-AGAPAY-User-Email": email || "",
      "Authorization": token ? `Bearer ${token}` : ""
    }
  });
}

async function seedActiveMember(env, { parishId, email, capabilities = [], roleTemplate = "" }) {
  const invitation = await createInvitation(env, { parishId, email, roleTemplate, capabilities });
  const result = await acceptInvitation(env, { token: invitation.token, password: `${email} password 123` });
  const session = await issuePlatformUserSession(env, result.userId);
  return { ...result, token: session.token, email };
}

function auditRows(db, action, targetId = null) {
  if (targetId) {
    return db.prepare(`SELECT * FROM audit_log WHERE action = ? AND target_id = ?`).all(action, targetId);
  }
  return db.prepare(`SELECT * FROM audit_log WHERE action = ?`).all(action);
}

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// ── Platform user identity ──────────────────────────────────────────────

await test("ensurePlatformUser is idempotent by email", async () => {
  const { env } = makeD1Env();
  const first = await ensurePlatformUser(env, { email: "Treasurer@StFiacre.org", displayName: "Joel" });
  const second = await ensurePlatformUser(env, { email: "treasurer@stfiacre.org" });
  assert.equal(first.id, second.id, "expected the same platform_users row for the same (normalized) email");
});

await test("password set/verify round-trip; wrong password rejected", async () => {
  const { env } = makeD1Env();
  const user = await ensurePlatformUser(env, { email: "bookkeeper@example.org" });
  await setPlatformUserPassword(env, user.id, "correct horse battery staple");
  const ok = await verifyPlatformUserPassword(env, "bookkeeper@example.org", "correct horse battery staple");
  assert.ok(ok, "expected correct password to verify");
  const bad = await verifyPlatformUserPassword(env, "bookkeeper@example.org", "wrong password");
  assert.equal(bad, null, "expected wrong password to be rejected");
});

await test("session issuance, resolution, and expiry", async () => {
  const { env, db } = makeD1Env();
  const user = await ensurePlatformUser(env, { email: "session@example.org" });
  const session = await issuePlatformUserSession(env, user.id);
  assert.ok(session.token, "expected a session token");

  const resolved = await requirePlatformUser(authenticatedRequest({ email: "session@example.org", token: session.token }), env);
  assert.ok(resolved, "expected a valid session to resolve to the platform user");
  assert.equal(resolved.id, user.id);

  const wrongToken = await requirePlatformUser(authenticatedRequest({ email: "session@example.org", token: "not-the-real-token" }), env);
  assert.equal(wrongToken, null, "expected an invalid token to be rejected");

  db.prepare(`UPDATE platform_users SET session_expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?`).run(user.id);
  const expired = await requirePlatformUser(authenticatedRequest({ email: "session@example.org", token: session.token }), env);
  assert.equal(expired, null, "expected an expired session to be rejected");

  await issuePlatformUserSession(env, user.id);
  await revokePlatformUserSession(env, user.id);
  const revoked = await requirePlatformUser(authenticatedRequest({ email: "session@example.org", token: session.token }), env);
  assert.equal(revoked, null, "expected a revoked session to be rejected");
});

// ── Invitation + membership lifecycle ───────────────────────────────────

await test("invitation acceptance creates an active membership with role-template capabilities", async () => {
  const { env } = makeD1Env();
  const invitation = await createInvitation(env, {
    parishId: "st-fiacre",
    email: "new-treasurer@example.org",
    roleTemplate: "treasurer"
  });
  assert.ok(invitation.token, "expected an invitation token");

  const result = await acceptInvitation(env, { token: invitation.token, password: "a real password 123" });
  assert.ok(result.ok, `expected acceptance to succeed: ${result.error || ""}`);

  const user = await findPlatformUserByEmail(env, "new-treasurer@example.org");
  assert.ok(user, "expected a platform user to exist after acceptance");

  const membership = await getMembership(env, { userId: user.id, parishId: "st-fiacre" });
  assert.equal(membership.status, "active", "expected the membership to be active after acceptance");

  const capabilities = await listCapabilitiesForMembership(env, membership.id);
  assert.ok(capabilities.includes("ap.approve"), "expected treasurer template capabilities to be granted");
  assert.ok(capabilities.includes("accounting.post"));
  assert.ok(!capabilities.includes("parish.roles.assign"), "treasurer template should not include rector-only capabilities");
});

await test("an accepted invitation cannot be reused", async () => {
  const { env } = makeD1Env();
  const invitation = await createInvitation(env, { parishId: "st-fiacre", email: "once@example.org", roleTemplate: "volunteer" });
  const first = await acceptInvitation(env, { token: invitation.token, password: "first acceptance pw" });
  assert.ok(first.ok);
  const second = await acceptInvitation(env, { token: invitation.token, password: "second attempt pw" });
  assert.equal(second.ok, false, "expected a second acceptance of the same token to fail");
});

await test("a revoked invitation cannot be accepted", async () => {
  const { env } = makeD1Env();
  const invitation = await createInvitation(env, { parishId: "st-fiacre", email: "revoked@example.org", roleTemplate: "volunteer" });
  await revokeInvitation(env, { invitationId: invitation.id });
  const result = await acceptInvitation(env, { token: invitation.token, password: "irrelevant password" });
  assert.equal(result.ok, false, "expected a revoked invitation to be unacceptable");
});

await test("an expired invitation cannot be accepted", async () => {
  const { env, db } = makeD1Env();
  const invitation = await createInvitation(env, { parishId: "st-fiacre", email: "expired@example.org", roleTemplate: "volunteer" });
  db.prepare(`UPDATE membership_invitations SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?`).run(invitation.id);
  const result = await acceptInvitation(env, { token: invitation.token, password: "irrelevant password" });
  assert.equal(result.ok, false, "expected an expired invitation to be unacceptable");
});

// ── Multiple memberships / multiple parishes ────────────────────────────

await test("one user can hold independent memberships at multiple parishes", async () => {
  const { env } = makeD1Env();
  const invitationA = await createInvitation(env, { parishId: "parish-a", email: "multi@example.org", roleTemplate: "bookkeeper" });
  await acceptInvitation(env, { token: invitationA.token, password: "password one two three" });

  const user = await findPlatformUserByEmail(env, "multi@example.org");
  // A DIFFERENT person (an administrator at parish-b) does the inviting --
  // a user inviting their own email is a self-escalation attempt, covered
  // by its own dedicated test below, not a legitimate multi-parish flow.
  const adminAtParishB = await seedActiveMember(env, {
    parishId: "parish-b",
    email: "admin-b@example.org",
    roleTemplate: "administrator"
  });
  const invitationB = await createInvitation(env, {
    parishId: "parish-b",
    email: "multi@example.org",
    roleTemplate: "council_member",
    invitedByUserId: adminAtParishB.userId
  });
  assert.ok(invitationB.ok, "expected the invitation to be created (administrator holds parish.roles.assign)");
  await acceptInvitation(env, { token: invitationB.token, password: "password one two three" });

  const memberships = await listMembershipsForUser(env, user.id);
  assert.equal(memberships.length, 2, "expected two independent memberships for one user");
  assert.deepEqual(memberships.map((m) => m.parishId).sort(), ["parish-a", "parish-b"]);

  const capsA = await hasCapability(env, { userId: user.id, parishId: "parish-a", capability: "ap.enter" });
  const capsB = await hasCapability(env, { userId: user.id, parishId: "parish-b", capability: "ap.enter" });
  assert.equal(capsA, true, "expected parish-a membership's bookkeeper capabilities");
  assert.equal(capsB, false, "expected parish-b membership (council_member) to lack bookkeeper capabilities");
});

// ── Capability boundary and denial tests (docs/accounting/02d "Required tests") ──

await test("capability-boundary: has X, lacks Y", async () => {
  const { env } = makeD1Env();
  const invitation = await createInvitation(env, {
    parishId: "boundary-parish",
    email: "approver-only@example.org",
    capabilities: ["ap.approve"] // explicit, NOT ap.enter
  });
  const result = await acceptInvitation(env, { token: invitation.token, password: "boundary test password" });
  const canApprove = await hasCapability(env, { userId: result.userId, parishId: "boundary-parish", capability: "ap.approve" });
  const canEnter = await hasCapability(env, { userId: result.userId, parishId: "boundary-parish", capability: "ap.enter" });
  assert.equal(canApprove, true, "expected the granted capability to succeed");
  assert.equal(canEnter, false, "expected an ungranted capability to be denied");
});

await test("cross-parish denial: a membership at Parish A is rejected against Parish B", async () => {
  const { env } = makeD1Env();
  const invitation = await createInvitation(env, {
    parishId: "parish-a",
    email: "cross-parish@example.org",
    capabilities: ["accounting.view", "ap.approve"]
  });
  const result = await acceptInvitation(env, { token: invitation.token, password: "cross parish password" });

  const { membership: membershipA } = await resolveAuthorizationContext(env, { userId: result.userId, parishId: "parish-a" });
  const { membership: membershipB } = await resolveAuthorizationContext(env, { userId: result.userId, parishId: "parish-b" });
  assert.ok(membershipA, "expected a resolved membership for parish-a");
  assert.equal(membershipB, null, "expected no membership at all to resolve for parish-b -- must fail closed, not fall back to parish-a's grants");

  const deniedAtB = await hasCapability(env, { userId: result.userId, parishId: "parish-b", capability: "ap.approve" });
  assert.equal(deniedAtB, false, "expected Parish A's capability to never authorize an action at Parish B");
});

await test("revoked-membership denial takes effect immediately, not just on session expiry", async () => {
  const { env } = makeD1Env();
  const invitation = await createInvitation(env, {
    parishId: "revoke-parish",
    email: "revoke-me@example.org",
    capabilities: ["accounting.post"]
  });
  const result = await acceptInvitation(env, { token: invitation.token, password: "revoke test password" });

  const before = await hasCapability(env, { userId: result.userId, parishId: "revoke-parish", capability: "accounting.post" });
  assert.equal(before, true, "expected the capability to be present before revocation");

  await setMembershipStatus(env, { membershipId: result.membershipId, status: "revoked", reason: "test" });

  const after = await hasCapability(env, { userId: result.userId, parishId: "revoke-parish", capability: "accounting.post" });
  assert.equal(after, false, "expected the capability check to fail on the very next evaluation after revocation, without any session change");
});

await test("suspended membership is denied the same as revoked", async () => {
  const { env } = makeD1Env();
  const invitation = await createInvitation(env, { parishId: "suspend-parish", email: "suspend-me@example.org", capabilities: ["accounting.reports"] });
  const result = await acceptInvitation(env, { token: invitation.token, password: "suspend test password" });
  await setMembershipStatus(env, { membershipId: result.membershipId, status: "suspended" });
  const denied = await hasCapability(env, { userId: result.userId, parishId: "suspend-parish", capability: "accounting.reports" });
  assert.equal(denied, false, "expected a suspended membership to be denied exactly like a revoked one");
});

await test("an invited (not yet accepted) membership grants nothing -- inactive membership denial", async () => {
  const { env, db } = makeD1Env();
  // Directly seed an 'invited' membership row without going through
  // acceptance, to exercise the raw status !== 'active' deny path.
  const user = await ensurePlatformUser(env, { email: "invited-only@example.org" });
  db.prepare(`
    INSERT INTO parish_memberships (id, user_id, parish_id, role_template, status, created_at, updated_at)
    VALUES ('mem_invited_only', ?, 'invited-parish', 'volunteer', 'invited', datetime('now'), datetime('now'))
  `).run(user.id);
  db.prepare(`INSERT INTO membership_capabilities (id, membership_id, capability, granted_at) VALUES ('cap_x', 'mem_invited_only', 'parish.view', datetime('now'))`).run();

  const denied = await hasCapability(env, { userId: user.id, parishId: "invited-parish", capability: "parish.view" });
  assert.equal(denied, false, "expected an 'invited' (never-accepted) membership to grant nothing, identical to no membership at all");
});

// ── Unknown / unrecognized capability handling (deny-by-default) ───────

await test("unknown capability strings are always denied and never persisted", async () => {
  const { env } = makeD1Env();
  assert.equal(isKnownCapability("totally.made.up"), false);
  assert.deepEqual(sanitizeGrantableCapabilities(["accounting.view", "totally.made.up", "ap.enter"]), ["accounting.view", "ap.enter"]);

  const invitation = await createInvitation(env, {
    parishId: "unknown-cap-parish",
    email: "unknown-cap@example.org",
    capabilities: ["accounting.view", "not.a.real.capability"]
  });
  const result = await acceptInvitation(env, { token: invitation.token, password: "unknown cap password" });
  const capabilities = await listCapabilitiesForMembership(env, result.membershipId);
  assert.deepEqual(capabilities, ["accounting.view"], "expected the unrecognized capability string to never reach membership_capabilities");

  const deniedUnknown = await hasCapability(env, { userId: result.userId, parishId: "unknown-cap-parish", capability: "not.a.real.capability" });
  assert.equal(deniedUnknown, false, "expected a check against an unknown capability to simply be denied, not throw or misbehave");
});

// ── Platform capabilities: fail closed, no grant mechanism exists yet ──

await test("platform capabilities are never grantable through a parish membership and always deny", async () => {
  const { env } = makeD1Env();
  assert.deepEqual(ROLE_TEMPLATES.platform_admin, [], "platform_admin template is reserved, intentionally empty");
  assert.deepEqual(ROLE_TEMPLATES.support, [], "support template is reserved, intentionally empty");

  // Even an explicit attempt to grant a platform.* capability via the
  // invitation path is stripped before it is ever persisted.
  const invitation = await createInvitation(env, {
    parishId: "platform-cap-parish",
    email: "platform-attempt@example.org",
    capabilities: ["parish.view", "platform.admin"]
  });
  const result = await acceptInvitation(env, { token: invitation.token, password: "platform cap password" });
  const capabilities = await listCapabilitiesForMembership(env, result.membershipId);
  assert.ok(!capabilities.includes("platform.admin"), "expected platform.admin to never be persisted via the parish-membership path");

  const denied = await hasPlatformCapability(env, { userId: result.userId, capability: "platform.admin" });
  assert.equal(denied, false, "expected hasPlatformCapability to always deny -- no elevation workflow exists yet");
});

// ── Self-escalation protection (Package 0.75D) ──────────────────────────

await test("a user cannot invite their own email address (self-invitation denied)", async () => {
  const { env, db } = makeD1Env();
  const admin = await seedActiveMember(env, { parishId: "self-invite-parish", email: "self-inviter@example.org", roleTemplate: "administrator" });
  const invitation = await createInvitation(env, {
    parishId: "self-invite-parish",
    email: "self-inviter@example.org", // same email as the inviter
    roleTemplate: "rector",
    invitedByUserId: admin.userId
  });
  assert.equal(invitation.ok, false, "expected self-invitation to be rejected outright");
  assert.equal(invitation.code, "self_invitation");
  assert.equal(auditRows(db, "membership.self_escalation_denied").length, 1, "expected a self-escalation audit event");
});

await test("a member cannot grant a capability they don't hold themselves, even with parish.members.invite", async () => {
  const { env, db } = makeD1Env();
  // Secretary role: parish.view, parish.members.invite, donations.view,
  // donor.statements -- explicitly does NOT include accounting.post or
  // parish.roles.assign.
  const secretary = await seedActiveMember(env, { parishId: "escalation-parish", email: "secretary@example.org", roleTemplate: "secretary" });

  const escalationAttempt = await createInvitation(env, {
    parishId: "escalation-parish",
    email: "new-person@example.org",
    capabilities: ["accounting.post"], // secretary does not hold this
    invitedByUserId: secretary.userId
  });
  assert.equal(escalationAttempt.ok, false, "expected an attempt to grant an ungranted capability to be rejected");
  assert.equal(escalationAttempt.code, "capability_escalation");
  assert.equal(auditRows(db, "membership.capability_escalation_denied").length, 1);

  // The same secretary CAN invite someone to a capability they DO hold.
  const legitimate = await createInvitation(env, {
    parishId: "escalation-parish",
    email: "new-person@example.org",
    capabilities: ["donations.view"],
    invitedByUserId: secretary.userId
  });
  assert.ok(legitimate.ok, "expected an invitation for a capability the inviter already holds to succeed");
});

await test("a holder of parish.roles.assign may grant any catalog capability, not just their own", async () => {
  const { env } = makeD1Env();
  // Administrator holds parish.roles.assign but not, e.g., accounting.post.
  const admin = await seedActiveMember(env, { parishId: "assign-parish", email: "role-assigner@example.org", roleTemplate: "administrator" });
  const adminCapabilities = await listCapabilitiesForMembership(env, admin.membershipId);
  assert.ok(!adminCapabilities.includes("accounting.post"), "sanity check: administrator template should not itself include accounting.post");

  const invitation = await createInvitation(env, {
    parishId: "assign-parish",
    email: "new-treasurer@example.org",
    capabilities: ["accounting.post"],
    invitedByUserId: admin.userId
  });
  assert.ok(invitation.ok, "expected parish.roles.assign to authorize granting a capability the granter doesn't personally hold");
});

await test("a user cannot grant, revoke, or change status on their own membership", async () => {
  const { env, db } = makeD1Env();
  const member = await seedActiveMember(env, { parishId: "self-mutate-parish", email: "self-mutate@example.org", roleTemplate: "administrator" });

  const grantResult = await grantCapability(env, { membershipId: member.membershipId, capability: "parish.settings.manage", grantedByUserId: member.userId });
  assert.equal(grantResult, false, "expected a self-targeted capability grant to be refused");

  const revokeResult = await revokeCapability(env, { membershipId: member.membershipId, capability: "parish.manage", revokedByUserId: member.userId });
  assert.equal(revokeResult, false, "expected a self-targeted capability revoke to be refused");

  const statusResult = await setMembershipStatus(env, { membershipId: member.membershipId, status: "suspended", actorUserId: member.userId });
  assert.equal(statusResult, false, "expected a self-targeted status change to be refused");

  assert.equal(auditRows(db, "membership.self_escalation_denied").length, 3, "expected all three self-targeted mutation attempts to be audited");

  // Membership is unaffected -- still active with its original capabilities.
  const membership = await getMembership(env, { userId: member.userId, parishId: "self-mutate-parish" });
  assert.equal(membership.status, "active");
});

await test("a different, authorized actor CAN grant/revoke/change status on someone else's membership", async () => {
  const { env } = makeD1Env();
  const admin = await seedActiveMember(env, { parishId: "other-mutate-parish", email: "admin2@example.org", roleTemplate: "administrator" });
  const member = await seedActiveMember(env, { parishId: "other-mutate-parish", email: "member2@example.org", roleTemplate: "volunteer" });

  const granted = await grantCapability(env, { membershipId: member.membershipId, capability: "parish.view", grantedByUserId: admin.userId });
  assert.equal(granted, true, "expected a non-self-targeted grant by a different actor to succeed");

  const suspended = await setMembershipStatus(env, { membershipId: member.membershipId, status: "suspended", actorUserId: admin.userId, reason: "policy" });
  assert.equal(suspended, true, "expected a non-self-targeted status change by a different actor to succeed");
});

// ── Shared legacy bearer token exclusion ────────────────────────────────

await test("requireCapability never authorizes from a legacy parish bearer token alone", async () => {
  const { env } = makeD1Env();
  const legacyShapedRequest = new Request("https://agapay.test/api/parish/dashboard/some-parish/journals", {
    headers: { Authorization: "Bearer some-legacy-parish-dashboard-token" }
  });
  const ctx = await requireCapability(legacyShapedRequest, env, "some-parish", "accounting.post");
  assert.equal(ctx, null, "expected a request with only a legacy-shaped bearer token to be denied");
});

await test("requireActiveMembership rejects an unauthenticated request", async () => {
  const { env } = makeD1Env();
  const anonymous = new Request("https://agapay.test/api/identity/session");
  const ctx = await requireActiveMembership(anonymous, env, "any-parish");
  assert.equal(ctx, null);
});

// ── Developer API surface (Package 0.75D) ───────────────────────────────

await test("currentUser/currentMembership/authorize are working aliases over the same authorization logic", async () => {
  const { env } = makeD1Env();
  const member = await seedActiveMember(env, { parishId: "alias-parish", email: "alias-user@example.org", capabilities: ["parish.view"] });
  const request = authenticatedRequest({ email: "alias-user@example.org", token: member.token });

  const user = await currentUser(request, env);
  assert.ok(user, "expected currentUser to resolve the authenticated platform user");
  assert.equal(user.id, member.userId);

  const membershipCtx = await currentMembership(request, env, "alias-parish");
  assert.ok(membershipCtx, "expected currentMembership to resolve an active membership");
  assert.equal(membershipCtx.membership.id, member.membershipId);

  const authorized = await authorize(request, env, { parishId: "alias-parish", capability: "parish.view" });
  assert.ok(authorized, "expected authorize() to succeed for a held capability");

  const denied = await authorize(request, env, { parishId: "alias-parish", capability: "parish.manage" });
  assert.equal(denied, null, "expected authorize() to deny an unheld capability");
});

// ── Route protection (handler-level) ────────────────────────────────────

await test("route protection: invitation-create route denies a request without parish.members.invite", async () => {
  const { env } = makeD1Env();
  db_registerParish(env, "route-parish");
  const bystander = await seedActiveMember(env, { parishId: "route-parish", email: "bystander@example.org", capabilities: ["parish.view"] });

  const request = authenticatedRequest({
    email: "bystander@example.org",
    token: bystander.token,
    url: "https://agapay.test/api/parish/dashboard/route-parish/memberships/invitations",
    init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "someone@example.org" }) }
  });
  const response = await handleMembershipInvitationCreate(request, env, "route-parish");
  assert.equal(response.status, 401, "expected the route to reject a caller lacking parish.members.invite");
});

await test("route protection: invitation-create route succeeds for a caller holding parish.members.invite", async () => {
  const { env } = makeD1Env();
  db_registerParish(env, "route-parish-2");
  const secretary = await seedActiveMember(env, { parishId: "route-parish-2", email: "secretary2@example.org", roleTemplate: "secretary" });

  const request = authenticatedRequest({
    email: "secretary2@example.org",
    token: secretary.token,
    url: "https://agapay.test/api/parish/dashboard/route-parish-2/memberships/invitations",
    init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "invitee@example.org", roleTemplate: "volunteer" }) }
  });
  const response = await handleMembershipInvitationCreate(request, env, "route-parish-2");
  assert.equal(response.status, 200, "expected the route to accept a caller holding parish.members.invite");
  const body = await response.json();
  assert.ok(body.token, "expected the route to return an invitation token");
});

function db_registerParish(env, parishId) {
  env.AGAPAY_DB._raw.prepare(`
    INSERT INTO registrations (reference, parish_id, status, parish_name, updated_at, data)
    VALUES (?, ?, 'verified', ?, datetime('now'), ?)
  `).run(`ref_${parishId}`, parishId, parishId, JSON.stringify({ parishId, parishDashboardToken: "legacy-token-not-used-in-this-test" }));
}

// ── Audit trail generation ──────────────────────────────────────────────

await test("membership lifecycle actions generate central audit_log rows", async () => {
  const { env, db } = makeD1Env();
  const admin = await seedActiveMember(env, { parishId: "audit-parish", email: "admin-audit@example.org", roleTemplate: "administrator" });

  const invitation = await createInvitation(env, { parishId: "audit-parish", email: "audited@example.org" });
  assert.equal(auditRows(db, "membership.invitation_created").length, 2, "one from seedActiveMember's own invitation, one from this test's invitation");

  const result = await acceptInvitation(env, { token: invitation.token, password: "audit test password" });
  assert.equal(auditRows(db, "membership.invitation_accepted").length, 2);

  await grantCapability(env, { membershipId: result.membershipId, capability: "parish.view", grantedByUserId: admin.userId });
  assert.equal(auditRows(db, "membership.capability_granted", result.membershipId).length, 1);

  await revokeCapability(env, { membershipId: result.membershipId, capability: "parish.view", revokedByUserId: admin.userId });
  assert.equal(auditRows(db, "membership.capability_revoked", result.membershipId).length, 1);

  await setMembershipStatus(env, { membershipId: result.membershipId, status: "suspended", actorUserId: admin.userId, reason: "quarterly review" });
  const statusRows = auditRows(db, "membership.status_changed");
  assert.equal(statusRows.length, 1);
  assert.equal(statusRows[0].reason, "quarterly review");
  assert.equal(statusRows[0].organization_id, "audit-parish");
  const after = JSON.parse(statusRows[0].after_summary_json);
  assert.equal(after.status, "suspended");
});

await test("a denied capability check against an authenticated member is audited", async () => {
  const { env, db } = makeD1Env();
  const member = await seedActiveMember(env, { parishId: "denial-audit-parish", email: "denied-user@example.org", capabilities: ["parish.view"] });
  const request = authenticatedRequest({ email: "denied-user@example.org", token: member.token });

  const ctx = await requireCapability(request, env, "denial-audit-parish", "accounting.post");
  assert.equal(ctx, null);

  const rows = auditRows(db, "authorization.capability_denied");
  assert.equal(rows.length, 1);
  const metadata = JSON.parse(rows[0].metadata_json);
  assert.equal(metadata.capabilityRequested, "accounting.post");
  assert.equal(metadata.decision, "denied");
  assert.equal(rows[0].organization_id, "denial-audit-parish");
});

// ── Role assignment / capability catalog integrity ──────────────────────

await test("capability catalog and role templates only reference known capability strings", async () => {
  for (const [role, caps] of Object.entries(ROLE_TEMPLATES)) {
    for (const cap of caps) {
      assert.ok(CAPABILITY_CATALOG.includes(cap), `role template "${role}" references unknown capability "${cap}"`);
    }
  }
});

await test("role inheritance: expandRoleTemplate returns exactly a role's declared capability set", async () => {
  assert.deepEqual(expandRoleTemplate("volunteer"), ["parish.view"]);
  assert.deepEqual(expandRoleTemplate("not-a-real-role"), [], "expected an unrecognized role template to expand to zero capabilities, not throw");
});

console.log(`\n${passed} test(s) passed.`);
if (process.exitCode) {
  console.error("Some identity/membership tests FAILED.");
} else {
  console.log("All identity/membership tests passed.");
}
