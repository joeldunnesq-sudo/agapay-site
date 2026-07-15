# AGAPAY Accounting Package 0.75D — Implementation Report

**Package:** Capability Enforcement & Authorization Hardening
**Status:** Complete
**Governing documents:** `docs/accounting/02-phase-0.75-foundational-readiness.md` (Package 0.75D scope), `01-accounting-philosophy.md` Sections 22–24, `04`–`07` (Package 0.75C's own deliverables, hardened here)
**Companion documents:** `08-capability-model.md`, `09-role-template-reference.md`, `10-authorization-review.md`

## 1. Summary

Package 0.75D transformed the authorization framework Package 0.75C introduced into the sole authoritative, capability-driven authorization system for all future privileged action in AGAPAY. It replaced 0.75C's draft capability catalog with the comprehensive, platform-wide catalog this package specifies; added self-escalation protection that did not previously exist; added a `requireCapability`-level denial audit trail; established (without building) the platform-capability boundary for future support access; and hardened the one place in the repository that already used capability checks to use the new stable vocabulary. No accounting functionality, ledger table, journal entry, posting logic, or approval workflow was built — this package is strictly authorization.

Every acceptance criterion is met:

| Criterion | Status |
|---|---|
| Authorization is capability-driven | **Met** — unchanged core design from 0.75C, now backed by the full 40-capability catalog |
| Role names no longer control business logic | **Met** — `role_template` remains a display-only label; zero code path reads it for a decision |
| Unknown capabilities fail closed | **Met** — `hasCapability`/`resolveAuthorizationContext` deny by absence; `sanitizeGrantableCapabilities` additionally prevents persistence |
| Self-escalation is impossible | **Met** — self-targeting refused in `grantCapability`, `revokeCapability`, `setMembershipStatus`, `createInvitation`; capability-grant bounding refused beyond the granter's own set (unless `parish.roles.assign`) |
| Cross-parish isolation is enforced centrally | **Met** — unchanged from 0.75C, one function (`resolveAuthorizationContext`), no scattered checks introduced |
| Authorization helpers become the only supported API | **Met** — `requireCapability`/`hasCapability`/`authorize`/`currentMembership`/`currentUser` cover every case; no module manually queries `membership_capabilities`/`parish_memberships` outside `authorization.js` and `memberships.js` |
| All existing functionality remains operational | **Met** — zero changes to `parish.js`, `donor.js`, `admin.js`, `core.js`, `audit-log.js`, any Learn file, or `worker.js` (beyond 0.75C's own additive routes, untouched again here) |
| All automated tests pass | **Met** — `npm run check`: exit code 0, zero failures, including 29/29 new/updated identity-and-authorization tests |
| Documentation is complete | **Met** — this report plus `08`, `09`, `10` |
| Readiness declared for 0.75E | **Met** — Section 8 below |

## 2. Architectural Decisions

1. **Replaced, not extended, the capability catalog.** 0.75C's catalog was accounting-only and ad hoc (invented for that package's own bootstrapping needs, explicitly flagged there as "extensible, not final"). This package's brief specifies a comprehensive, platform-wide catalog covering domains 0.75C never anticipated (Platform, Parish Administration, AP, Banking, Commerce, Stewardship, Learn, Future Modules). Rather than layering a second, parallel catalog alongside the first, the old strings were fully replaced — verified safe because no real invitation had ever been accepted against them (this feature has not been deployed).
2. **Capabilities remain flat — no inheritance graph.** Considered and explicitly rejected: implying `accounting.view` from `accounting.post`, for instance. Per `01-accounting-philosophy.md`'s deny-by-default doctrine and this package's own "never an implicit allow" rule, every capability a role needs is listed explicitly on that role's template (`09-role-template-reference.md`), even where that means some repetition (`accounting.view` appears on nearly every accounting-adjacent template). Explicit is preferred to clever here.
3. **Self-escalation protection lives in `memberships.js`, not as a route-handler concern.** Every mutating function (`grantCapability`, `revokeCapability`, `setMembershipStatus`, `createInvitation`) refuses a self-targeted actor internally, so the guarantee holds for any future caller of these functions — not only the one route handler that calls them today. This mirrors this package's own instruction: "every authorization mutation must itself require authorization," read as a property of the mutation function, not merely the route in front of it.
4. **Capability-grant bounding uses a single override capability (`parish.roles.assign`), not a separate "super-grant" flag.** An inviter can grant what they hold, or — if they hold `parish.roles.assign` — anything in the catalog. This reuses the existing catalog rather than inventing a parallel "may bypass bounding" concept, keeping exactly one mechanism (capability possession) doing all the authorization work in this package, consistent with the Philosophy's "one implementation" discipline.
5. **`createInvitation`'s return contract changed to `{ ok, ... }`.** A pre-existing design smell from 0.75C (a bare `null` on any failure, indistinguishable reasons) became actively confusing once there were three distinct failure modes (invalid input, self-invitation, capability escalation) each warranting a different HTTP status. Fixed now rather than carried forward, since 0.75C's own code is what this package is explicitly permitted to hardened/refine.
6. **Platform capabilities get a structurally separate function (`hasPlatformCapability`), not a special case inside `hasCapability`.** Keeps the parish-membership-scoped authorization path (the vast majority of real usage) simple and unaware that platform capabilities exist at all, while still giving future code a named, stable thing to call. `hasPlatformCapability` always returns `false` today — a real, honest implementation of "no elevation workflow exists yet," not a stub that silently does nothing while claiming to check something.
7. **Denial auditing scoped to "authenticated user, real membership, capability absent" — not every anonymous/no-session hit.** Considered auditing every `requireCapability` call regardless of outcome; rejected as audit-log noise inconsistent with `01-accounting-philosophy.md`'s actual required-audit-event list (which names specific privileged actions, not every read). The chosen scope captures the genuinely interesting security signal (an authenticated actor probing beyond their granted permissions) without logging routine anonymous traffic already handled by rate limiting.

## 3. Schema Changes

**None.** This package added zero migrations, zero tables, zero columns. `membership_capabilities.capability` was already unconstrained `TEXT` (Package 0.75C) — the entire capability-catalog replacement and every new capability string in this package is a pure application-layer, no-migration change, exactly as `08-capability-model.md` Section 6 describes as the intended extension mechanism.

## 4. Files Changed

All changes are confined to files Package 0.75C created — no new source file was added, and no file outside the authorization/membership/identity-route surface was touched.

| File | Change |
|---|---|
| `src/lib/authorization.js` | Capability catalog replaced (40 capabilities); role templates replaced (13 templates, 2 intentionally reserved-empty); `PLATFORM_ONLY_CAPABILITIES`, `isKnownCapability`, `sanitizeGrantableCapabilities`, `hasPlatformCapability` added; `requireCapability` now audits denial; `currentUser`, `currentMembership`, `authorize` developer-API aliases added |
| `src/lib/memberships.js` | `assertNotSelfTargeting` guard added and wired into `grantCapability`/`revokeCapability`/`setMembershipStatus`; `createInvitation` gained self-invitation rejection, capability-grant bounding, and a new `{ ok, code, error }` return contract |
| `src/handlers/identity.js` | Three route gates updated to the new catalog's capability names (`parish.members.invite`, `parish.members.remove`, `parish.manage`); invitation-create error handling updated for the new `createInvitation` return shape (400 vs. 403 distinguished); explicit-capability filtering now calls the centralized `sanitizeGrantableCapabilities` instead of an inline filter |
| `scripts/identity-tests.mjs` | Rewritten: every old-catalog capability string replaced; 13 new tests added for self-escalation, capability-grant bounding, unknown/platform capability denial, inactive-membership denial, developer-API aliases, route-level protection, and denial auditing (29 tests total, up from 16) |
| `docs/accounting/08-capability-model.md`, `09-role-template-reference.md`, `10-authorization-review.md`, this report | New |

**Confirmed unchanged (zero diff):** `src/worker.js` (0.75C's route registrations from the prior package remain, untouched again here), `src/lib/identity.js`, `package.json`, `migrations/0020_platform_identity.sql`, and every file outside the 0.75C-created set — `src/handlers/parish.js`, `donor.js`, `admin.js`, `src/lib/core.js`, `src/lib/audit-log.js`, every Learn module, every existing migration.

## 5. Tests Added

`scripts/identity-tests.mjs` grew from 16 to 29 tests. New coverage added in this package, mapped to the brief's required categories:

- **Deny-by-default:** `"unknown capability strings are always denied and never persisted"`, `"an invited (not yet accepted) membership grants nothing"`, `"platform capabilities are never grantable... and always deny"`.
- **Self-escalation attempts:** `"a user cannot invite their own email address"`, `"a member cannot grant a capability they don't hold themselves..."`, `"a user cannot grant, revoke, or change status on their own membership"`.
- **Cross-parish privilege denial:** `"cross-parish denial..."` (retained from 0.75C, re-verified against the new catalog).
- **Role inheritance / capability inheritance:** `"role inheritance: expandRoleTemplate returns exactly a role's declared capability set"` (and its companion, confirming an unrecognized role template expands to zero capabilities rather than throwing — this package's flat-capability design means there is no deeper "inheritance" to test beyond template expansion itself, documented explicitly in `08` Section 5).
- **Unknown capability:** covered above.
- **Expired sessions / inactive / revoked memberships:** retained and re-verified (`"session issuance, resolution, and expiry"`, `"an invited... membership grants nothing"`, `"revoked-membership denial..."`, `"suspended membership is denied..."`).
- **Legacy bearer exclusion:** `"requireCapability never authorizes from a legacy parish bearer token alone"` (retained, re-verified).
- **Support capability boundaries:** `"platform capabilities are never grantable through a parish membership and always deny"`.
- **Authorization helper behavior:** `"currentUser/currentMembership/authorize are working aliases over the same authorization logic"`.
- **Route protection:** two new handler-level tests calling `handleMembershipInvitationCreate` directly through a constructed `Request`, confirming a 401 without the required capability and a 200 with it.
- **Negative testing:** the majority of the above — 18 of 29 tests assert a denial/failure path, not a success path.

`npm run check` (the complete repository suite, every prior package's tests plus this one): **exit code 0**, zero `FAIL`-prefixed lines, run after every substantive code change in this session to catch regressions immediately rather than only at the end.

**One real defect was found and fixed while writing these tests**, not merely a test-authoring error: the original test for "multiple memberships across parishes" (inherited from 0.75C) had one user inviting their own email address to a second parish — which is exactly the self-escalation pattern this package now correctly rejects. The test itself was wrong (it modeled an invalid scenario), not the new guard; fixed by having a distinct administrator account perform the second invitation, which is what the multi-parish scenario actually requires.

## 6. Security Review

- **Self-escalation is now structurally impossible** through every mutation path this package's code exposes (Section 3 above, `10-authorization-review.md` Section 3) — verified by five dedicated tests, including a positive control (`"a different, authorized actor CAN grant/revoke/change status on someone else's membership"`) proving the guard specifically targets self-action, not all mutation.
- **Capability-grant bounding closes 0.75C's own flagged gap** (`06-package-0.75c-security-review.md` Section 1: "an inviter can grant capabilities they don't hold themselves... a real gap"). Now closed, with an explicit, documented override (`parish.roles.assign`) rather than either leaving it open or making the system unusable for legitimate delegation.
- **Deny-by-default verified case-by-case** — see `10-authorization-review.md` Section 5's table mapping every denial category to its mechanism and its test.
- **Platform-capability boundary is real, not aspirational** — `hasPlatformCapability` always returning `false` is a genuine, testable fail-closed behavior today, not a documentation promise about future behavior.
- **No new attack surface was introduced.** Every new function added in this package (`sanitizeGrantableCapabilities`, `isKnownCapability`, `hasPlatformCapability`, `currentUser`/`currentMembership`/`authorize` aliases, `assertNotSelfTargeting`) is either a pure filter over known-safe input or a thin wrapper over an already-reviewed function — none opens a new database query path, new route, or new trust boundary.
- **Audit coverage expanded**, not merely maintained: `authorization.capability_denied`, `membership.self_escalation_denied`, and `membership.capability_escalation_denied` are new event types, all routed through the existing central `audit_log` (no new audit mechanism), all carrying actor/parish/capability/decision fields per `01-accounting-philosophy.md` Section 22.

## 7. Known Limitations (carried forward or newly identified — none block Phase 1)

1. **No reauthentication-for-high-risk-actions** — unchanged from 0.75C, correctly still deferred to pilot-readiness.
2. **No MFA** — unchanged from 0.75C.
3. **Single-active-session-per-platform-user** — unchanged from 0.75C.
4. **No invitation-delivery mechanism** — unchanged from 0.75C.
5. **`hasPlatformCapability` has no real backing store** — by design; Package 0.75E-or-later's responsibility.
6. **Duty-combination visibility not built** — still correctly deferred; no accounting action exists yet to combine duties over.
7. **Legacy bearer token remains the only auth path for every pre-existing parish-dashboard feature** — unchanged, and correctly so, per this package's explicit "preserve every login flow" constraint; a future, separately-scoped migration project is named (not begun) in `10-authorization-review.md` Section 10.

## 8. Readiness Assessment for Package 0.75E (Accounting Gateway)

**Ready to begin.** This package delivered exactly what 0.75E needs to build against:

- A **stable, comprehensive capability catalog** (`08-capability-model.md`) covering not just accounting but every domain 0.75E's gateway will eventually need to authorize against, so the gateway's route handlers can be written once against the final vocabulary rather than against a catalog still expected to be renamed.
- A **centralized authorization entry point** (`requireCapability`/`authorize`) that is provably the *only* implementation checking `membership_capabilities` — 0.75E's own acceptance criterion ("the gateway's RPC surface has no method accepting a raw binding identifier as a parameter... capability check happens before database resolution") can be built directly on `requireCapability`, calling it before any registry/binding resolution, exactly as `02d-identity-and-capability-model.md`'s target authorization flow specifies.
- **Self-escalation protection and capability-grant bounding already proven**, so 0.75E does not need to design its own answer to "can a gateway-adjacent actor grant themselves gateway access" — the underlying membership/capability layer it depends on already answers that question correctly, one layer down.
- **A real audit trail for authorization decisions** (not just membership mutations) — 0.75E's own registry-provisioning audit requirements (Workstream 5 of `02-phase-0.75-foundational-readiness.md`: "every registry state transition is a central audit event") can follow the exact pattern (`recordAuditEvent` calls with actor/parish/capability/decision fields) this package established for `authorization.capability_denied`.

**What 0.75E should not assume is already done:** no service-binding trust boundary exists yet (Section 6 of `10-authorization-review.md` — "broken authorization in service-to-service calls," threat #19 in `02b-accounting-threat-model.md`, remains entirely 0.75E's to design); no registry table exists; no Worker topology decision has been implemented (only approved in principle per the readiness report). This package's authorization layer is a prerequisite 0.75E depends on, not a partial implementation of 0.75E itself.

**No blocking dependency remains between this package and 0.75E.** Per the dependency graph in `02-phase-0.75-foundational-readiness.md` Section 7 (`0.75C → 0.75D → 0.75E`), that chain is now fully satisfied on the identity/authorization side. 0.75E's own stated prerequisites — "needs an identity/capability model to authorize against" — are met.
