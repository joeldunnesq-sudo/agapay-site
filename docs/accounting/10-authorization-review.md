# AGAPAY Accounting Package 0.75D — Authorization Review

Repository-wide inventory of authorization/authentication mechanisms, what Package 0.75D changed, what it deliberately left alone, and what remains as technical debt.

## 1. Existing Authorization Mechanisms (repository-wide inventory)

Read across the full repository (`src/handlers/*.js`, `src/lib/core.js`, `src/learn/*.js`) as required by this package's "read the entire repository" instruction. Five distinct authorization mechanisms exist today:

| Mechanism | Where | Individual identity? | Scope | Touched by 0.75D? |
|---|---|---|---|---|
| **Donor session** (`requireDonor`) | `src/handlers/parish.js:264` | Yes (per-donor, email-keyed) | Donor-facing giving/commemoration routes | No |
| **Admin session/password** (`requireAdmin`/`requireAdminContext`) | `src/handlers/parish.js:294–309` | No (shared password or static token, actor is a free-text display string) | Every `/api/admin/*` route | No |
| **Legacy parish-dashboard bearer** (`verifyParishDashboardBearer`) | `src/handlers/parish.js:195` | No (one shared token per parish) | Every existing `/api/parish/dashboard/*` route (giving, sacraments, settlement profiles, bookstore, commemorations, everything) | No |
| **Learn access** | `src/learn/access.js` | Household/family-scoped, not individually traced in this pass (out of scope — Learn is explicitly excluded from this package) | AGAPAY Learn routes | No |
| **Platform-user + parish-membership authorization** (`requireCapability`/`hasCapability`/`authorize`) | `src/lib/authorization.js` (new, Package 0.75C, hardened by 0.75D) | Yes (individual, capability-based) | New `/api/identity/*` and `/api/parish/dashboard/:parishId/memberships*` routes only — no accounting route exists yet to use it for anything else | **Yes — this is the mechanism this package hardens** |

**Zero mechanisms were removed or altered outside the fifth row.** Every route reachable today by an existing donor session, admin session, or parish bearer token behaves identically after this package as before it — confirmed by `git diff --stat` showing no changes to `src/handlers/parish.js`, `donor.js`, `admin.js`, or any Learn file, and by the full `npm run check` suite (including every pre-existing behavioral test) passing unchanged.

## 2. What Package 0.75D Changed (refactors, all within the 0.75C-created code)

Per this package's explicit boundary ("do not replace 0.75C, do not duplicate it, build upon it"), every change below is *inside* the authorization layer 0.75C introduced — nothing outside `src/lib/authorization.js`, `src/lib/memberships.js`, `src/handlers/identity.js`, and their tests was modified.

1. **Capability catalog replaced** with the comprehensive, platform-wide catalog specified for this package (`08-capability-model.md`), superseding 0.75C's narrower, accounting-only draft catalog (`accounting.configure`, `journals.*`, `bills.*`, `checks.*`, `reconciliations.*`, `memberships.invite`/`memberships.manage`). This is a genuine rename, done deliberately and safely: **no real invitation had ever been accepted against the old catalog** (the platform-identity feature was built and tested, but never deployed or used against production data, in the same session immediately prior to this package) — there is zero production `membership_capabilities` data anywhere holding an old-catalog string that this rename could orphan.
2. **Role templates rewritten** to the 13 templates this package specifies (`09-role-template-reference.md`), replacing 0.75C's ad hoc set (`ap_clerk`, `bill_approver`, `check_preparer`, `check_signer`, `council_viewer`, `accountant`, `auditor` — none of which appear in this package's required list, all removed; `rector`/`treasurer`/`bookkeeper`/`secretary`/`volunteer`/`bookstore_manager`/`administrator` retained by name but re-mapped to the new catalog's capability strings).
3. **Self-escalation protection added** (Section 3 below) — did not exist in 0.75C at all. 0.75C's own security review (`06-package-0.75c-security-review.md` Section 1) explicitly flagged "invitation-time capability escalation is unbounded" as an open item for this package; it is now closed.
4. **Route-handler capability names updated** in `src/handlers/identity.js` (`memberships.invite` → `parish.members.invite`, `memberships.manage` → `parish.manage`/`parish.members.remove` depending on the specific route) — this is the "where role checks exist, replace with capability checks where safe" instruction applied to the one place in the repository that already used capability checks, aligning it with the new stable catalog rather than leaving two competing capability vocabularies in the codebase simultaneously.
5. **`createInvitation`'s return contract changed** from `object | null` to a consistent `{ ok: boolean, ... }` shape (matching `acceptInvitation`'s existing pattern), so the three distinct failure modes (invalid input, self-invitation, capability escalation) are each distinguishable by the caller and mappable to the correct HTTP status (400 vs. 403) rather than collapsing every failure into an opaque `null`.
6. **Developer API aliases added** (`currentUser`, `currentMembership`, `authorize`) — thin wrappers, zero new logic, added because this package's brief specifies these as the names future developers should reach for.
7. **`requireCapability` now audits denial** when an authenticated user with a real, active membership lacks the specific capability requested — new behavior, not present in 0.75C.
8. **`hasPlatformCapability` added** — new function, did not exist in 0.75C, establishes the platform-capability boundary without building a grant mechanism (Section 6).

## 3. Self-Escalation Protection (Design Detail)

Every mutation that changes a membership's authorization state now requires an authorized actor and refuses to let that actor target their own membership:

- **`grantCapability`** — refuses if `grantedByUserId` equals the target membership's `user_id`.
- **`revokeCapability`** — same refusal, symmetric (a user cannot "remove their own restrictions" either, per this package's exact wording — self-revocation is blocked the same as self-grant, since distinguishing "removing your own capability" from "removing your own restriction" would require guessing intent this package has no basis to guess).
- **`setMembershipStatus`** — refuses if `actorUserId` equals the target membership's `user_id` (a user cannot suspend, revoke, or reactivate their own membership).
- **`createInvitation`** — refuses if the inviter's own email matches the invitation's target email (closes "invite myself to gain a new or upgraded membership" indirectly, without needing separate reasoning for the self-target case in the capability-bounding rule below).
- **Capability-grant bounding** — an inviter without `parish.roles.assign` can only grant capabilities they already hold themselves at that parish; a request for anything beyond that is rejected outright (never silently truncated). An inviter *with* `parish.roles.assign` may grant any catalog-known, non-platform-only capability, matching that capability's documented meaning ("may assign roles/capabilities to others").

Every refusal is audited (`membership.self_escalation_denied`, `membership.capability_escalation_denied`) via the existing central `audit_log`, consistent with this package's "every authorization mutation must itself require authorization" and "audit every authorization-sensitive action" requirements.

**One deliberate scope boundary:** the legacy-bearer bootstrapping path (a parish's existing dashboard access creating its first invitation) remains **unbounded** by the capability-subset rule — there is no platform-user "self" to escalate from in that path, and the legacy bearer already has full administrative control over that parish today via every existing dashboard feature, so bounding it here would not close a real vector, only add friction to the one bootstrapping mechanism this whole framework depends on. This exception is unchanged from 0.75C and remains documented in both `04-package-0.75c-identity-architecture.md` Section 4 and here.

## 4. Cross-Parish Isolation — Centralized, Not Scattered

Enforced in exactly one place: `resolveAuthorizationContext(env, { userId, parishId })` (`src/lib/authorization.js`), which queries `parish_memberships WHERE user_id = ?1 AND parish_id = ?2`. Every authorization entry point (`hasCapability`, `requireCapability`, `requireActiveMembership`, `currentMembership`, `authorize`) funnels through this single function — there is no second, independently-written cross-parish check anywhere in this package's code to drift out of sync with it. A membership at Parish A simply does not appear in a query scoped to Parish B; there is no capability list to accidentally consult across parishes because the query itself never returns Parish A's row when asked about Parish B.

## 5. Deny-By-Default — Verified Case by Case

| Case | Mechanism | Verified by |
|---|---|---|
| Unknown capability | `hasCapability`/`resolveAuthorizationContext` simply won't find it in the granted set; `sanitizeGrantableCapabilities` additionally prevents it from ever being persisted | `"unknown capability strings are always denied and never persisted"` |
| Unknown membership (no row at all) | `resolveAuthorizationContext` returns `{ membership: null, capabilities: [] }` | `"cross-parish denial..."`, `"requireActiveMembership rejects an unauthenticated request"` |
| Inactive (`invited`) membership | Same function, `status !== 'active'` check | `"an invited (not yet accepted) membership grants nothing"` |
| Suspended membership | Same check | `"suspended membership is denied the same as revoked"` |
| Revoked membership | Same check | `"revoked-membership denial takes effect immediately..."` |
| Expired session | `requirePlatformUser` (`src/lib/identity.js`), unchanged from 0.75C | `"session issuance, resolution, and expiry"` |
| Revoked invitation | `findValidInvitationByToken` only matches `status = 'pending'` | `"a revoked invitation cannot be accepted"` |
| Platform support without authorization | `hasPlatformCapability` always returns `false` | `"platform capabilities are never grantable through a parish membership and always deny"` |

Every case above collapses to the same `null`/`false`/empty-set result — there is no branch anywhere in `authorization.js` that distinguishes "explicitly denied" from "not explicitly granted." This is what "there must never be an implicit allow" means in code, not just in a document.

## 6. Support Access — Boundaries Established, Workflow Not Built (By Design)

Per this package's explicit instruction ("do NOT build the workflow, only establish boundaries"):

- **Capability boundary:** `platform.support` is catalogued (`08-capability-model.md`) but structurally ungrantable through any parish membership (`PLATFORM_ONLY_CAPABILITIES`).
- **Authorization model:** `hasPlatformCapability(env, { userId, capability })` is the one function a future elevation workflow needs to make real (query a real grant table instead of always returning `false`). Every future caller written against this function today needs zero changes when that happens.
- **Audit expectations:** `membership.self_escalation_denied` and `membership.capability_escalation_denied` establish the audit-event naming pattern (`domain.event_outcome`) a future `support.access_granted`/`support.access_revoked`/`support.action_taken` set of events should follow, reusing the same central `audit_log` table and the same `recordAuditEvent` call convention already established throughout `memberships.js`.
- **What is explicitly NOT built:** no `platform_capabilities` table, no elevation-request/approval flow, no time-limited grant expiry mechanism, no support-specific UI. All of this is named, scoped, future work for Package 0.75E or later, not invented here.

## 7. Direct Bearer Assumptions — Documented

The one remaining place a bearer-token assumption other than a platform-user session grants anything in this package's own code:

- **`requireMembershipManagementContext`** (`src/handlers/identity.js`) — accepts the legacy parish-dashboard bearer token as an alternative to a capability check, for exactly three routes (`handleMembershipInvitationCreate`, `handleMembershipInvitationRevoke`, `handleMembershipList`). Documented in `04-package-0.75c-identity-architecture.md` Section 4, restated in Section 3 above, and enforced never to extend beyond these three route handlers — `src/lib/authorization.js` itself has no code path that even inspects a parish-dashboard token (confirmed: `grep -n "verifyParishDashboardBearer" src/lib/authorization.js` returns nothing).

Every other bearer-token-shaped assumption in the repository (donor sessions, admin sessions, the legacy parish bearer used by every pre-existing dashboard route) belongs to code this package did not touch and is out of scope to re-document here beyond what `00-phase-0-architecture-audit.md` and `02d-identity-and-capability-model.md` already established.

## 8. Route Hardening — What Was and Wasn't Done

**Done:** the three membership-management routes now check the new catalog's capability names (`parish.members.invite`, `parish.members.remove`, `parish.manage`) instead of 0.75C's ad hoc names — the one place in the repository where a capability-based check already existed was brought in line with the new stable catalog.

**Deliberately not done:** no route outside `src/handlers/identity.js` was touched. `src/handlers/parish.js`'s 5,900+ lines of existing role-adjacent checks (all built on the legacy parish bearer, donor sessions, or admin sessions) were read (per "read the entire repository before making changes") but **not** converted to capability checks — doing so would violate this package's explicit "preserve every login flow" / "do not redesign authentication" constraints and would be a much larger, separately-scoped migration project, exactly as `02d-identity-and-capability-model.md`'s own "Transition strategy" anticipated: *"Existing non-accounting parish-dashboard routes continue using the shared bearer token until a separate, later, explicitly-scoped project migrates them."* This package does not begin that project; it only ensures the destination (a centralized, capability-based authorization layer) is real, tested, and ready to receive routes when that later project exists.

## 9. Remaining Technical Debt

1. **No reauthentication-for-high-risk-actions** — explicitly out of scope for this package (deferred to pilot-readiness per the existing readiness report).
2. **No MFA** on platform-user sessions — unchanged from 0.75C's own flagged limitation.
3. **Single-active-session-per-platform-user** — unchanged from 0.75C.
4. **No invitation-delivery mechanism** — unchanged from 0.75C; `createInvitation` still returns a raw token rather than emailing it.
5. **`hasPlatformCapability` has no real backing store** — by design (Section 6); a real elevation workflow is Package 0.75E-or-later's job.
6. **Duty-combination visibility** (`01-accounting-philosophy.md` Section 23's "the system must reveal when one person performs multiple sensitive actions") — still not built; there is no accounting action yet for a duty to combine over, so this remains correctly deferred.
7. **No route outside the three membership-management handlers uses `requireCapability` yet** — expected and correct at this stage (no accounting route exists), but worth stating plainly: this package hardens a mechanism with a small current call-site count, verified by tests rather than by breadth of production usage.

None of the above are Phase 1 blockers — see Section 10 for the explicit readiness assessment.

## 10. Future Migration Plan (non-binding, for later packages' reference)

1. **Package 0.75E (Accounting Gateway):** the first real consumer of `requireCapability` at scale — every accounting route it defines should call it exclusively, never the legacy bearer, per `02d`'s transition strategy and this package's own hardening.
2. **A future, separately-scoped "legacy bearer retirement" project** (not this package, not 0.75E): migrate existing non-accounting parish-dashboard routes (sacraments, settlement profiles, giving history, etc.) from the legacy bearer to platform-user + capability checks, one route at a time, each behind its own test coverage — large enough in scope that it deserves its own package brief when Joel decides to prioritize it.
3. **Platform-capability elevation workflow** (Section 6): build `platform_capabilities` (or equivalent), wire `hasPlatformCapability` to it, design time-limited support-access grants with the audit pattern this package established.
4. **Reauthentication for high-risk actions**: once real accounting routes exist (period reopening, check issuance, etc.), add a short-lived re-auth requirement layered on top of `requireCapability` for a named, small set of the highest-consequence capabilities.
