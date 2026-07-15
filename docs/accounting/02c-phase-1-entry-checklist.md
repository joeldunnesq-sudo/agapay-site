# Phase 1 Entry Checklist

Supporting document to `docs/accounting/02-phase-0.75-foundational-readiness.md` (Section 9). This is the formal gate. Phase 1 (Accounting Control Plane) should not begin until every item under "Before Phase 1 control-plane work" is checked, per this document's own final verdict.

## Before Phase 1 control-plane work begins

- [ ] CI blocks failed tests before any deploy reaches production (Package 0.75A).
- [ ] Stripe financial-event gaps are known and triaged (Package 0.75B / `02a`) — does not require every gap fixed, but every gap must be a documented, deliberate decision (fix now, fix before ledger, or defer with reason), not an unknown.
- [ ] A platform-user identity pattern exists, generalizing the existing donor auth pattern (Package 0.75C).
- [ ] Parish membership is a real, server-verifiable entity — not the shared bearer token (Package 0.75C).
- [ ] Accounting capabilities are enforceable via a centralized, capability-based check (Package 0.75D).
- [ ] Shared parish bearer access cannot reach any accounting route, by architectural exclusion, tested (Package 0.75C/D).
- [ ] Accounting Gateway topology (Option B — dedicated Worker behind a Service Binding) is approved by Joel (Package 0.75E).
- [ ] Local and staging environments can model multiple D1 databases (central + at least two parish accounting test databases) (Packages 0.75G).
- [ ] A background-job primitive is selected for future posting retries/migration fan-out, even if not yet built (Package 0.75F).
- [ ] The central accounting-database registry state machine (lifecycle states, transitions, uniqueness rule) is approved by Joel (Package 0.75E).
- [ ] Threat-model Phase 1 blockers (see `02b`) are remediated or have an approved remediation plan.
- [ ] The backup/restore extension approach for per-parish databases is approved (Package 0.75I).
- [ ] Cross-parish access denial tests exist and pass (Package 0.75D/G).

## Before ledger development (journal entries, posting engine)

- [ ] The dual-posting-trigger ambiguity between `checkout.session.completed` and `payment_intent.succeeded` is resolved (pick one canonical posting trigger) — `02a`.
- [ ] Commerce refund amounts are persisted as an exact, queryable figure — `02a`.
- [ ] Commerce disputes are reflected on `commerce_orders`, not only on `donor_offerings` — `02a`.
- [ ] The posting engine's own idempotency-key design is specified (distinct from platform webhook idempotency, which already exists) — `02a`.
- [ ] Every open accounting-policy question in Accounting Philosophy §31 that is marked "blocks ledger development" is resolved with the design-partner parish and an accountant.

## Before pilot (a real parish's real data)

- [ ] Reauthentication requirements for high-risk actions (check issuance, period reopening, support-access grant) are implemented, not just designed.
- [ ] A dedicated support-access workflow (distinct from ordinary admin auth) exists, is time-limited where practical, and is fully audited.
- [ ] The accounting document R2 bucket exists, private, following the confirmed existing pattern (no public URL, authenticated streaming only).
- [ ] Per-parish backup export and a tested restore path exist for at least one real (or realistic test) accounting database.
- [ ] Staging environment is fully isolated from production (no shared bindings reachable across the boundary), tested.
- [ ] Sensitive-data redaction rules are implemented in structured logging for accounting-specific fields (bank details, tax IDs, check data, invoice contents).
- [ ] Payout event handling exists, or an explicit, approved decision to defer automated payout posting (manual reconciliation instead) is documented.

## Before general release

- [ ] Duty-combination visibility (Accounting Philosophy §23) is implemented for Parish-tier parishes.
- [ ] Queue/workflow-based background processing (not just synchronous processing) exists for posting retries and migration fan-out, if parish volume warrants it.
- [ ] The static-D1-binding scaling trigger (approaching ~1,000 active accounting parishes on the gateway Worker, per `02e`) has a named owner and a standing reminder to revisit, even though no action is needed at current or near-term scale.
- [ ] Aplos migration's checksum/integrity-verification requirement (Accounting Philosophy §25/§26) is implemented, if migration has shipped by this point.

## Explicitly not required before Phase 1

- The chart of accounts, funds, journal entries, the posting engine itself, bank reconciliation, accounts payable, check printing, accounting reports, or any parish accounting user interface — all of this is Phase 1-and-beyond implementation work, not a Phase 1 *entry* requirement. Phase 0.75 exists precisely so that this work has a safe foundation to start from, not so that it starts sooner.
- A resolved decision on Workers for Platforms / dispatch namespaces — not required until AGAPAY approaches the revised scaling trigger (`02e`), which is not expected soon.
- Full resolution of every Accounting Philosophy §31 open policy question — only the subset marked "blocks ledger development" gates ledger work; the rest can be resolved in parallel with early Phase 1 work.
