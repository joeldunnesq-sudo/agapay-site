// AGAPAY Accounting Package 0.75C/0.75D -- Centralized Authorization.
//
// This module is the SINGLE entry point for turning "who is making this
// request" into "are they allowed to do this." Every future accounting
// route calls requireCapability()/hasCapability() -- never a role-name
// string comparison scattered through a handler, per
// docs/accounting/01-accounting-philosophy.md Section 23 and
// docs/accounting/02d-identity-and-capability-model.md.
//
// Capabilities are data (rows in membership_capabilities), never a fixed
// enum baked into code -- CAPABILITY_CATALOG below is the platform's
// documented, stable public contract (docs/accounting/08-capability-model.md),
// not a closed set enforced by a database constraint; adding a new
// capability string is an additive, no-migration change. What IS enforced
// (Package 0.75D) is that nothing in this codebase may grant, via the
// invitation/membership pathway, a capability string outside this catalog --
// see assertKnownCapabilities().
//
// Hard rule (docs/accounting/02d "Transition strategy"): this module NEVER
// accepts the legacy shared parish-dashboard bearer token as authorization.
// It only resolves authorization from a platform-user session + an active
// parish_memberships row. A caller holding a valid parish bearer token but
// no platform-user session gets nothing from this module, by construction
// -- there is no code path here that even looks at that token.
//
// Deny-by-default (Package 0.75D): every resolution path in this module
// returns/denies on the ABSENCE of a satisfied condition, never on an
// explicit "is this bad" check. An unknown capability string, a missing
// membership, an inactive/suspended/revoked membership, an expired or
// invalid session, or a request for a platform capability with no platform
// grant mechanism yet -- every one of these falls through to the same
// `return null` / `return false`, not a distinguishable "special case"
// that a future edit could accidentally loosen.

import { d1, d1First, d1All } from "./core.js";
import { requirePlatformUser } from "./identity.js";
import { recordAuditEvent } from "./audit-log.js";

// ── Capability catalog (docs/accounting/08-capability-model.md) ────────
// Platform-wide, comprehensive, and deliberately broader than accounting
// alone -- every future AGAPAY module (parish administration, commerce,
// stewardship, Learn, and modules not yet built) is meant to authorize
// against this same catalog rather than inventing its own mechanism.
//
// `platform.*` capabilities are NOT grantable through the parish-membership
// mechanism this package builds (see hasPlatformCapability below) --
// they are catalogued now so the vocabulary is stable and future code can
// reference them, but no grant path exists yet, so any check against them
// today fails closed by construction, not by policy that could be
// forgotten. Establishing "future support access" boundaries without
// building the elevation workflow is Package 0.75D's explicit scope.
export const CAPABILITY_CATALOG = Object.freeze([
  // Platform
  "platform.admin",
  "platform.support",
  "platform.audit.view",
  "platform.system",

  // Parish Administration
  "parish.view",
  "parish.manage",
  "parish.members.invite",
  "parish.members.remove",
  "parish.roles.assign",
  "parish.settings.manage",

  // Accounting (foundation only -- no ledger exists yet; these capability
  // strings are reserved for Phase 1's posting engine and later packages)
  "accounting.view",
  "accounting.post",
  "accounting.adjust",
  "accounting.reverse",
  "accounting.close_period",
  "accounting.reopen_period",
  "accounting.reconcile",
  "accounting.reports",
  "accounting.export",
  "accounting.audit",
  "accounting.configure",
  "accounting.accounts.manage",
  "accounting.funds.manage",
  "accounting.periods.manage",
  "accounting.journals.create",
  "accounting.journals.post",
  "accounting.journals.reverse",
  "accounting.opening_balances.manage",

  // Accounts Payable
  "ap.view",
  "ap.enter",
  "ap.approve",
  "ap.pay",
  "ap.void",

  // Banking
  "bank.view",
  "bank.reconcile",
  "bank.manage_accounts",

  // Commerce
  "commerce.manage",
  "commerce.orders",
  "commerce.refunds",
  "commerce.products",

  // Stewardship
  "donations.view",
  "donations.manage",
  "donor.statements",

  // Learn
  "learn.manage",
  "learn.admin",

  // Future Modules
  "marketplace.manage",
  "directory.view",
  "directory.self.manage",
  "directory.households.manage",
  "directory.invitations.manage",
  "directory.claims.review",
  "directory.identity_links.manage",
  "directory.manage",
  "directory.people.manage",
  "directory.requests.review",
  "directory.memberships.review",
  "directory.household_admins.review",
  "directory.corrections.review",
  "directory.protected.manage",
  "directory.duplicates.review",
  "directory.duplicates.merge",
  "directory.notes.view",
  "directory.notes.manage",
  "directory.assignments.manage",
  "directory.publication.review",
  // Phase 4B: deliberately separate from directory.publication.review --
  // a reviewer authorized for ordinary adult/household publication does
  // NOT automatically receive authority over child publication requests.
  // See docs/directory/40-phase-4b-parent-reviewer-authorization.md.
  "directory.child_publication.review",
  "directory.ministries.manage",
  "directory.ministry_interest.review",
  "directory.skills.view",
  "directory.skills.manage",
  "directory.skills.catalog.manage",
  "directory.settings.manage",
  "directory.private_contact.view",
  "directory.audit.view",
  "communications.manage",
  "events.manage"
]);

const CAPABILITY_SET = new Set(CAPABILITY_CATALOG);

// Capabilities reserved for a future platform-level grant mechanism
// (Package 0.75E or later) -- never assignable through a parish
// membership, regardless of role template or explicit grant. Kept as an
// explicit, named set (not inferred from a naming convention alone) so the
// boundary is a data fact, not a string-prefix guess.
const PLATFORM_ONLY_CAPABILITIES = new Set([
  "platform.admin",
  "platform.support",
  "platform.audit.view",
  "platform.system"
]);

export function isKnownCapability(capability) {
  return CAPABILITY_SET.has(capability);
}

// Filters a requested capability list down to catalog-known, non-platform-
// only entries. Used wherever capabilities are about to be persisted
// (invitation creation, direct grants) so an unrecognized or platform-only
// string can never reach membership_capabilities -- deny-by-default applied
// at the write path, not merely at the read/check path.
export function sanitizeGrantableCapabilities(requested) {
  if (!Array.isArray(requested)) return [];
  return requested.filter((cap) => CAPABILITY_SET.has(cap) && !PLATFORM_ONLY_CAPABILITIES.has(cap));
}

// Role templates are a convenience default applied at invitation time --
// never the authorization mechanism itself (docs/accounting/01 Section 23:
// "role names alone are insufficient"). Every capability check in this
// module and every future accounting route tests a capability, never a
// role-template name. Full reasoning per role in
// docs/accounting/09-role-template-reference.md.
//
// `support` and `platform_admin` are intentionally reserved with ZERO
// capabilities here: platform.* capabilities cannot be granted through a
// parish membership (see PLATFORM_ONLY_CAPABILITIES), so these two
// templates exist only to reserve the name for when a real platform-level
// elevation workflow is built -- selecting them today is a documented no-op,
// not a broken promise.
export const ROLE_TEMPLATES = Object.freeze({
  rector: [
    "parish.view", "parish.manage", "parish.members.invite", "parish.members.remove",
    "parish.roles.assign", "parish.settings.manage",
    "accounting.view", "accounting.post", "accounting.adjust", "accounting.reverse",
    "accounting.close_period", "accounting.reopen_period", "accounting.reconcile",
    "accounting.reports", "accounting.export", "accounting.audit",
    "accounting.configure", "accounting.accounts.manage", "accounting.funds.manage",
    "accounting.periods.manage", "accounting.journals.create", "accounting.journals.post",
    "accounting.journals.reverse", "accounting.opening_balances.manage",
    "ap.view", "ap.enter", "ap.approve", "ap.pay", "ap.void",
    "bank.view", "bank.reconcile", "bank.manage_accounts",
    "commerce.manage", "commerce.orders", "commerce.refunds", "commerce.products",
    "donations.view", "donations.manage", "donor.statements"
  ],
  treasurer: [
    "parish.view", "parish.members.invite",
    "accounting.view", "accounting.post", "accounting.adjust", "accounting.reverse",
    "accounting.close_period", "accounting.reconcile", "accounting.reports", "accounting.export",
    "accounting.configure", "accounting.accounts.manage", "accounting.funds.manage",
    "accounting.periods.manage", "accounting.journals.create", "accounting.journals.post",
    "accounting.journals.reverse", "accounting.opening_balances.manage",
    "ap.view", "ap.enter", "ap.approve", "ap.pay", "ap.void",
    "bank.view", "bank.reconcile", "bank.manage_accounts",
    "donations.view", "donations.manage", "donor.statements"
  ],
  bookkeeper: [
    "parish.view",
    "accounting.view", "accounting.post", "accounting.journals.create", "accounting.journals.post",
    "ap.view", "ap.enter",
    "bank.view", "bank.reconcile",
    "donations.view"
  ],
  secretary: [
    "parish.view", "parish.members.invite",
    "donations.view", "donor.statements"
  ],
  council_member: ["parish.view", "accounting.view", "accounting.reports"],
  volunteer: ["parish.view"],
  bookstore_manager: [
    "parish.view", "commerce.manage", "commerce.orders", "commerce.products", "commerce.refunds"
  ],
  reader: ["parish.view"],
  deacon: ["parish.view", "donations.view"],
  priest: ["parish.view", "donations.view", "donor.statements"],
  administrator: [
    "parish.view", "parish.manage", "parish.members.invite", "parish.members.remove",
    "parish.roles.assign", "parish.settings.manage", "accounting.configure"
  ],
  // Reserved -- see comment above. Both intentionally empty.
  support: [],
  platform_admin: []
});

export function expandRoleTemplate(roleTemplate) {
  const template = ROLE_TEMPLATES[roleTemplate];
  return template ? sanitizeGrantableCapabilities(template) : [];
}

// Resolves a user's authorization context for one parish: their active
// membership (or null) and their full, current capability set (explicit
// grants only -- role templates are expanded once, at invitation/grant
// time, into explicit membership_capabilities rows; this function does not
// re-expand a stored role_template label, so a later edit to ROLE_TEMPLATES
// never silently changes an already-granted membership's capabilities).
//
// Deny-by-default: any missing input, missing membership row, or membership
// status other than the literal string 'active' returns the same empty
// result -- 'invited', 'suspended', 'revoked', and "no row at all" are
// indistinguishable to every caller of this function, on purpose.
export async function resolveAuthorizationContext(env, { userId, parishId }) {
  if (!d1(env) || !userId || !parishId) return { membership: null, capabilities: [] };

  const membership = await d1First(
    env,
    "SELECT * FROM parish_memberships WHERE user_id = ?1 AND parish_id = ?2",
    userId,
    parishId
  );

  if (!membership || membership.status !== "active") {
    return { membership: null, capabilities: [] };
  }

  const rows = await d1All(
    env,
    "SELECT capability FROM membership_capabilities WHERE membership_id = ?1",
    membership.id
  );

  return {
    membership: {
      id: membership.id,
      userId: membership.user_id,
      parishId: membership.parish_id,
      roleTemplate: membership.role_template || "",
      status: membership.status
    },
    capabilities: rows.map((row) => row.capability)
  };
}

export async function hasCapability(env, { userId, parishId, capability }) {
  if (!capability) return false;
  const { capabilities } = await resolveAuthorizationContext(env, { userId, parishId });
  return capabilities.includes(capability);
}

// Platform-level capabilities (platform.admin, platform.support,
// platform.audit.view, platform.system) have no grant mechanism yet -- this
// function exists so future code has a stable name to call rather than
// inventing an ad hoc check, and so "platform support without
// authorization: denied" is a real, testable code path today, not merely a
// documentation promise. It always returns false. When a real elevation
// workflow is built (Package 0.75E or later), this is the one function
// that changes; every caller written against it today needs no update.
export async function hasPlatformCapability(_env, { userId: _userId, capability } = {}) {
  void _userId;
  if (!PLATFORM_ONLY_CAPABILITIES.has(capability)) return false;
  return false;
}

function correlationIdFor(request) {
  return request?.headers?.get?.("X-Request-Id") || "";
}

// The primary authorization entry point for a request. Resolves the
// platform-user session (never the legacy parish bearer token -- see
// module header), resolves their membership + capabilities for parishId,
// and returns null unless the specific capability is present on an active
// membership. Mirrors the return-null-on-failure shape of requireDonor/
// requireAdminContext so future route handlers can use the same
// `if (!ctx) return unauthorized()` pattern already idiomatic in this
// codebase.
//
// Package 0.75D: a denial that reaches an authenticated user with a real,
// active membership (i.e. the specific capability was simply absent, not
// "no session"/"no membership at all") is recorded as a central audit
// event -- this is the security-relevant signal (an authenticated actor
// attempted something outside their granted permissions), distinct from
// anonymous/no-session traffic, which is left to the existing rate-limiting
// layer rather than filling the audit log with unauthenticated noise.
export async function requireCapability(request, env, parishId, capability) {
  const user = await requirePlatformUser(request, env);
  if (!user) return null;

  const { membership, capabilities } = await resolveAuthorizationContext(env, {
    userId: user.id,
    parishId
  });

  if (!membership) return null;

  if (!capabilities.includes(capability)) {
    await recordAuditEvent(env, request, {
      action: "authorization.capability_denied",
      actorUserId: user.id,
      actorType: "platform_user",
      targetType: "parish_membership",
      targetId: membership.id,
      organizationId: parishId,
      requestId: correlationIdFor(request),
      metadata: {
        capabilityRequested: capability,
        resource: request?.url || "",
        decision: "denied"
      }
    });
    return null;
  }

  return { user, membership, capabilities };
}

// Resolves just the authenticated platform user + their active membership
// for a parish, without requiring a specific capability -- useful for
// routes that need "any active member of this parish" (e.g. listing one's
// own memberships) rather than a specific capability gate.
export async function requireActiveMembership(request, env, parishId) {
  const user = await requirePlatformUser(request, env);
  if (!user) return null;

  const { membership, capabilities } = await resolveAuthorizationContext(env, {
    userId: user.id,
    parishId
  });
  if (!membership) return null;

  return { user, membership, capabilities };
}

// ── Developer API (Package 0.75D) ───────────────────────────────────────
// The only names a future module should ever need. Every one of these is a
// thin wrapper over the functions above -- no new logic, no new database
// access, so there is exactly one implementation to review, test, and trust.

// currentUser(): resolves the authenticated platform user for a request,
// with no parish or capability context at all. Re-exported here (rather
// than requiring callers to import src/lib/identity.js directly) so a
// future module's only import is this file.
export const currentUser = requirePlatformUser;

// currentMembership(): resolves the caller's active membership (and full
// capability set) for one parish, without requiring a specific capability.
// Identical to requireActiveMembership -- kept as a second exported name
// because "currentMembership" is this package's documented public API
// name; requireActiveMembership remains for source compatibility with
// Package 0.75C code that already calls it.
export const currentMembership = requireActiveMembership;

// authorize(): named-argument convenience wrapper over requireCapability,
// matching this package's documented developer-facing surface.
export async function authorize(request, env, { parishId, capability } = {}) {
  return requireCapability(request, env, parishId, capability);
}
