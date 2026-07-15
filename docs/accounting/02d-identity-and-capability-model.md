# Identity and Capability Model — Design Foundation

Supporting document to `docs/accounting/02-phase-0.75-foundational-readiness.md` (Workstream 3). Design only — no implementation, no final SQL, per Phase 0.75 scope.

## Current identity map (confirmed from repository)

| Identity type | Where implemented | Individual identity? | Session/auth mechanism | Multi-parish? | Used for accounting today? |
|---|---|---|---|---|---|
| **Donor** | `src/handlers/donor.js`, `requireDonor` (`src/handlers/parish.js:264–275`) | **Yes — the strongest identity primitive already in the codebase.** Keyed by verified email; session is a per-donor hashed token (`hashSessionToken`, salted) with expiry, compared via constant-time comparison | Bearer token + `X-AGAPAY-Donor-Email` header, checked against a stored salted hash, with an expiry check | A donor's `default_parish_id` suggests single-default-parish framing, though donor offerings carry a `parish_id` per gift, so a donor can give to more than one parish without a formal "membership" record | No — donors are givers, not accounting actors |
| **Admin** | `src/handlers/admin.js`, `requireAdminContext`/`requireAdmin` (`src/handlers/parish.js:294–309`) | **No** — single shared admin password (with a session mechanism layered on top, `resolveAdminSession`) or a static `AGAPAY_ADMIN_TOKEN` fallback; the resulting `actor` field is a free-text display string (defaults to `"Admin"`), not a stable per-person ID | Session token resolved via `resolveAdminSession`, or direct password comparison, or a static shared token fallback | N/A — admin is platform-wide, not parish-scoped | Yes, today's only privileged actor for financial-adjacent actions (subscription checkout, Stripe onboarding, refresh) — and the audit trail already threads an `actor` string through `appendAdminAudit` calls, but that string is not a verifiable individual identity |
| **Parish dashboard** | `verifyParishDashboardBearer` (`src/handlers/parish.js:195`), used throughout `parish.js`'s `require*ParishContext` gates | **No — confirmed, this is the Phase 0 finding, unchanged by this deeper look.** One shared `parishDashboardToken` per parish (`registration.parishDashboardToken`), generated once (`crypto.randomUUID()`, e.g. `src/handlers/stripe.js:791`) | Bearer token compared against the one token stored on the parish's registration record | N/A by construction — the token *is* the parish, not a person | This is the access model any future accounting UI would inherit if not replaced — **explicitly insufficient per Accounting Philosophy §23** |
| **Learn (homeschool) users** | `src/learn/access.js`, `src/learn/handlers.js` | Not fully traced in this pass; sampled evidence suggests Learn has its own household/family-scoped access model layered on top of donor or a Learn-specific customer identity, distinct from parish-dashboard access | Not fully traced | Not applicable to accounting | No |
| **"Household"** | Appears only as a **display-name field** on a donor record (`householdName`, `src/handlers/donor.js`) and as a reporting join key (`household_pledges` table) | No — not a membership entity, just a label a donor can set for how they want to be addressed/grouped in stewardship reporting | N/A | N/A | No — this is not a multi-person account structure and should not be treated as one |

**Confirmed: no existing membership entity anywhere in the codebase** linking a specific person to a specific parish with a specific role. The closest analog — donor-to-parish association via `donor_offerings.parish_id` — is a record of *giving history*, not a membership/authorization relationship, and carries no role or capability information.

**Confirmed: `server.mjs` (local dev) hardcodes a single local-preview donor identity** (`localPreviewEmail = "preview@agapay.local"`, `localPreviewToken = "agapay-local-preview"`) and does not simulate admin, parish-dashboard, or any future membership identity locally — relevant to Workstream 8, noted here because it also means there is no existing local pattern to imitate for a new identity type.

## Design target: AGAPAY Platform Identity and Parish Membership

### Individual identities

Every accounting action must be attributable to a specific authenticated person or system actor (Accounting Philosophy §22, §23). The donor identity pattern already in this codebase — verified email, salted hashed session token, expiry, constant-time comparison — is the right *shape* to generalize into a platform-wide user identity, rather than building something unrelated from scratch. The recommendation is **not** to reuse the donor table itself (donors and parish staff are different populations with different lifecycle needs), but to extract the same authentication *pattern* into a new, general-purpose platform-user entity that donor accounts, parish staff accounts, and (eventually) admin accounts can all be built on, rather than each maintaining its own bespoke auth code as they do today.

### Parish memberships

A person may belong to one or more parishes, with different capabilities at each. A membership entity conceptually needs: which person, which parish, which capabilities (or which role template, expanded to capabilities), a status (active/invited/revoked — see below), and an audit trail of who granted/changed it and when.

### Capability-based authorization

Role names (Rector, Treasurer, Bookkeeper, AP Clerk, Bill Approver, Check Preparer, Check Signer, Parish Council Viewer, Accountant, Auditor) are **convenience bundles**, not the authorization mechanism itself. Every sensitive check in code tests a **capability** (e.g., `bills.approve`), never a role name string. This is what allows a small mission to assign one person every capability without the system needing a special "small mission mode," and what allows a larger parish to split the same capabilities across several people without any code change — the role/capability distinction does the work, not a tier flag.

### Suggested initial capability catalog (extensible, not final)

`accounting.view`, `accounting.configure`, `accounts.manage`, `funds.manage`, `journals.create`, `journals.post`, `journals.reverse`, `periods.close`, `periods.reopen`, `vendors.manage`, `bills.create`, `bills.approve`, `payments.prepare`, `checks.issue`, `checks.print`, `checks.void`, `reconciliations.manage`, `reconciliations.reopen`, `reports.view`, `reports.export`, `accounting.audit.view`, `accounting.backup.export`, `accounting.support_access`.

This list is deliberately not finalized — later phases (AP, check printing, reconciliation) will need finer-grained capabilities than can be usefully predicted here. The requirement is that the **catalog be extensible without a breaking schema change** — i.e., capabilities should be represented as data (rows/strings), not as a fixed enum baked into application logic, so adding `checks.reissue` later doesn't require a migration that touches every existing membership row.

### System actors

Non-human actors that need identity for audit purposes: the **Stripe posting service** (whatever process eventually turns a claimed Stripe event into a journal entry), the **migration service** (Aplos import), the **backup service**, and **AGAPAY support administrators** (a human, but acting through an exceptional, time-limited, fully audited path — Philosophy §23 — distinct from ordinary parish-actor access). Each of these needs to appear as a distinct, identifiable `actor_type` in audit records (the existing central `audit_log` table already has an `actor_type` column with `admin | parish | donor | system` per Phase 0's findings — extending its value set to include a `support` distinction, or a `service` distinction per system actor, is a natural, low-cost extension rather than a new mechanism).

## Required design decisions (with recommended defaults)

| Decision | Recommendation | Rationale |
|---|---|---|
| Extend donor/user identities, or build a general platform-user model? | **Build a general platform-user model**, informed by the donor auth *pattern* but not built on the donor *table*. | Donors and parish staff are different populations (a donor is not necessarily parish staff, and vice versa); conflating them would either weaken donor privacy assumptions or bolt awkward parish-role fields onto a donor-shaped table. |
| Does shared parish bearer access remain available for non-accounting features? | **Yes, temporarily**, for existing non-accounting parish-dashboard features (sacraments, settlement-profile configuration, etc.) that already depend on it — ripping it out platform-wide is a larger, riskier change than this phase should force. | Minimizes blast radius; the accounting domain doesn't need to wait for a platform-wide auth migration. |
| Must shared bearer access be blocked entirely from accounting routes? | **Yes, absolutely, from day one of any accounting route existing.** | Non-negotiable per Accounting Philosophy §22/§23 — accounting actions must be attributable to an individual, which a shared token structurally cannot provide. |
| Invitation and acceptance workflow | A parish-side capability-holder (or an AGAPAY admin during initial rollout) sends an invitation tied to an email address; the invited person accepts by creating or linking their platform-user identity, at which point a membership record activates. | Standard, low-risk pattern; avoids any workflow where a membership becomes active without the invited person's own action. |
| Membership status | At minimum: `invited`, `active`, `suspended`, `revoked`. | Mirrors the lifecycle-state discipline already recommended for the accounting-database registry (Workstream 5) — consistent modeling across the platform. |
| Role templates vs. custom capability assignments | **Both** — role templates as a convenience default at invitation time, with the ability to add/remove individual capabilities afterward. | Matches "role names alone are insufficient" (Philosophy §23) while not forcing every parish admin to hand-pick capabilities one by one for the common case. |
| How are capability changes audited? | Every grant/revoke is a central audit-log event (`role change`, per Philosophy §22's required audit categories), including actor, target person, parish, before/after capability set, and timestamp. | Directly required by the Philosophy; no judgment call here. |
| How does removal from a parish invalidate access? | Revoking a membership must take effect for the *next* request, not merely hide UI — enforcement happens at the authorization check on every accounting-domain call, not by trusting a cached session claim. | Prevents a stale session from outliving its authorization. |
| How is support access approved and time-limited? | A distinct, explicitly-invoked support-access grant (not the ordinary membership mechanism), created with a reason, and — wherever the platform can practically implement it — an expiry, fully logged both centrally and (per Accounting Philosophy §22) in the parish-local audit trail. | Directly required by Philosophy §23/§32 invariant 15. |
| How are service/system actors represented? | As their own `actor_type` values in audit records, with credentials that are Wrangler secrets or bindings, never a human-style login. | Keeps human and machine actors distinguishable in every audit trail, per Philosophy §22. |
| Do high-risk actions require reauthentication? | **Recommended yes** for a short, specifically-enumerated set of actions (e.g., check issuance, period reopening, support-access grant) — not defined exhaustively here, deferred to Phase 1 design once the capability catalog is more concrete. | Reduces the blast radius of a hijacked-but-otherwise-valid session for the highest-consequence actions, without demanding reauthentication for routine work. |
| Does check-signing capability mean digital authorization, physical signature authority, or both? | **Open question — flagged for human decision, not resolved here.** A `checks.issue` capability clearly authorizes the *digital* accounting event; whether AGAPAY's system should also model "who is authorized to physically/legally sign this parish's paper checks" as a distinct fact is a parish-governance question, not a software one, and depends on how literally AGAPAY wants to mirror bank-signature-card practice. | See Section 10 of the master report (Human Decisions Required). |

## Authentication flow (target, high level)

1. Person authenticates as a platform user (mechanism modeled on the existing donor pattern: verified identifier + salted hashed session token + expiry).
2. Every accounting-domain request carries that session's token, never a parish-shared token.
3. The accounting domain resolves the session to a specific platform-user identity server-side — never trusting a client-asserted user ID.

## Authorization flow (target, high level)

1. Given a resolved platform-user identity and a requested parish context, look up that person's membership(s) for the target parish.
2. Confirm membership status is `active`.
3. Test the specific capability required for the requested action against that membership's capability set.
4. Only then resolve the target parish's accounting database via the central registry (Workstream 5) and proceed — capability check happens **before** database resolution, never after or in parallel, so an unauthorized request never reaches a parish's accounting binding at all.

## Transition strategy from shared bearer access

1. Build the new platform-user/membership model as a genuinely new, additive system — it does not require removing `verifyParishDashboardBearer` or its callers on day one.
2. Gate every new accounting route behind the new model exclusively, from the first accounting route that ships — never behind the shared bearer token, not even temporarily "to move faster."
3. Existing non-accounting parish-dashboard routes continue using the shared bearer token until a separate, later, explicitly-scoped project migrates them — that migration is out of scope for Phase 0.75 and for the accounting program generally, since those routes carry no accounting risk today.

## Security risks specific to this design

- A membership model that trusts a client-supplied parish ID instead of resolving membership server-side would recreate the exact cross-tenant risk this whole program exists to close — must be tested explicitly (Workstream 8's cross-parish denial tests).
- A capability catalog implemented as hardcoded string checks scattered across handlers (rather than data-driven and centrally enforced) would silently reproduce today's "financial logic duplicated across routes" anti-pattern (Accounting Philosophy §29, item 13) inside the *authorization* layer instead of the posting layer — equally prohibited.
- An invitation flow that activates a membership before the invited person confirms their own identity would allow a parish admin to grant capabilities to an email address that isn't actually verified to belong to the intended person.

## Required tests (design-level, not written here)

- Cross-parish denial: a valid, active membership at Parish A must be rejected when used against Parish B's accounting routes.
- Revoked-membership denial: access must be rejected on the request immediately following revocation, not merely after a session naturally expires.
- Capability-boundary tests: a membership with `bills.create` but not `bills.approve` must be able to do the former and rejected on the latter.
- Shared-bearer-token rejection: any accounting route, called with a valid parish-dashboard bearer token but no platform-user session, must be rejected.

## Acceptance criteria

- [ ] A platform-user identity pattern is designed (not yet implemented) generalizing the existing donor auth pattern.
- [ ] A parish-membership entity design exists, capturing person, parish, capability set, and status, without final SQL.
- [ ] The initial capability catalog is documented as extensible data, not a fixed enum.
- [ ] Every accounting route's authorization design explicitly excludes the shared parish bearer token.
- [ ] Every open decision above is either resolved by Joel or explicitly carried into Section 10 of the master report as a pending human decision.
