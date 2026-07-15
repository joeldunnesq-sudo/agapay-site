# AGAPAY Accounting Package 0.75C — Migration Report

## 1. Schema Additions

One new migration, `migrations/0020_platform_identity.sql` (next sequential number after `0019_sacrament_priests.sql`). Purely additive — no existing table, column, or index was altered or dropped.

| Table | Purpose | Key columns | Notes |
|---|---|---|---|
| `platform_users` | One row per real human, platform-wide | `id` (PK), `email` (unique), `display_name`, `email_verified_at`, `password_record`, `session_token_hash`/`session_salt`/`session_expires_at`, `status` | Fully normalized, not the row+JSON-blob pattern used by `registrations`/`donors` (Phase 0 finding #5) |
| `parish_memberships` | One row per (user × parish) | `id` (PK), `user_id`, `parish_id`, `role_template`, `status`, `invited_by_user_id`, `invited_at`/`accepted_at`/`joined_at` | Unique on `(user_id, parish_id)` — one membership record per user per parish, reactivated rather than duplicated on re-invitation |
| `membership_capabilities` | Capability grants per membership | `id` (PK), `membership_id`, `capability`, `granted_by_user_id`, `granted_at` | Unique on `(membership_id, capability)`; capability is a bare string, not an enum — additive by design |
| `membership_invitations` | Invitation lifecycle | `id` (PK), `parish_id`, `email`, `role_template`, `invited_capabilities` (JSON array), `invited_by_user_id`, `invited_by_legacy_bearer`, `token_hash`/`token_salt`, `status`, `expires_at`, `accepted_at`/`accepted_by_user_id` | Targets an email address, not a `platform_users` row, since the invited person may not have one yet |

No new column was added to any existing table. `audit_log.actor_type` gains a new *value* (`platform_user`) at the application layer only — the column itself (`TEXT`, unconstrained) required no migration.

## 2. Migration Safety

- Ran through the existing `scripts/migration-integrity.mjs` gate (Package 0.75A) as part of `npm run check` — confirmed present, readable, non-empty, and correctly targeted.
- Every statement is `CREATE TABLE IF NOT EXISTS` / `CREATE ... INDEX IF NOT EXISTS` — safe to apply against a database that may already have partially applied it (idempotent re-run), consistent with the pattern used throughout `migrations/`.
- No `ALTER TABLE`, no `DROP`, no data backfill/rewrite of any existing row — this migration cannot affect any existing record in any existing table.
- Applied and exercised in this session only against an in-memory `node:sqlite` database via `scripts/identity-tests.mjs` (Section 4) — **not applied against local or production D1 in this session**, consistent with this package's scope (no Cloudflare resource was touched; migration application to production D1 happens automatically, gated by the CI test suite, per Package 0.75A's pipeline, on the next push to `main`).

## 3. New Backend Modules

| File | Purpose |
|---|---|
| `src/lib/identity.js` (new) | Platform-user identity: creation, password set/verify, session issuance/verification/revocation, `requirePlatformUser` (the platform-user analog of `requireDonor`) |
| `src/lib/memberships.js` (new) | Membership lifecycle (create/reactivate, status transitions), capability grant/revoke, invitation create/accept/revoke — every mutating function records a central `audit_log` event |
| `src/lib/authorization.js` (new) | `CAPABILITY_CATALOG`, `ROLE_TEMPLATES`, `resolveAuthorizationContext`, `hasCapability`, `requireCapability`, `requireActiveMembership` — the single centralized authorization layer |
| `src/handlers/identity.js` (new) | Route handlers: login, session ("whoami"), logout, invitation accept, invitation create/list/revoke (parish-side, gated by `requireMembershipManagementContext`), capability-catalog lookup |

## 4. Files Modified (existing files)

| File | Change | Why |
|---|---|---|
| `src/worker.js` | Added one new `import` block (`src/handlers/identity.js`'s exports) and ~11 new route-registration `if` blocks (`/api/identity/*`, `/api/parish/dashboard/:parishId/memberships*`) | Wires the new routes into the existing dispatch; no existing `if` block, import, or route was touched, reordered, or removed |
| `package.json` | Added `node scripts/identity-tests.mjs` to the end of the `check` script chain | So the new test suite runs identically in local `npm run check` and in the CI `test` job (Package 0.75A), the same convention every prior test script addition (`settlement-profiles-tests.mjs`, `tax-exemption-tests.mjs`, etc.) already follows |

No other existing file was modified. In particular: `src/handlers/parish.js`, `src/handlers/donor.js`, `src/handlers/admin.js`, `src/lib/core.js`, `src/lib/audit-log.js`, and every existing migration file are **byte-for-byte unchanged** — confirmed by `git diff` scoped to this session's work touching only the files listed above and in Section 1/3.

## 5. New Route Surface (all additive, none pre-existing)

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/identity/login` | POST | none (credentials in body) | Platform-user login, issues a session |
| `/api/identity/session` | GET | platform-user session | "whoami" — current user + their memberships |
| `/api/identity/logout` | POST | platform-user session | Revokes the current session |
| `/api/identity/capabilities` | GET | none | Static capability catalog + role templates, for a future UI |
| `/api/identity/invitations/:token/accept` | POST | invitation token (in path) + password (in body) | Accepts an invitation, creates/activates the platform user + membership |
| `/api/parish/dashboard/:parishId/memberships/invitations` | POST | legacy parish bearer **or** `memberships.invite` capability | Creates an invitation |
| `/api/parish/dashboard/:parishId/memberships/invitations/:invitationId` | DELETE | legacy parish bearer **or** `memberships.manage` capability | Revokes a pending invitation |
| `/api/parish/dashboard/:parishId/memberships` | GET | legacy parish bearer **or** `memberships.manage` capability | Lists a parish's memberships + invitations |

Every existing route (all of `src/handlers/parish.js`, `donor.js`, `admin.js`, `stripe.js`, every Learn route, every commerce route) is unchanged and continues to resolve to identical handler functions with identical auth gates.

## 6. Test Coverage Added

`scripts/identity-tests.mjs` — 16 tests, run against a real (in-memory) SQLite database via `node:sqlite`, exercising the actual `src/lib/identity.js`/`memberships.js`/`authorization.js` modules directly (no reimplementation, no mocking of the modules under test) — the same technique already established by `scripts/settlement-profiles-tests.mjs` and `scripts/tax-exemption-tests.mjs`.

Coverage, mapped to this package's required test list:
- **Multiple memberships / multiple parishes:** `"one user can hold independent memberships at multiple parishes"`.
- **Capability evaluation / boundary tests:** `"capability-boundary: has X, lacks Y"`.
- **Legacy bearer compatibility (exclusion):** `"requireCapability never authorizes from a legacy parish bearer token alone"`.
- **Authorization helpers:** `"requireActiveMembership rejects an unauthenticated request"`, plus the boundary/cross-parish/revocation tests below, which all exercise `authorization.js` directly.
- **Membership lifecycle:** invitation → acceptance → active membership (`"invitation acceptance creates an active membership with role-template capabilities"`), plus status transitions (`"revoked-membership denial..."`, `"suspended membership is denied..."`).
- **Role assignment:** `"...with role-template capabilities"` (role template correctly expands into explicit capability grants at acceptance) and `"capability catalog and role templates only reference known capability strings"` (catalog/template integrity).
- **Permission denial:** cross-parish denial, revoked-membership denial, suspended-membership denial, capability-boundary denial, unauthenticated denial — five distinct denial scenarios, each asserting the *specific* failure mode required by `02d`'s "Required tests" list.
- **Audit generation:** `"membership lifecycle actions generate central audit_log rows"` — asserts real rows exist in `audit_log` for invitation creation, acceptance, capability grant, capability revoke, and status change, including that `reason` and `organization_id` are captured correctly on a status change.
- **Session mechanics** (not explicitly required by `02d`'s list, added because the identity layer itself needed direct coverage): idempotent user creation, password verify success/failure, session issue/resolve/wrong-token-reject/expiry-reject/revoke-reject.
- **Invitation edge cases** (added beyond the minimum): re-acceptance of an already-accepted token is rejected, a revoked invitation cannot be accepted, an expired invitation cannot be accepted.

`npm run check` (the full existing suite, now including this new script) was run in this session: **exit code 0, zero failures**, across every existing test file plus the 16 new ones — no regression in any prior package's tests.

## 7. Compatibility Decisions

- **Shared parish bearer token:** kept, unmodified, indefinitely, for every existing non-accounting route — per this package's explicit instruction and per `02d`'s recommended default. Zero lines of `verifyParishDashboardBearer` or its call sites were changed.
- **Donor identity:** untouched. `requireDonor`, the `donors` table, and every donor-facing route are unaffected.
- **Admin identity:** untouched. `requireAdmin`/`requireAdminContext`, admin sessions, and every admin route are unaffected.
- **No existing data was migrated.** No existing `registrations` row, donor, or any other record was read, written, or backfilled by this package's migration or code. Platform users and memberships are created only going forward, by the new invitation flow.
- **No accounting table, route, or logic was created** — this package is purely the identity/membership/authorization foundation, per its explicit scope boundary.

## 8. Future Work Explicitly Deferred (not part of this package)

- Any UI for inviting, accepting, or managing memberships (explicitly out of scope, per the brief).
- Invitation delivery (email) — `createInvitation` returns the raw token; nothing sends it anywhere yet.
- Multi-session support per platform user (currently single-active-session, deliberately simple for this foundational package).
- Password reset flow for platform users (parity with the existing donor/parish password-reset flows was not built — not required for this package's acceptance criteria, and no route currently depends on it).
- Reauthentication-for-high-risk-actions (explicitly deferred per `02-phase-0.75-foundational-readiness.md` Package 0.75D's own exclusions).
- Any accounting route consuming `requireCapability` — none exists yet; this package builds the mechanism, exercised by tests, not by real accounting routes (per Package 0.75D's own scope note: "no accounting route exists yet in this phase, so this is the mechanism, exercised by tests, not yet by real routes").
