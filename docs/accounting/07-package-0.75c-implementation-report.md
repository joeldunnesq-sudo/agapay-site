# AGAPAY Accounting Package 0.75C — Implementation Report

**Package:** Platform Identity & Parish Memberships
**Status:** Complete
**Governing documents:** `docs/accounting/02-phase-0.75-foundational-readiness.md` (Package 0.75C scope), `02d-identity-and-capability-model.md` (design), `01-accounting-philosophy.md` Sections 22–24 (binding doctrine)
**Companion documents:** `04-package-0.75c-identity-architecture.md`, `05-package-0.75c-migration-report.md`, `06-package-0.75c-security-review.md`

## 1. Summary

This package converted AGAPAY from "parish identity" (a single shared bearer credential per parish) to "person identity + parish membership" (individual authenticated humans, each independently belonging to any number of parishes with an independently granted, data-driven capability set) — purely additively, with zero changes to any existing authentication flow, API, URL, or feature.

Every acceptance criterion from the governing package brief is met:

| Criterion | Status |
|---|---|
| Existing production functionality behaves identically | **Met** — no existing file's behavior-relevant code was modified; `npm run check` (full existing suite) passes unchanged |
| Existing bearer authentication still works | **Met** — `verifyParishDashboardBearer` and every call site untouched |
| Every authenticated user can support future memberships | **Met** — `platform_users` is the universal identity; `parish_memberships` supports any number of memberships per user |
| Multiple parish memberships are supported | **Met** — tested directly (`"one user can hold independent memberships at multiple parishes"`) |
| Authorization is capability-based | **Met** — `membership_capabilities` is data; `role_template` is a display label never read by any check |
| Business logic no longer depends directly on role names | **Met** — no code anywhere compares a role-template string for an authorization decision |
| Authorization helpers are centralized | **Met** — `src/lib/authorization.js` is the only module that reads `membership_capabilities` |
| Membership changes are auditable | **Met** — every mutation routes through the existing central `audit_log` via `recordAuditEvent` |
| Comprehensive automated tests pass | **Met** — 16 new tests, all passing; full existing suite (125+ prior assertions across all packages) unaffected |
| Documentation is complete | **Met** — this report plus the three requested documents |

## 2. Architectural Decisions

1. **Generalized the donor auth pattern, not the donor table.** `src/lib/identity.js` reimplements the *mechanism* (verified email, salted hashed session, expiry, constant-time comparison) as a new, independent module — never imports from or writes to the `donors` table. Rationale: donors and parish staff are different populations with different lifecycle needs (`02d`); conflating them would either weaken donor privacy assumptions or bolt awkward staff-role fields onto a donor-shaped table.
2. **Fully normalized schema, not the row+JSON-blob pattern.** `platform_users`, `parish_memberships`, `membership_capabilities`, `membership_invitations` are all typed-column tables, following the `commerce_orders` precedent Phase 0 identified as the better pattern to imitate for anything that needs to be indexed, joined, and queried by SQL — which an authorization system inherently does.
3. **Capabilities as data, roles as a one-time expansion.** `membership_capabilities` rows are the only thing any authorization check reads. `ROLE_TEMPLATES` is consulted exactly once, at invitation-creation time, to pre-populate that data — never again. This makes the capability catalog extensible without a schema change and makes a later edit to a role template's definition provably unable to retroactively alter an already-granted membership.
4. **Reused the existing central `audit_log`, did not build a second audit mechanism.** Per this package's own "consolidate, don't duplicate" instruction and `02d`'s explicit recommendation, extending `audit_log.actor_type`'s value set (adding `platform_user`) is a zero-schema-change, low-cost extension of infrastructure that already existed and already worked.
5. **Legacy bearer token kept, architecturally excluded from the new authorization layer, with one narrow bootstrapping exception.** `authorization.js` has no code path that can accept a legacy bearer token, tested directly. The one exception — membership-management routes accepting either the legacy bearer or a capability grant — exists solely to solve the "how does a parish's first platform-user membership get created" bootstrapping problem, is scoped to exactly those route handlers, and is explicitly documented as never extending to any future accounting route.
6. **Single active session per platform user, 12-hour TTL.** A deliberate simplification for this foundational package (shorter-lived, single-session, appropriate for a staff/back-office identity) rather than building multi-session support this package didn't need to build. Flagged as revisitable, not treated as an oversight.
7. **Invitation delivery (email) explicitly not built.** `createInvitation` returns the raw token directly in its API response; nothing sends it anywhere. This package builds the framework (`02d`'s explicit instruction), not the product feature of actually notifying an invitee.

## 3. Files Changed

**New files (7):**
- `migrations/0020_platform_identity.sql`
- `src/lib/identity.js`
- `src/lib/memberships.js`
- `src/lib/authorization.js`
- `src/handlers/identity.js`
- `scripts/identity-tests.mjs`
- `docs/accounting/04-package-0.75c-identity-architecture.md`, `05-package-0.75c-migration-report.md`, `06-package-0.75c-security-review.md`, this report (4 docs)

**Modified files (2):**
- `src/worker.js` — one new import block, ~11 new route-registration blocks, nothing else touched.
- `package.json` — `identity-tests.mjs` appended to the `check` script chain.

**Untouched (verified explicitly):** `src/handlers/parish.js`, `src/handlers/donor.js`, `src/handlers/admin.js`, `src/lib/core.js`, `src/lib/audit-log.js`, every file under `src/learn/`, every existing migration file, `wrangler.toml`, `.github/workflows/deploy.yml`. No Stripe code, no donation code, no settlement-profile code, no bookkeeping code was read for the purpose of modification (only read for context, per the "read the entire repository" instruction) and none was changed.

## 4. Migrations

One migration (`0020_platform_identity.sql`), four new tables, fully additive, `CREATE ... IF NOT EXISTS` throughout, no `ALTER`/`DROP`, no existing-data backfill. Not applied to local or production D1 in this session (no Cloudflare resource was touched) — will apply automatically on the next push to `main` through the existing CI-gated migration pipeline (Package 0.75A), exactly like every other migration in this repository already does. Full detail in `05-package-0.75c-migration-report.md`.

## 5. Tests Executed

- `npm run check` (the complete existing suite, now including the new `identity-tests.mjs`): **exit code 0**, zero `FAIL`-prefixed lines, run twice in this session (once before, once after a bug fix described below) to confirm both the fix and the absence of regressions.
- `scripts/identity-tests.mjs` standalone: **16/16 passing**, covering multi-membership, multi-parish, capability boundary, cross-parish denial, revoked/suspended-membership denial, legacy-bearer exclusion, session lifecycle (issue/resolve/expire/revoke/wrong-token), invitation lifecycle (accept/re-accept-rejected/revoked-rejected/expired-rejected), and audit-event generation.
- `node --check` run against every new/modified `.js` file individually, plus as part of `npm run check`'s existing `node --check src/worker.js` step.

**One real bug was found and fixed during test-writing**, not merely a test being wrong: `createInvitation` originally did not expand a supplied `roleTemplate` into capability grants itself — only the route handler (`handleMembershipInvitationCreate`) did that expansion, meaning any other caller of `createInvitation` (including, at the time, the test suite) that passed a `roleTemplate` without also manually calling `expandRoleTemplate` first would silently create a membership with zero capabilities. Fixed by moving the expansion into `createInvitation` itself (the library layer), with the route handler simplified to just pass through explicit capabilities when given. This is exactly the kind of defect this package's own test-writing exists to catch — recorded here for transparency, not glossed over.

## 6. Compatibility Considerations

- Zero behavioral change to any existing route, page, or API response shape.
- Zero new required environment variable, secret, or Cloudflare binding — this package uses the existing `AGAPAY_DB` binding exclusively (Package 0.75E's separate accounting-gateway/registry work, not yet built, is unaffected either way).
- The new routes are additive paths under `/api/identity/*` and `/api/parish/dashboard/:parishId/memberships*` — no existing path was reused, shadowed, or reordered ahead of an existing `if` block in `worker.js`'s dispatch chain.
- No new Cloudflare resource was created or requested (no D1 database, no Worker, no Queue, no R2 bucket) — entirely within the existing `agapay-production` D1 database and existing Worker deployment.

## 7. Known Technical Debt / Follow-Up Items

Carried forward explicitly (not silently dropped), most already scoped to a named future package:

1. **Invitation-time capability escalation is unbounded** (an inviter can grant capabilities they don't hold themselves) — recommended fix in Package 0.75D. See `06-package-0.75c-security-review.md` Section 1.
2. **An unrecognized role-template name silently produces zero capabilities** rather than a loud validation error — recommended hardening in a later pass. See `06` Section 3.
3. **No reauthentication-for-high-risk-actions** — correctly deferred to pilot-readiness per the existing readiness report; not required for this package.
4. **No MFA** — not built; flagged for evaluation before pilot, given platform-user sessions will eventually authorize real money-moving accounting actions.
5. **No invitation-delivery mechanism (email)** — the framework returns a raw token; wiring it to an actual notification is out of this package's explicit scope.
6. **Single-active-session-per-user** — a simplification, not a defect; revisit if concurrent-device sessions become a real product need.
7. **Duty-combination visibility** (Philosophy §23's "the system must reveal when one person performs multiple sensitive actions") — not built; correctly scoped to Package 0.75D/general-release per the existing readiness report, since no accounting action exists yet to combine duties over.

None of the above are Phase 1 blockers per `02c-phase-1-entry-checklist.md` — items 1–2 are exactly the kind of refinement Package 0.75D exists to do; items 3–7 are already correctly sequenced to later packages in the pre-existing readiness report, not newly discovered scope creep from this implementation.

## 8. Readiness Assessment for Package 0.75D (Capabilities & Authorization Refinement)

**Ready to begin.** This package delivered exactly the prerequisite `02-phase-0.75-foundational-readiness.md` specifies for 0.75D: "capabilities need someone to attach capabilities to" — platform users and parish memberships now exist, are testable, and are auditable. Specifically, 0.75D can now build directly on:

- `membership_capabilities` as the concrete grant table to refine (e.g., adding the invitation-escalation bound from Section 7 item 1).
- `CAPABILITY_CATALOG`/`ROLE_TEMPLATES` in `src/lib/authorization.js` as the concrete, extensible catalog to expand — 0.75D's brief anticipates finer-grained capabilities than could be usefully predicted in `02d`; the catalog is already structured as plain data specifically so 0.75D can add to it without a migration.
- `requireCapability`/`requireActiveMembership` as the concrete centralized entry point — 0.75D's acceptance criterion ("the authorization function is the single implementation any future accounting route uses") is already satisfiable, since no parallel or duplicated check exists anywhere in the codebase to compete with it.
- The audit pattern already established (`recordAuditEvent` calls on every membership mutation) as the template for 0.75D's own "capability-change audit logging" requirement — no new audit mechanism needs to be invented, only more call sites added if 0.75D introduces new mutation paths.

**What 0.75D should not assume is already done:** duty-combination visibility/reporting, invitation-capability-escalation bounding, and reauthentication-for-high-risk-actions are explicitly not part of this package's delivered scope (Section 7) — 0.75D's own brief should treat these as open items to pick up, not as already-closed gaps.

**No blocking dependency was introduced.** 0.75D does not need to wait on Package 0.75E (Accounting Gateway) — this package's authorization layer resolves membership/capability data entirely from the existing central `AGAPAY_DB`, with no dependency on a registry or gateway that doesn't exist yet. Per the dependency graph in `02-phase-0.75-foundational-readiness.md` Section 7, 0.75D follows 0.75C directly, and that edge is now satisfied.
