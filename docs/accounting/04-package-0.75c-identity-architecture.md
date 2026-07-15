# AGAPAY Accounting Package 0.75C — Identity Architecture

Implements the design in `docs/accounting/02d-identity-and-capability-model.md`. This document explains what was actually built, not what was proposed — see `05-package-0.75c-migration-report.md` for the file-by-file change list and `06-package-0.75c-security-review.md` for the threat-model closure.

## 1. Platform User

A **platform user** is one real human, platform-wide — not parish-specific. Stored in the new `platform_users` table (`migrations/0020_platform_identity.sql`), fully normalized (typed columns), not the row+JSON-blob pattern used by `registrations`/`donors` — per Phase 0 finding #5, a membership/authorization system needs indexable, queryable columns, the same reasoning that already drove `commerce_orders` to a normalized shape.

**Authentication mechanism** (`src/lib/identity.js`) is the same *pattern* as the existing donor auth mechanism (`requireDonor`, `src/handlers/parish.js:264`), generalized rather than copied onto the donor table, per `02d`'s explicit recommendation:

- Email is the identity key, normalized (lowercase/trimmed) via the existing `normalizeEmail()`.
- A password is stored as a PBKDF2 record (`createPasswordRecord`/`verifyPasswordRecord`, `src/lib/core.js:854–881` — the same, stronger primitive already used for the parish-dashboard password and admin password, not the weaker single-SHA-256 `hashPassword` used for donor-side quick-verify passwords).
- A session is a random opaque token (`generateSecret("agp_user")`); only its salted hash (`hashSessionToken`) is stored; the token itself is returned to the caller once and never persisted in recoverable form.
- Session comparison uses `secureCompare` (constant-time) — the same helper every other session mechanism in this codebase already uses.
- Sessions expire (12-hour TTL, deliberately shorter than the donor default, appropriate for a staff/back-office identity) and are single-active-session-per-user (issuing a new session invalidates the prior one).

**What this module does *not* do:** it has no concept of a parish, a role, or a capability. It answers exactly one question — "which platform user, if any, does this request's session prove it is" — and nothing else. That separation is deliberate: identity, membership, and authorization are three different modules with three different jobs (Section 3).

## 2. Parish Membership

A **parish membership** (`parish_memberships` table) represents one platform user's relationship to one parish. A user may hold independent memberships at any number of parishes — each with its own status, its own role-template label, and its own capability grants.

Fields captured, per `02d`'s requirement list:
- `status`: `invited | active | suspended | revoked` — the exact four-state lifecycle `02d` specified.
- `joined_at`: set once, the first time a membership becomes `active` (via `COALESCE` on update — re-activating a suspended membership does not reset it).
- `invited_by_user_id`: nullable, because the legacy-bearer bootstrapping path (Section 4) has no platform-user actor to record.
- `accepted_at`: set when the invited person accepts.
- Full `created_at`/`updated_at` audit timestamps, plus every *change* to a membership additionally produces a central `audit_log` row (Section 5) — the timestamps on the row itself answer "when was this last touched," the audit log answers "what, exactly, changed and who did it."

`role_template` on the row is a **display label only** — never read by any authorization check. This is the concrete implementation of `01-accounting-philosophy.md` Section 23's "role names alone are insufficient": `src/lib/authorization.js`'s `resolveAuthorizationContext()` never looks at `role_template`, only at the rows in `membership_capabilities`.

## 3. Capability-Based Authorization

Capabilities are **data**, not code. `membership_capabilities` is a plain grant table (`membership_id`, `capability`, `granted_by_user_id`, `granted_at`) with no foreign-keyed enum — a capability is just a string. Adding `checks.reissue` next month is an `INSERT`, not a migration, exactly as `02d` required ("catalog be extensible without a breaking schema change").

`src/lib/authorization.js` exports:

- `CAPABILITY_CATALOG` — the starting catalog from `02d`, plus two membership-management capabilities (`memberships.invite`, `memberships.manage`) this package's own invitation framework needs once a parish outgrows the legacy-bearer bootstrapping path. This is a plain frozen array — a default list, not an enforced closed set (nothing in the schema rejects an unlisted capability string; the catalog exists so callers have a known vocabulary, and a test asserts every role template only references catalog entries).
- `ROLE_TEMPLATES` — convenience bundles (rector, treasurer, bookkeeper, AP clerk, bill approver, check preparer, check signer, council viewer, accountant, auditor, secretary, volunteer, bookstore manager, council member, administrator) used **only** at invitation time to pre-populate a capability list. Once expanded into `membership_capabilities` rows at acceptance, the template name is never consulted again — editing `ROLE_TEMPLATES` later does not retroactively change any already-granted membership, by design (documented inline in `resolveAuthorizationContext`'s comment).
- `resolveAuthorizationContext(env, { userId, parishId })` — the one place that turns (user, parish) into (membership, capability set). Returns `{ membership: null, capabilities: [] }` unless a membership exists **and its status is exactly `active`** — suspended and revoked memberships resolve identically to "no membership at all."
- `hasCapability(env, { userId, parishId, capability })` — boolean convenience wrapper.
- `requireCapability(request, env, parishId, capability)` — **the single authorization entry point** every future accounting route must call. Resolves the platform-user session first (never the legacy bearer — see Section 4), then the membership/capability set, and returns `null` unless the specific capability is present on an active membership. Mirrors the existing `requireDonor`/`requireAdminContext` return-null-on-failure shape so it slots into the codebase's existing `if (!ctx) return unauthorized()` idiom without introducing a new error-handling convention.
- `requireActiveMembership(request, env, parishId)` — same resolution, without requiring a specific capability, for routes that only need "any active member of this parish" (e.g., a future "list my own memberships" screen).

## 4. Legacy Bearer Token: Kept, and Architecturally Excluded From Authorization

The existing shared parish-dashboard bearer token (`verifyParishDashboardBearer`) is **completely untouched** — zero lines of `src/handlers/parish.js`'s existing auth code were modified. Every current dashboard route continues to work exactly as before.

`src/lib/authorization.js` never imports, calls, or references `verifyParishDashboardBearer` anywhere. `requireCapability` and `requireActiveMembership` are built exclusively on `requirePlatformUser` (`src/lib/identity.js`), which requires **both** an `X-AGAPAY-User-Email` header and a bearer token matching a stored, unexpired platform-user session hash. A request carrying only a legacy parish-bearer-shaped `Authorization` header — with no platform-user email header, or with an email header but no matching session — resolves to `null` at the very first step, before any membership or capability logic runs at all. This isn't a policy check that could be bypassed by a future edit; there is structurally no code path in `authorization.js` that even inspects a parish-dashboard token. `scripts/identity-tests.mjs`'s `"requireCapability never authorizes from a legacy parish bearer token alone"` test exercises exactly this.

**One deliberate, narrow exception**, consistent with `02d`'s own transition strategy ("Yes, temporarily, for existing non-accounting parish-dashboard features"): the new *membership-management* routes (invite/list/revoke — not an accounting route in any sense) accept **either** the legacy bearer **or** an active membership holding `memberships.invite`/`memberships.manage` (`src/handlers/identity.js`'s `requireMembershipManagementContext`). This exists to solve the bootstrapping problem — a parish's very first platform-user membership has to come from *somewhere*, and today's only proven parish-authenticated identity is the legacy bearer. This exception is scoped to exactly two route handlers, is not reachable from `authorization.js`, and does not and cannot extend to any accounting-domain route, since no future accounting route will be built against `requireMembershipManagementContext` — every accounting route calls `requireCapability` exclusively, per Phase 1 entry criteria.

## 5. Invitation Framework (Backend Only, No UI)

`membership_invitations` + `src/lib/memberships.js`'s `createInvitation`/`acceptInvitation`/`revokeInvitation` implement exactly the lifecycle `02d` specified: invite by email (not by platform-user id, since the invited person may not have a platform-user row yet), assign a role template (expanded into explicit capability grants at invitation time), the invited person accepts by supplying a password against their own token (never automatic — `acceptInvitation` requires the token to still be `pending` and unexpired), and acceptance is what creates/activates the membership and grants capabilities.

Invitation tokens follow the same shape as every other opaque secret in this codebase (`generateSecret`, salted hash stored, `secureCompare`d on lookup) — never stored or compared in plaintext. No email-delivery mechanism was built (out of scope, explicitly a UI/product-integration concern for a later package); `handleMembershipInvitationCreate` returns the raw token in its JSON response today, to be picked up by whatever delivery mechanism a later, explicitly-scoped package adds.

## 6. Audit Trail

No new audit table was created. Every membership lifecycle event — invitation created, invitation accepted, invitation revoked, membership status changed, capability granted, capability revoked — is recorded through the **existing** central `audit_log` table (`migrations/0014_audit_log.sql`, `src/lib/audit-log.js`'s `recordAuditEvent`), per this package's "consolidate, don't duplicate" instruction and per `02d`'s explicit recommendation that extending `audit_log.actor_type`'s value set (now including `platform_user`, alongside the existing `admin | parish | donor | system`) is "a natural, low-cost extension rather than a new mechanism." No schema change was needed for this, since `actor_type` is unconstrained `TEXT`.

Every membership-status-change audit event carries `organization_id` = the parish id, `before`/`after` summaries of the status transition, and `reason` where supplied — exactly the fields `01-accounting-philosophy.md` Section 22 requires ("actor, parish, timestamp, action, affected record, ... before-and-after information ... and a reason for privileged changes").

## 7. Authorization Flow (as implemented, matching `02d`'s target flow exactly)

1. A request arrives carrying a platform-user session (bearer token + `X-AGAPAY-User-Email` header).
2. `requirePlatformUser` resolves it to a specific platform user row, server-side, from the session hash — never trusting a client-asserted user id.
3. `requireCapability`/`requireActiveMembership` look up that user's membership for the *server-determined* target parish (never a client-supplied parish id used as authorization — the parish id in these routes comes from the URL path, matched against a `findRegistrationByParishId` lookup exactly like every existing parish-dashboard route already does).
4. Membership status is confirmed `active` — anything else (`invited`, `suspended`, `revoked`) resolves to "no membership."
5. The specific capability is tested against that membership's granted-capability set.
6. Only if all of the above hold does the caller receive `{ user, membership, capabilities }` — everything downstream of that point (a future accounting route's actual business logic) can trust it was authorized, because there is no other way to obtain it.

This is capability-check-before-any-downstream-resolution, exactly as `02d`'s target flow specifies ("capability check happens before database resolution, never after or in parallel") — no accounting database, gateway, or registry exists yet for this package to resolve *after* the check (that's Package 0.75E), but the ordering discipline is already in place for whichever package builds that resolution step next.

## 8. Future Expansion (multiple parishes, monasteries, ministries, schools, dioceses)

Nothing in this design assumes "parish" means only a parish. `parish_id` on `parish_memberships` is a bare string, matched against `registrations.parish_id` exactly the way every other parish-scoped table in this codebase already works (settlement profiles, sacrament availability, commerce). A monastery, a mission, or a school that already has (or gets) a `registrations` row with a `parish_id` gets memberships, capabilities, and invitations for free, with zero schema change. A future diocese/jurisdiction concept — a *grouping* of multiple `parish_id`s under one authority — was explicitly out of scope for this package (per the brief's "do not build approvals yet," and no diocese entity exists anywhere in the current schema to attach to); nothing built here forecloses adding one later as an additional table that references `parish_id`s, the same way every other future entity type would.
