# AGAPAY Accounting Package 0.75C — Security Review

Reviewed against `docs/accounting/01-accounting-philosophy.md` (Sections 22–24), `02b-accounting-threat-model.md`, and `02d-identity-and-capability-model.md`'s own "Security risks specific to this design" and "Required tests" sections.

## 1. Privilege Escalation Risks

**Risk: a capability check implemented as scattered, ad hoc string comparisons.** Mitigated structurally — `resolveAuthorizationContext`/`hasCapability`/`requireCapability` in `src/lib/authorization.js` are the only code in this package that reads `membership_capabilities`. No route handler, and no other module, queries that table directly. `scripts/identity-tests.mjs`'s catalog-integrity test additionally guards against a role template silently drifting to reference a capability string that isn't in the documented catalog.

**Risk: role-template edits retroactively changing an already-granted membership's capabilities.** Not possible by construction — `ROLE_TEMPLATES` is only ever read at invitation-creation time (`createInvitation`'s expansion), and the *result* of that expansion (explicit `membership_capabilities` rows) is what every later check reads. Changing `ROLE_TEMPLATES` in code has zero effect on any membership that already accepted an invitation under the old template. This is a deliberate design choice, documented in `authorization.js`'s comments and in `04-package-0.75c-identity-architecture.md` Section 3.

**Risk: a membership resolving to authorization despite a non-`active` status.** Tested directly — `resolveAuthorizationContext` returns `{ membership: null, capabilities: [] }` for any status other than exactly `'active'` (string equality, not a truthy check), and `scripts/identity-tests.mjs` has dedicated tests for both `suspended` and `revoked` confirming immediate denial, not merely eventual denial after a session expires.

**Risk: privilege escalation via the invitation-creation path itself** (e.g., a low-privilege member inviting someone with more capabilities than they themselves hold). **Open gap, explicitly flagged, not fixed in this package**: `handleMembershipInvitationCreate`'s gate (`requireMembershipManagementContext`) checks only that the caller holds `memberships.invite`, not that the capabilities being granted to the invitee are a subset of the inviter's own capabilities. A member with only `memberships.invite` could today invite someone with `checks.issue`, `journals.post`, etc., even without holding those capabilities themselves. This is a real gap, but scoped correctly: this package builds the *mechanism* (invitations, capability grants, audit), and every invitation-creation event is fully audited (actor, target email, granted capabilities) — the gap is a policy question (should invitation-time capability grants be bounded by the inviter's own grants?) belonging to Package 0.75D's capability-refinement scope, not something this foundational package should silently invent a rule for. **Recommendation for 0.75D**: add an explicit "cannot grant a capability you don't hold yourself" rule to `createInvitation`, or an explicit, documented decision that this is intentionally unbounded for now (e.g., because only legacy-bearer-authenticated actors or a `memberships.manage`-holding administrator are expected to use this path in practice, pending 0.75D's finer-grained design).

## 2. Membership Validation

- Membership status is validated on **every** call to `resolveAuthorizationContext` — there is no cached "was active as of session issuance" shortcut. A membership revoked mid-session is denied on the very next request, satisfying `01-accounting-philosophy.md` Section 24's "Database resolution must occur server-side... never from a client-supplied value" and `02d`'s explicit requirement ("Revoking a membership must take effect for the next request, not merely hide UI").
- Membership lookup is always keyed by `(user_id, parish_id)` resolved server-side from the authenticated session and the URL path's parish id — never from a client-supplied user id or a client-asserted "I am a member of parish X" claim.
- Cross-parish isolation is structural, not policy: `resolveAuthorizationContext` queries `WHERE user_id = ?1 AND parish_id = ?2` — a membership row for Parish A simply does not exist in the result set for a query scoped to Parish B. There is no shared "global capability" concept that could leak across parishes. Directly tested (`"cross-parish denial..."`).

## 3. Role Validation

- Role templates are validated only in the sense that `expandRoleTemplate` returns `[]` for any unrecognized template name (`ROLE_TEMPLATES[roleTemplate]` is `undefined` for a typo or unknown value) — a mistyped role template silently grants **zero** capabilities rather than failing loudly. This fails closed (no capabilities is the safe direction), but is a silent failure mode, not a validation error surfaced to the caller. **Recommendation for a later package**: have `createInvitation`/`handleMembershipInvitationCreate` reject an unrecognized `roleTemplate` value explicitly (400) rather than silently producing an empty capability set, since a caller might reasonably expect the invitation to carry the intended capabilities.
- Explicit (non-template) capability lists supplied to the invitation-create route are filtered against `CAPABILITY_CATALOG` before being persisted (`handleMembershipInvitationCreate`'s `explicitCapabilities` filter) — an unrecognized capability string in a request body is silently dropped, not stored. This prevents a client from injecting an arbitrary, unvetted capability string into the system, at the cost of the same "silent drop vs. loud rejection" tradeoff noted above.

## 4. Legacy Bearer Token Exclusion — Verified

This is the single most important property this package must hold, per `02d` and the Phase 1 entry checklist ("Shared parish bearer access cannot reach any accounting route, by architectural exclusion, tested"). Verified two ways:

1. **Structurally**: `src/lib/authorization.js` contains no import of, or reference to, `verifyParishDashboardBearer`, `getBearerToken` used against a parish registration, or any other legacy-bearer-checking code. `grep -n "verifyParishDashboardBearer" src/lib/authorization.js src/lib/identity.js` returns nothing.
2. **Behaviorally**: `scripts/identity-tests.mjs`'s `"requireCapability never authorizes from a legacy parish bearer token alone"` test constructs a request shaped exactly like a legacy parish-dashboard request (an `Authorization: Bearer <token>` header, no platform-user email header) and confirms `requireCapability` returns `null`.

The one narrow exception (`requireMembershipManagementContext` accepting the legacy bearer for membership-management routes specifically) is documented in Section 4 of `04-package-0.75c-identity-architecture.md` and is not reachable from, or used by, `authorization.js` — it exists in `src/handlers/identity.js` only, scoped to exactly the two/three membership-management route handlers, none of which are accounting routes.

## 5. Password and Session Handling

- Passwords use PBKDF2 (`createPasswordRecord`/`verifyPasswordRecord`) with a per-record random salt and versioned iteration count — the same primitive already used for the parish-dashboard password and the admin password (the *stronger* of the two password mechanisms already present in this codebase; the donor-side `hashPassword` single-SHA-256 mechanism was deliberately **not** reused here).
- Session tokens are high-entropy random values (`generateSecret`, 24 random bytes hex-encoded); only a salted hash is ever persisted; comparison is constant-time (`secureCompare`).
- Sessions expire (12 hours) and are single-active-session-per-user; issuing a new session invalidates any prior one (no accumulating, un-revocable session list for a platform user in this package — a deliberate simplification, flagged as a limitation in the migration report, not a security gap, since it means a user can never have *more* concurrently-valid sessions than the identity module intends).
- Invitation tokens follow the identical opaque-token-plus-salted-hash discipline — never stored or logged in plaintext.

## 6. Audit Trail Coverage

Every membership-mutating action in `src/lib/memberships.js` calls `recordAuditEvent` (existing central `audit_log`), before returning success to its caller (though `recordAuditEvent` itself is fail-open by design — a logging failure never blocks the underlying privileged action, per `src/lib/audit-log.js`'s own documented contract, which this package inherits rather than overrides). Covered actions: `membership.invitation_created`, `membership.invitation_accepted`, `membership.invitation_revoked`, `membership.status_changed`, `membership.capability_granted`, `membership.capability_revoked`. This satisfies `01-accounting-philosophy.md` Section 22's minimum list ("role changes... mapping changes") for the membership domain specifically — accounting-domain audit events (journal posting, bill approval, etc.) do not exist yet and are out of scope for this package.

## 7. Remaining Risks / Open Items (carried forward, not resolved here)

1. **Invitation-capability-escalation gap** (Section 1) — recommend a bounding rule in Package 0.75D.
2. **Silent-empty-capability-set on an unrecognized role template** (Section 3) — recommend explicit rejection in a later hardening pass.
3. **No reauthentication-for-high-risk-action requirement** — explicitly deferred per the Phase 0.75 readiness report's own package boundaries (Package 0.75D/pilot-readiness item, not this package's scope).
4. **No MFA** — not built, not required by this package's acceptance criteria. Future consideration: platform-user sessions are the identity that will eventually authorize real money-moving actions (check issuance, journal posting) once accounting routes exist; MFA for at least the highest-privilege capabilities (`checks.issue`, `periods.reopen`, `journals.reverse`) should be evaluated before pilot, per `02c`'s pilot-readiness checklist.
5. **No rate limiting was added to `/api/identity/invitations/:token/accept`'s token-guessing surface beyond the existing generic `rateLimit()` helper** (`identity-invitation-accept` bucket, 20/300s) — the token itself is high-entropy (24 random bytes) so brute-forcing it is not practically feasible within any reasonable rate limit, but this is worth re-confirming once real invitation volume exists.
6. **Support-access workflow** (`01` Section 23, `02b` threat #8) — not built in this package, correctly deferred to Package 0.75H per the Phase 0.75 readiness report's own sequencing.
7. **Single-active-session-per-platform-user** (Section 5) — acceptable for this foundational package; worth revisiting if a person needs concurrent sessions across devices before general release.

None of the above block Phase 1 entry per `02c`'s checklist — items 1–2 are refinement items explicitly suited to Package 0.75D ("Capabilities and Authorization Refinement"), and items 3–7 are already correctly sequenced to later packages (0.75D pilot items, 0.75H) in the existing readiness report, not this package's own scope.

## 8. Threat Model Cross-Reference (`02b-accounting-threat-model.md`)

| Threat # | Description | Status after this package |
|---|---|---|
| 1/2 | Cross-parish access via unresolved server-side authorization | **Mitigated** — server-side resolution only, tested |
| 4 | Stolen/reused shared parish bearer token reaching accounting-equivalent data | **Mitigated by architectural exclusion** — no accounting route exists yet, but the exclusion mechanism is built and tested now, ahead of any accounting route needing it |
| 5 | Compromised parish user (stolen platform-user credentials) | **Partially mitigated** — session expiry exists; capability-scoping limits blast radius to whatever that membership was granted; reauthentication-for-high-risk-actions (item 3 above) remains a pilot-readiness item, correctly not required yet |
| 6 | Excessive role assignment ("everyone is treasurer") | **Not addressed by this package** — duty-combination visibility is a Package-0.75D/general-release item per the readiness report; this package does not prevent over-broad grants, only makes them auditable |
| 7 | Privilege escalation from a non-centralized capability model | **Mitigated** — single centralized `authorization.js`, no duplicated checks exist yet to escalate through (no accounting route exists to have duplicated it in) |
| 19 | Broken authorization in service-to-service calls | **Not yet applicable** — no Accounting Gateway/service binding exists yet (Package 0.75E); nothing in this package creates a service-to-service trust boundary |

Threats #3, #8–#18, #20–#24 are unaffected by this package (registry/gateway/R2/background-job/backup threats belong to Packages 0.75E/F/H/I, not identity).
