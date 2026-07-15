# AGAPAY Accounting Phase 0.75 — Foundational Readiness

**Method:** Full (not sampled) read of `src/handlers/stripe.js` and its fee-capture/idempotency dependencies; targeted full reads of CI/deployment configuration, auth/identity code, `wrangler.toml`, and `server.mjs`; live verification of current Cloudflare D1, Service Binding, and Workers for Platforms documentation (fetched 2026-07-15; source pages dated Apr 21–23, 2026). Supporting documents: `02a` (Stripe matrix), `02b` (threat model), `02c` (Phase 1 entry checklist), `02d` (identity/capability model), `02e` (Cloudflare topology options).

---

## 1. Executive Summary

**Phase 1 cannot begin immediately.** Not because the codebase is in bad shape — it isn't — but because three real, confirmed gaps sit directly between "current state" and "safe to provision a parish's authoritative accounting database": there is no individual identity/capability model for parish actors, CI does not block a failing test from reaching production, and a previously undocumented workflow file (`.github/workflows/deploy.yml`) auto-applies D1 migrations to production on every push with no gate at all. None of these require a large rewrite. All three are scoped into small packages below.

- **Recommended Accounting Worker topology:** unchanged from Phase 0 — a dedicated Accounting Gateway Worker behind a Service Binding, static D1 bindings. What's new: live Cloudflare documentation confirms this scales to roughly **5,000 D1 bindings per Worker** and **50,000 databases per account**, not the "low tens" Phase 0 assumed. This materially de-risks the architecture and removes urgency from evaluating Workers for Platforms. See `02e`.
- **Recommended identity and permission foundation:** a new, general platform-user identity, modeled on the authentication *pattern* already used for donor accounts (verified identity, salted hashed session token, expiry) — not bolted onto the donor table itself — paired with a parish-membership entity and capability-based (not role-name-based) authorization. See `02d`.
- **Recommended background-job primitive:** none needs to be *built* in Phase 0.75, but Cloudflare Queues is the recommended eventual primitive for posting retries and migration fan-out (Section 4, Workstream 6) — chosen now, built later.
- **Recommended staging model:** a formally declared Wrangler environment separation that does not exist today (confirmed: `wrangler.toml` has no `[env.*]` blocks) — central to closing the single highest-severity *new* finding of this phase (below).
- **Largest unresolved risks:** (1) the auto-migrating, ungated production deploy pipeline (Workstream 1); (2) the complete absence of individual parish-actor identity (Workstream 3); (3) two confirmed Stripe-handling gaps — commerce disputes not reflected on commerce orders, and a dual-event posting-trigger ambiguity — that must be resolved before ledger development, though not before Phase 1 control-plane work (Workstream 2 / `02a`).
- **Minimum readiness work before ledger development:** Packages 0.75A through 0.75E (CI safety, Stripe completeness, identity, capabilities, gateway architecture) — see Section 6 for exact scope, and Section 9 / `02c` for the formal entry checklist.

## 2. Governing Documents

`docs/accounting/00-phase-0-architecture-audit.md` established the current-state facts this phase builds on (single Worker, single D1, no queues, no formal staging, shared-bearer parish auth). `docs/accounting/01-accounting-philosophy.md` is binding doctrine — every recommendation below was checked against it, and none contradicts it. Where this phase's findings sharpen or correct a Phase 0 assumption (the CI workflow location, the D1 binding scaling ceiling, the Stripe fee-capture status), that correction is stated explicitly rather than silently superseding the earlier document — Phase 0 remains the historical record of what was found at that time; this document is what's found now.

## 3. Confirmed Current State

- **The actual GitHub Actions workflow is `.github/workflows/deploy.yml`**, not the `workflows/deploy.yml` Phase 0 examined (that file also exists but GitHub only executes workflows under `.github/workflows/`). The real deploy workflow: on every push to `main`, runs `wrangler d1 migrations apply agapay-production --remote` **unconditionally**, then deploys the Worker. **No test step runs in this workflow at all.**
- **A second workflow, `.github/workflows/smoke-check.yml`, does run `npm run check`** (the full custom test-script suite) — but only on manual `workflow_dispatch`, never automatically, and never as a gate on the deploy workflow.
- **Stripe fee/gross/net capture is confirmed present and good**, sourced from Stripe's own Balance Transaction object via `stripePaymentIntentFinancialUpdates` (`src/handlers/parish.js:1452–1511`) — this corrects Phase 0's "unconfirmed" flag on this point.
- **Stripe refund and dispute handling is confirmed present** for the giving path; **confirmed absent for the commerce path's dispute case specifically** (disputes update `donor_offerings` but never `commerce_orders`) — a new finding, not previously identified.
- **No Stripe payout event handling exists anywhere** (`payout.created`/`.paid`/`.failed`) — confirmed by exhaustive search, zero matches.
- **Webhook idempotency is confirmed strong**: `stripe_events` table with a unique-constraint claim (`INSERT ... ON CONFLICT DO NOTHING`), stale-processing recovery, and failed-event retry — this is real, reusable infrastructure.
- **Donor identity is confirmed to be a genuine individual-identity pattern already in the codebase** (verified email, salted hashed session token, expiry, constant-time comparison) — a better foundation to generalize from than Phase 0's framing suggested, which focused only on the *absence* of parish-staff identity without noting the donor pattern's reusability.
- **Parish-dashboard identity is confirmed to remain a single shared bearer token per parish**, unchanged from Phase 0's finding.
- **No formal Wrangler environments exist** (`wrangler.toml` has no `[env.staging]` or equivalent) — confirmed, unchanged from Phase 0.
- **`server.mjs` (local dev) does not use `wrangler dev`, Miniflare, or model any D1/binding behavior at all** — confirmed; it's a plain Node `http` server that imports handler functions directly and hardcodes a single local-preview donor identity.
- **No Cloudflare Queues, Workflows, or dispatch namespaces exist** — confirmed, unchanged from Phase 0. One cron trigger only.
- **Commerce order records (`commerce_orders`) are fully normalized, relational tables** with real typed columns (`stripe_fee_cents`, `tax_cents`, `parish_net_cents`, etc.) — this is a better data-modeling pattern than the "row + JSON blob" pattern used elsewhere in the codebase, and worth explicitly imitating for accounting tables rather than assuming the JSON-blob pattern is AGAPAY's only house style.
- **D1 binding/scaling limits, verified live against current Cloudflare documentation**: ~5,000 bindings per Worker script, 50,000 databases per account, 10 GB per database, single-threaded per database, six simultaneous connections per Worker invocation. This is a significant, sourced correction to Phase 0's unverified scaling assumption. Full detail in `02e`.
- **Service Bindings are confirmed to add zero latency** (same-thread execution by default) and to support local development (two `wrangler dev` sessions, or an experimental multi-config flag) — confirms Phase 0's Accounting Gateway recommendation is technically sound on current Cloudflare capabilities, not just plausible.
- **Workers for Platforms is confirmed, by its own documentation, to be designed for running third-party/untrusted code** — a mismatch for AGAPAY's actual need (same trusted code, many tenants), which lowers the priority of ever adopting it relative to Phase 0's framing.

## 4. Foundational Workstream Findings

### Workstream 1 — CI and Deployment Safety
Full findings in Section 6, Package 0.75A. Headline: the real production deploy pipeline both applies migrations and deploys code, automatically, on every push to `main`, with no test gate whatsoever — a materially more urgent finding than Phase 0's "no CI gate" note conveyed, because Phase 0 was looking at the wrong (unused) workflow file.

### Workstream 2 — Complete Stripe Financial Event Audit
Full findings in `02a`. Headline: fee/gross/net capture is solid; two real gaps (dual posting-trigger risk, commerce dispute handling) must close before ledger development, not before Phase 1; payout events are entirely unhandled but only block automated payout-side posting, not donation/fee posting.

### Workstream 3 — Identity, Parish Membership, Roles, and Capabilities
Full findings and design in `02d`. Headline: no membership entity exists today in any form; the donor auth pattern is a strong, reusable foundation for a new general platform-user identity; capability-based (not role-name) authorization is required by the Philosophy and is the recommended design.

### Workstream 4 — Accounting Worker Topology and D1 Access
Full findings in `02e`. Headline: Option B (dedicated gateway Worker, Service Binding, static bindings) remains the recommendation, now backed by verified current Cloudflare limits showing it scales roughly two orders of magnitude further than Phase 0 assumed.

### Workstream 5 — Accounting Control-Plane Registry Design
No dedicated supporting document (design is compact enough for the master report). Conceptual entities: an **accounting entity record** (one per parish that has activated accounting) and an **accounting database registry row** (parish_id, environment, database identifier, binding/routing name, schema version, migration status, backup status, subscription tier/entitlement, activation/suspension dates, last validation date, provisioning error detail, health status) — both living in central `AGAPAY_DB`, never in a parish's own accounting database (a parish's database cannot be authoritative for its own routing information, or resolution becomes circular).

**Recommended lifecycle state machine** (simplified from the prompt's suggested list, per the instruction that a smaller, clearer machine is preferable where justified):

```
not_requested → requested → provisioning → schema_validating → active
                                  ↓                                ↓
                              provisioning_failed              suspended
                                                                    ↓
                                                                archived
     (any active state) → migration_pending → migration_failed (quarantined, does not auto-resume)
                                              → active (on success)
     (any active/suspended state) → restore_pending → recovery_mode → active (on validated success)
```

Collapsing the prompt's longer suggested list (`deactivating` as a distinct state from `suspended`→`archived`, for instance) is a judgment call favoring a state machine small enough to reason about correctly; if a real operational need for a distinct "deactivating" transitional state emerges in Phase 1 design, it can be added then — this is a starting proposal, not a final schema.

**Required rules** (restated from the prompt as firm requirements, all consistent with the Philosophy): exactly one `active` accounting database per accounting entity, enforced by a uniqueness constraint, not application discipline alone; provisioning is idempotent (a replayed request is a safe no-op); no client-supplied physical database identifier is ever accepted; no transition into `active` without `schema_validating` succeeding first; no accounting writes are permitted while in `migration_pending`, `migration_failed`, `restore_pending`, or `recovery_mode`; every registry state transition is a central audit event; database deletion is never automatic — `archived` is a state, not a deletion; an `archived` tenant's data remains exportable.

**Phase 1 migration boundary:** this workstream defines the registry's *shape*; Phase 1 writes the actual migration SQL creating these tables in central `AGAPAY_DB`. No SQL is written here, per Phase 0.75 scope.

### Workstream 6 — Background Jobs, Queues, and Workflows
No Cloudflare Queue, Workflow, or Durable Object exists in this codebase today (confirmed). Comparing primitives for the use cases in scope:

| Use case | Recommended primitive | Rationale |
|---|---|---|
| Parish database provisioning + retries | **Cloudflare Queues** | Discrete, retryable units of work with natural dead-letter semantics; provisioning is not latency-sensitive |
| Schema migration fan-out | **Cloudflare Queues**, one message per (parish, migration) pair | Same reasoning; allows partial-failure visibility per parish rather than an all-or-nothing script run |
| Stripe accounting-source-event delivery to the future posting engine | **Cloudflare Queues** | Decouples webhook receipt (must respond to Stripe quickly) from posting (may need registry resolution, retries) — but per Accounting Philosophy §10, **the queue message is never itself the accounting fact**; only the posting engine's actual D1 write is |
| Posting retries | Queues, with the posting engine's own idempotency key (not the platform webhook idempotency key) preventing double-posting on redelivery | Directly required by Philosophy §10/§28 |
| Report generation, monthly treasurer packets | **Cron Triggers** (already in use for one weekly job) for the schedule, dispatching into a Queue for the actual generation work if generation is slow enough to risk a Worker timeout | Keeps the existing, working cron pattern; adds a queue only where a single request's time budget is a real risk |
| Aplos import | **Workflows** (not Queues) — this is a genuinely long-running, multi-step, resumable process (staging → validation → mapping → treasurer approval → posting), which is exactly Workflows' intended shape, distinct from Queues' discrete-message model | Not built in this phase; named here as the recommended primitive when import is designed |
| Backup exports, restore validation | **Cron Triggers** for schedule, **Queues** for the per-database export/validation work itself | Mirrors the report-generation reasoning |
| Derived-balance rebuilds | **Queues**, triggered on demand (admin action) or on a schedule | Rebuilds are idempotent by nature (Philosophy §21) and fit the discrete-message model |

**Minimum initial background infrastructure for Phase 0.75:** none needs to be *created* now (per the prompt's explicit constraint) — the deliverable of this workstream is the primitive selection above and the design principles below, so that Phase 1's registry design (Workstream 5) and Phase 1's Stripe-to-posting design (once ledger work begins) are built against a chosen primitive rather than an undecided one.

**Required design principles** (restated as firm requirements): background messages never become accounting facts by merely existing in a queue (Philosophy §10); posting remains idempotent regardless of redelivery; failed work is visible (a dead-letter queue or equivalent, actually monitored, not just configured); retry policy is explicit and bounded (poison messages do not retry forever silently); every message carries a correlation ID connecting the originating operational event, the job, and any resulting posting; a job cannot choose an arbitrary parish database — it is tenant-authorized and registry-resolved exactly like a synchronous request would be, never given a raw binding name; provisioning/migration jobs are resumable or safely restartable, not "run once and hope."

### Workstream 7 — Staging and Environment Separation
**Confirmed current state:** no formal Wrangler environments, no staging D1, no staging KV, no staging R2, no documented Stripe test-mode separation strategy (Stripe test/live mode itself is a Stripe-account-level concept, not confirmed either way from this repository alone), no test-parish records, no isolated migration workflow. This is the same conclusion Phase 0 reached, reconfirmed.

**Target:** four named environments — local, automated-test, staging, production — each with its own Worker deployment (where practical; local doesn't need a real Cloudflare deployment), its own central D1, its own parish accounting test D1 databases, its own R2 accounting bucket, its own future Queue/Workflow bindings, its own secrets, and Stripe test mode strictly outside production. The hard requirement, restated from the prompt and directly required by Accounting Philosophy §24's isolation principle applied to environments rather than just tenants: **no possibility of staging code writing to a production accounting database** — this must be structurally true (different bindings entirely), not merely policy.

**Naming convention (proposed):** `agapay-production` (existing, unchanged), `agapay-staging`, `agapay-test` for central databases; a clear, consistent parish-accounting-database naming scheme once Workstream 5's registry exists (e.g., environment prefix + parish identifier) so a database's environment is legible from its name alone, as a defense-in-depth readability measure (not a security control by itself).

**Test-parish strategy:** at least two synthetic parishes in staging/test environments specifically for cross-parish isolation testing (Workstream 8), never real parish data.

**Migration-testing strategy:** every accounting migration runs against staging (and its own set of parish test databases) before it's eligible to run against production, formalizing what the existing `docs/BACKUP_RESTORE_RUNBOOK.md` restore-test-database pattern already does informally for the central database.

**Production-promotion process:** not fully designed here (deferred, consistent with "do not implement" for this phase) — the requirement is that promotion is a deliberate, gated action, not a side effect of merging to `main` (directly tied to Package 0.75A's CI-safety findings).

### Workstream 8 — Local Development and Test Harness
**Confirmed:** `server.mjs` does not use Miniflare or `wrangler dev`; existing tests (`scripts/check.mjs` and siblings) are source-scanning assertion scripts (they read files as text and assert on their content, e.g. `assert.ok(wrangler.includes('binding = "AGAPAY_DB"'))`), **not integration tests that run against a real or simulated D1** — this is a materially different (weaker) testing posture than "tests run against actual D1" might suggest, and is worth stating plainly: today's `npm run check` proves the source code *contains* certain patterns, not that the application *behaves* correctly against a database. No multiple-D1-binding local representation exists. No Service Binding local exercise exists (nothing to exercise yet). No Stripe webhook fixtures were found in this pass. No R2 mocking was found; not confirmed whether any test touches real R2. **The current test architecture cannot prove tenant isolation** — there is no test today that even models two distinct tenants to attempt (and require failure of) cross-tenant access.

**Recommended local runtime:** `wrangler dev`, specifically because it's the only path (per `02e`) that can genuinely exercise Service Bindings and multiple D1 bindings locally, which `server.mjs` structurally cannot do without a substantial rewrite of its own approach.

**Should `server.mjs` be retained, extended, or replaced for accounting development?** **Retained, unchanged, for existing non-accounting local development** (no reason to disrupt a working setup for unrelated features) — **but accounting-domain local development should use `wrangler dev` from the start**, as its own parallel local-dev path, rather than trying to retrofit binding simulation into `server.mjs`. This avoids a large, risky rewrite of the existing local-dev harness while giving accounting development the tooling it actually needs.

**Fixture strategy:** captured, realistic Stripe webhook payload fixtures for each event type in `02a`'s matrix, particularly the two flagged gap rows (dual-trigger donation completion, commerce dispute), to make the eventual remediation testable rather than theoretical.

**Multi-database test strategy:** local `wrangler dev` sessions bound to at least a central test D1 and two distinct parish test D1 databases, matching the staging-environment test-parish strategy above so the same fixtures/tests can run in both.

**CI integration:** once `wrangler dev`-based accounting tests exist, they run in the CI gate designed in Package 0.75A alongside the existing `npm run check` suite — not as a separate, optional pipeline.

### Workstream 9 — Audit, Observability, and Incident Readiness
**Confirmed:** structured logging exists (`src/lib/logging.js`, used throughout `stripe.js` with `requestId`, `route`, `severity`, `retryable` fields — a genuinely reasonable existing pattern); a central, append-only `audit_log` table exists (Phase 0 finding, reconfirmed) with `actor_type`, `organization_id`, `ip_hash` (not raw IP — a good existing practice), and before/after summary fields; Stripe webhook diagnostics exist within the structured-logging pattern already noted; admin diagnostics, failed-email reporting, and any external monitoring provider were not confirmed either way in this pass (not found, but not exhaustively searched for either — flagged as an open verification item, not a confirmed absence).

**Required foundations before accounting data exists:** correlation IDs already exist as a pattern (`requestId` in Stripe handling) and should extend to accounting-related requests and future jobs by the same convention, not a new one; a central audit event for control-plane (registry) actions and a parish-local audit event for future accounting actions (per Accounting Philosophy §22's central-vs-parish-local distinction); provisioning-failure, migration-failure, and (once it exists) queue/workflow-failure visibility that a human will actually see, not just a log line; Stripe source-event backlog visibility (how many claimed-but-unprocessed events exist, once a posting queue exists); support-access visibility (tied to Workstream 3's dedicated support-access workflow); environment identification in every log line (which environment produced this log — directly useful for Workstream 7's isolation goals); an explicit redaction rule set for accounting-specific sensitive fields (bank details, tax IDs, full check data, sensitive invoice contents) — **not yet defined anywhere in the codebase**, a real gap; alerting thresholds and an incident-response runbook extending the existing `docs/launch-incident-runbook.md` pattern (confirmed to exist from Phase 0's repository map) to accounting-specific incident types.

### Workstream 10 — Accounting R2 Storage Foundation
**Recommendation: one dedicated private bucket** (`agapay-accounting-documents`) **with typed key prefixes**, rather than several separate buckets — consistent with the existing pattern of one bucket per *sensitivity class* (`TAX_EXEMPTION_DOCS`, `GIVING_STATEMENTS` are each single-purpose but share the same private-access discipline) while avoiding proliferating bucket count for what are, functionally, several document types with the same access-control shape. A separate, distinctly-named bucket for backups (`agapay-accounting-backups`) is warranted, specifically because backup-object immutability and retention policy are different concerns from working-document access and benefit from being unable to accidentally share a lifecycle/retention rule with everyday documents.

**Object-key convention (proposed):** `{parish_id}/{document_type}/{opaque_random_id}` — combining the existing opaque-random-key discipline (`generateStorageKey()` pattern, confirmed strong) with a parish-scoped prefix for defense-in-depth (Phase 0 flagged the *lack* of parish-scoping in existing keys as a Medium finding; this corrects it for the new bucket without weakening the existing opaque-token security property).

**Metadata convention:** parish ownership, document type, and the central-D1 (or parish-D1, once it exists) record ID it supports, stored as R2 object metadata *and* redundantly as a database row — so ownership can be verified without trusting metadata alone (defense in depth against a metadata-write bug).

**Authorization flow:** identical in shape to the existing `TAX_EXEMPTION_DOCS`/`GIVING_STATEMENTS` pattern — authenticated, parish-scoped check before every stream-out, never a bare key lookup.

**Content-type validation, size limits, malware considerations:** not fully designed here; flagged as needing explicit limits before the bucket is created (a generic "reasonable PDF/image size cap" is not sufficient specification for implementation).

**Checksums:** recommended for backup and migration objects specifically (per Accounting Philosophy §25/§27), optional but not required for everyday working documents.

**Deletion/retention, orphan-object cleanup:** deferred to Phase 1 policy decision (ties into Accounting Philosophy §31's open question about document retention having potential legal/tax significance — not resolved here).

### Workstream 11 — Backup, Restore, and Migration-Orchestration Foundations
**Confirmed:** `docs/BACKUP_RESTORE_RUNBOOK.md` documents a real, working process for the central database — `wrangler d1 execute --remote` exports, a dedicated restore-test database, `wrangler d1 migrations list` drift checks, and row-count spot checks across key tables. This is a genuinely strong foundation, not a gap.

**Foundation needed to extend this per-parish:** the same export/restore/drift-check discipline, parameterized by parish/database rather than hardcoded to `agapay-production` as the runbook currently is (a documentation and light-scripting change, not a new invention); a pre-restore snapshot taken automatically before any restore overwrites current data (Philosophy §27 requirement, not yet a stated step in the existing runbook — worth adding even for the central database, not just parish databases); restore to an isolated validation target before any restore is trusted (the existing runbook's restore-test-database pattern already does this — extend the same pattern per parish); post-restore validation — deferred to "structural readiness only" per this phase's explicit scope constraint, since no ledger exists yet to validate against; migration fan-out across parish databases, with a canary-migration strategy (apply to one or a small number of parishes first, verify, then proceed) rather than an all-at-once fan-out, directly mitigating threat #22 in `02b`; a schema-version registry — this is exactly the `schema_version` field already proposed in Workstream 5's registry design, not a separate mechanism; drift detection — comparing each parish database's actual applied-migration state against the registry's recorded state, surfaced visibly (not silently) when they diverge; parish self-export and archived-tenant export, both required by Accounting Philosophy §26/§27, not designed in detail here.

### Workstream 12 — Security Threat Model
Full findings in `02b`. Headline: 24 threats catalogued; ten Phase-1 blockers (mostly identity/authorization/registry-integrity, i.e., exactly Workstreams 3 and 5); the single most severe *newly confirmed* risk is the auto-migrating, ungated production deploy pipeline (Workstream 1), which is not itself in the prompt's suggested threat list but is arguably more immediately actionable than several that are.

## 5. Architecture Decisions

| Decision | Alternatives considered | Recommendation | Rationale | Consequence | Human approval required? |
|---|---|---|---|---|---|
| Accounting Worker topology | A (in-Worker), B (gateway + Service Binding), C (REST API), D (Workers for Platforms) | **B** | Strongest isolation available without adopting a mismatched product (D); confirmed zero added latency; confirmed scales to thousands of parishes | One new deployable to operate; local dev needs its own `wrangler dev`-based path | **Yes** |
| Background-job primitive | Queues, Workflows, Cron, Durable Objects, synchronous-only | **Queues for discrete retryable work; Workflows reserved for Aplos import specifically; Cron retained for scheduling** | Matches each use case's actual shape rather than forcing one primitive everywhere | Requires learning/operating two Cloudflare primitives eventually, not just one | **Yes**, before either is actually built (not required for Phase 0.75 itself) |
| Identity foundation | Extend donor table, extend admin auth, build new general platform-user model | **New general platform-user model, patterned on donor auth** | Donors and parish staff are different populations; conflating risks weakening either | A genuinely new identity system to design and build — the single largest piece of net-new work in this phase's recommendations | **Yes** |
| Shared parish bearer token's fate | Remove entirely now, keep for non-accounting only, keep everywhere | **Keep for existing non-accounting features; architecturally excluded from every accounting route** | Minimizes blast radius of this phase; a platform-wide auth migration is a separate, larger project | Two auth systems coexist for a period — acceptable given the strict exclusion boundary | **Yes** (confirms scope, not a design question) |
| Registry state machine | The prompt's longer suggested list vs. a smaller one | **Smaller, collapsed machine** (Section 4, Workstream 5) | Easier to reason about correctly; can be extended later if a real need emerges | Slight risk of needing to add a state later — acceptable, additive change | **Yes** |
| R2 bucket structure | One bucket per document type vs. one bucket with typed prefixes plus a separate backup bucket | **One documents bucket with prefixes, one separate backup bucket** | Matches existing single-purpose-bucket-per-sensitivity-class pattern without over-proliferating buckets | — | **Yes** |
| CI gate scope | Block on existing `npm run check` only vs. also require the (not-yet-built) accounting-specific tests once they exist | **Block on `npm run check` now; extend the same gate to accounting tests as they're written, never a separate optional pipeline** | Keeps one CI story, not two | — | No (implementation detail, not a policy choice) |
| Production deploy trigger | Remain push-triggered vs. become approval-gated | **Remain push-triggered, but only after the test gate is added and passes** — not immediately switching to manual approval | An approval gate solves a different problem (human judgment before release) than a test gate does (catching known-bad code); the confirmed urgent problem is the latter | If Joel later wants a manual approval step in addition, that's an easy, separate addition | **Yes** |

## 6. Phase 0.75 Implementation Packages

### Package 0.75A — CI Safety
**Objective:** No deploy reaches production without required tests passing; migrations no longer apply automatically and unconditionally.
**Scope:** Modify `.github/workflows/deploy.yml` to run `npm run check` (and `scripts/route-map-integrity.mjs`, already part of `npm run check`) as a required step before both the migration-apply step and the Wrangler deploy step; either step failing halts the workflow.
**Files likely to change:** `.github/workflows/deploy.yml`. Possibly `package.json` if a dedicated `npm run ci` alias is preferred over reusing `npm run check` directly.
**Central-D1 migrations required:** none.
**Cloudflare resources:** none.
**Implementation order:** first — everything else in this program deploys through this pipeline.
**Automated tests:** the existing `npm run check` suite becomes load-bearing rather than optional; no new tests are strictly required for this package alone, though a CI-gate regression test (a deliberately failing check, confirmed to block deploy) is recommended.
**Acceptance criteria:** a pull request with a deliberately failing `npm run check` cannot reach a merged, deployed state via the normal pipeline.
**Rollback:** revert the workflow file; this package makes deploys *more* conservative, so rollback risk is low.
**Risks:** a currently-passing `npm run check` might reveal it's been silently broken for some time once it's actually load-bearing — recommend running it manually against current `main` before wiring the gate, to surface any existing failures on a non-blocking basis first.
**Explicit exclusions:** does not add a staging environment (Package 0.75G) or an approval gate (a separate, later decision per Section 5).
**Blocks Phase 1?** Yes. **Blocks ledger development?** Yes (transitively). **Blocks pilot?** Yes.

### Package 0.75B — Stripe Event Completeness
**Objective:** Close the two ledger-blocking gaps identified in `02a`; make an explicit, documented decision on the rest.
**Scope:** (1) Decide and document the single canonical posting-trigger event for a completed donation (`checkout.session.completed` vs. `payment_intent.succeeded`) — a decision, not necessarily a code change yet, since no posting engine exists to wire it to. (2) Add persisted exact refunded-amount tracking to `commerce_orders`. (3) Extend dispute handling (`charge.dispute.created`/`.closed`) to also update `commerce_orders` when the disputed charge is a bookstore charge, mirroring the existing `refundCommerceOrderFromStripe` pattern. (4) Document (not necessarily implement yet) the payout-event gap and get an explicit decision on whether automated payout posting is in scope for pilot or deferred to manual reconciliation.
**Files likely to change:** `src/handlers/stripe.js`, `src/handlers/parish.js` (`refundCommerceOrderFromStripe` and a new dispute-handling sibling function).
**Central-D1 migrations required:** a migration adding a refunded-amount column (and possibly a dispute-status column) to `commerce_orders`.
**Cloudflare resources:** none.
**Implementation order:** can run in parallel with 0.75C/D; should complete before ledger/posting-engine design work (not before Phase 1 control-plane work).
**Automated tests:** fixture-based tests for each of the two closed gaps, plus an explicit dual-trigger test proving the canonical-event decision is actually enforced once implemented.
**Acceptance criteria:** `02a`'s matrix rows for these two gaps flip from "gap" to "resolved," with a passing test for each.
**Rollback:** additive schema changes (new nullable columns) are low-risk to roll back; the canonical-trigger decision itself has no rollback concern since it's a design decision, not a running system change, until a posting engine consumes it.
**Risks:** the canonical-trigger decision requires accounting-policy judgment (which event's timestamp should govern posting date) as much as engineering judgment — flagged for Section 10.
**Explicit exclusions:** does not implement the posting engine itself; does not implement payout event handling unless Joel's decision (item 4 above) calls for it now rather than deferring.
**Blocks Phase 1?** No. **Blocks ledger development?** Yes, for items 1–3. **Blocks pilot?** Only if payout automation is decided to be in-scope for pilot.

### Package 0.75C — Platform Identity and Parish Memberships
**Objective:** Build the general platform-user identity and parish-membership entities designed in `02d`.
**Scope:** New platform-user authentication (patterned on, not built on, the existing donor auth mechanism); new parish-membership entity (person × parish × capability-set × status); invitation/acceptance workflow; membership status lifecycle (`invited`/`active`/`suspended`/`revoked`).
**Files likely to change:** new files under `src/lib/` (e.g., a platform-identity module) and `src/handlers/` (membership management routes); `src/lib/core.js` may gain shared session-hashing helpers reused from the donor pattern.
**Central-D1 migrations required:** new tables for platform users, parish memberships, and invitations — no final SQL per this phase's scope, but table shape is as designed in `02d`.
**Cloudflare resources:** none.
**Implementation order:** after 0.75A (so it deploys through a safe pipeline); can run in parallel with 0.75B; must precede 0.75D (capabilities need someone to attach capabilities to) and 0.75E (the gateway needs an identity to authorize against).
**Automated tests:** the cross-parish denial and revoked-membership tests specified in `02d`.
**Acceptance criteria:** a person can be invited to a parish, accept, authenticate, and be resolved server-side to a specific membership — with no accounting route reachable via the shared parish bearer token.
**Rollback:** additive (new tables, new auth path); does not touch existing donor/admin/parish-bearer auth, so rollback is isolated to the new code paths.
**Risks:** scope creep into "let's also migrate existing parish-dashboard features to the new identity system" — explicitly out of scope (Section 4, Workstream 3's transition strategy).
**Explicit exclusions:** does not remove or modify the existing shared parish bearer token mechanism for non-accounting routes.
**Blocks Phase 1?** Yes. **Blocks ledger development?** Yes (transitively). **Blocks pilot?** Yes.

### Package 0.75D — Capabilities and Authorization
**Objective:** Implement capability-based authorization on top of 0.75C's membership entities.
**Scope:** The initial capability catalog (`02d`'s list, stored as extensible data, not a hardcoded enum); a centralized authorization-check function every accounting route calls; role templates as a convenience layer over individual capability assignment; capability-change audit logging.
**Files likely to change:** new authorization module in `src/lib/`; every future accounting route handler calls into it (no accounting route exists yet in this phase, so this is the *mechanism*, exercised by tests, not yet by real routes).
**Central-D1 migrations required:** a capability-assignment table (or equivalent), and role-template definitions if implemented as data rather than code.
**Cloudflare resources:** none.
**Implementation order:** immediately after 0.75C.
**Automated tests:** capability-boundary tests from `02d` (has X, lacks Y → X succeeds, Y is rejected).
**Acceptance criteria:** the authorization function is the single implementation any future accounting route uses — verified by the absence of any parallel, duplicated check.
**Rollback:** additive; isolated to new code.
**Risks:** premature finalization of the capability catalog — mitigated by the explicit "extensible, not final" design requirement.
**Explicit exclusions:** does not implement reauthentication-for-high-risk-actions yet (deferred to pilot readiness per `02c`).
**Blocks Phase 1?** Yes. **Blocks ledger development?** Yes (transitively). **Blocks pilot?** Yes.

### Package 0.75E — Accounting Gateway Architecture
**Objective:** Stand up the Accounting Gateway Worker (Option B) and the central registry (Workstream 5), wired to 0.75C/D's authorization.
**Scope:** New Worker project/deployable; Service Binding from the main Worker; registry tables in central `AGAPAY_DB`; the registry's lifecycle state machine and its enforcement rules (idempotent provisioning, uniqueness constraint, etc.) — with the gateway itself not yet provisioning any *real* parish accounting database (that's Phase 1 proper), only the mechanism and the registry.
**Files likely to change:** new `wrangler.toml`/`wrangler.jsonc` and source tree for the gateway Worker; existing `wrangler.toml` gains a `services` binding.
**Central-D1 migrations required:** the accounting entity + registry tables from Workstream 5.
**Cloudflare resources:** one new Worker deployment (not a D1 database yet — no real parish accounting database is created in this phase).
**Implementation order:** after 0.75C/D (needs an identity/capability model to authorize against); can overlap with 0.75B/0.75F design work.
**Automated tests:** provisioning-idempotency and uniqueness-constraint tests (threats #20/#23/#24 in `02b`); a test confirming the gateway's RPC surface has no method accepting a raw binding identifier as a parameter (threat #3).
**Acceptance criteria:** the registry state machine's transitions are enforced (illegal transitions rejected); a simulated provisioning request against a *test* database (not production) succeeds exactly once, idempotently.
**Rollback:** the gateway Worker can be un-deployed without affecting the main Worker, since it's reached only via an explicit Service Binding the main Worker can also stop calling.
**Risks:** this is the package with the most genuinely new infrastructure (a new Worker, a new deployment pipeline for it) — recommend treating its own CI/deploy setup as itself gated by Package 0.75A's pattern from day one, not retrofitted later.
**Explicit exclusions:** does not provision any real parish's accounting database; does not create the D1 database resources themselves (per this phase's "do not create Cloudflare resources" constraint) — builds the mechanism that *would* do so, ready for Phase 1 to actually invoke against a real (or first pilot) parish.
**Blocks Phase 1?** This package substantially *is* Phase 1's foundational half — its completion is close to synonymous with Phase 1 entry readiness on the architecture side. **Blocks ledger development?** Yes. **Blocks pilot?** Yes.

### Package 0.75F — Background Processing
**Objective:** Select and document the background-job primitive strategy (Section 4, Workstream 6); no primitive is actually created in this phase.
**Scope:** Documentation of the primitive-per-use-case table above, the message-envelope design principles, retry/dead-letter policy — as a design artifact Phase 1 and later phases build against.
**Files likely to change:** none (documentation only, already captured in this report).
**Central-D1 migrations required:** none.
**Cloudflare resources:** none — explicitly deferred per the prompt's "do not create a Queue or Workflow unless separately authorized."
**Implementation order:** can happen any time; informs 0.75E's registry design (the registry's `migration_pending`/`provisioning` states anticipate eventual queue-driven transitions even before a queue exists).
**Automated tests:** none yet (nothing to test).
**Acceptance criteria:** Joel has approved the primitive selections in Section 4/Section 5 of this report.
**Rollback:** N/A (no infrastructure created).
**Risks:** none material at this stage.
**Explicit exclusions:** does not create any Queue, Workflow, or Durable Object.
**Blocks Phase 1?** No (a documented decision suffices for Phase 1 entry per `02c`). **Blocks ledger development?** No, until posting-retry logic is actually needed. **Blocks pilot?** Not directly, unless pilot volume requires real async processing sooner than expected.

### Package 0.75G — Staging and Local Development
**Objective:** Formal environment separation (Workstream 7) and a `wrangler dev`-based accounting local-dev path (Workstream 8).
**Scope:** New Wrangler environment configuration (staging); staging central D1, staging R2 bucket, staging secrets; test-parish records for cross-tenant testing; `wrangler dev`-based local accounting development path, run alongside (not replacing) `server.mjs` for non-accounting work.
**Files likely to change:** `wrangler.toml` (new `[env.staging]` or equivalent, or a parallel `wrangler.staging.toml` depending on Wrangler v4's current recommended pattern — not resolved here, a Phase 1 implementation detail); new local-dev documentation.
**Central-D1 migrations required:** none beyond what other packages need, applied to the new staging database as well as production.
**Cloudflare resources:** a staging D1 database, a staging R2 bucket (Cloudflare resource creation — explicitly deferred unless separately authorized, per this phase's constraints; this package's Phase 0.75 deliverable is the *design and naming convention*, not the actual resource creation).
**Implementation order:** can run in parallel with 0.75C/D/E; should be substantially in place before any real migration is tested (Package 0.75I depends on it).
**Automated tests:** environment-isolation test (a staging-configured deploy cannot reach a production binding) — this test is itself part of the deliverable, since it's the actual proof of the isolation requirement.
**Acceptance criteria:** at least a documented, Joel-approved environment map and naming convention; actual resource creation is a follow-on, separately authorized step.
**Rollback:** N/A for the design deliverable; low risk for resource creation since staging resources don't touch production data by construction.
**Risks:** environment-separation work is easy to under-scope ("just add a staging binding") when the real requirement is structural non-reachability, not just a differently-named binding — the environment-isolation test exists specifically to catch that failure mode.
**Explicit exclusions:** does not provision staging Cloudflare resources without separate authorization.
**Blocks Phase 1?** Yes (`02c`'s entry checklist requires local/staging environments able to model multiple D1 databases). **Blocks ledger development?** Yes (transitively, via migration testing). **Blocks pilot?** Yes.

### Package 0.75H — Observability and Threat Mitigation
**Objective:** Close the specific, actionable gaps from Workstream 9 and the Phase-1-blocking items from `02b`'s threat model that aren't already covered by 0.75C/D/E.
**Scope:** Accounting-specific log-field redaction rules; correlation-ID extension to accounting-related requests (once they exist); a dedicated support-access workflow (time-limited where practical, fully audited both centrally and — once a parish accounting database exists — parish-locally); alerting-threshold definitions for provisioning/migration failures.
**Files likely to change:** `src/lib/logging.js`, `src/lib/audit-log.js`, new support-access-specific module.
**Central-D1 migrations required:** possibly an extension to `audit_log`'s `actor_type` value set (additive, low-risk) if `support` needs to be distinguished from `admin`.
**Cloudflare resources:** none, unless an external alerting/monitoring integration is decided on (not resolved here).
**Implementation order:** support-access workflow specifically should land alongside or just after 0.75C/D (it's a specialized case of the same identity/capability machinery); redaction rules can proceed independently.
**Automated tests:** a redaction test asserting sensitive field names never appear in structured log output; a support-access test asserting the workflow requires an explicit grant + reason and is logged in both audit surfaces.
**Acceptance criteria:** `02b`'s threat #8 (support misuse) and #17 (sensitive-data logging) move from "missing mitigation" to "control implemented and tested."
**Rollback:** additive; low risk.
**Risks:** redaction rules are easy to under-specify (missing a field) — recommend an explicit, reviewed list of sensitive field names rather than a general "use good judgment" instruction to future code.
**Explicit exclusions:** does not build a full external monitoring/alerting integration if one doesn't already exist — flagged as a decision for Joel (Section 10) rather than assumed.
**Blocks Phase 1?** Partially — threat-model Phase-1-blockers must be remediated or planned, but this specific package's items are mostly pilot blockers per `02b`. **Blocks ledger development?** No. **Blocks pilot?** Yes.

### Package 0.75I — R2, Backup, and Migration Foundations
**Objective:** Create the design (not the resources) for the accounting document bucket, extend the backup/restore runbook pattern, and define the migration-orchestration/canary approach.
**Scope:** Bucket design and key/metadata convention (Workstream 10); per-parish extension of `docs/BACKUP_RESTORE_RUNBOOK.md`'s existing process; canary-migration strategy definition; drift-detection design tied to the registry's `schema_version` field (Workstream 5).
**Files likely to change:** `docs/BACKUP_RESTORE_RUNBOOK.md` (extended, not replaced); new documentation for the accounting bucket design.
**Central-D1 migrations required:** none beyond the registry's `schema_version`/`backup_status` fields, already covered by 0.75E.
**Cloudflare resources:** the accounting document and backup buckets themselves — explicitly deferred, design-only per this phase's constraints.
**Implementation order:** can run in parallel with most other packages; should be substantially designed before 0.75E's registry migrations are finalized, since the registry's backup/schema fields depend on this design being settled.
**Automated tests:** none yet (no bucket exists to test against) — deferred to whenever the bucket is actually created.
**Acceptance criteria:** Joel-approved bucket design, key convention, and canary-migration strategy documented.
**Rollback:** N/A (design-only deliverable).
**Risks:** retention-policy questions here genuinely need legal/accountant input (Accounting Philosophy §31) — flagged, not resolved.
**Explicit exclusions:** does not create any R2 bucket.
**Blocks Phase 1?** No directly, but Phase 1's registry design depends on this design being settled first. **Blocks ledger development?** No. **Blocks pilot?** Yes (a real parish's documents need somewhere real and correctly-designed to live).

## 7. Dependency Graph

```
0.75A (CI safety)
   ↓
0.75C (Identity) ──────────────┐
   ↓                            │
0.75D (Capabilities)            │  (parallel)
   ↓                            │
0.75E (Gateway + Registry) ←────┘
   ↓
 ── Phase 1 entry (per 02c) ──

Parallel tracks, not blocking 0.75A→E's critical path,
but required before their respective downstream gates:

0.75B (Stripe completeness)  ──→ required before ledger development, not before Phase 1
0.75F (Background processing selection) ──→ informs 0.75E's design; no hard blocking dependency
0.75G (Staging/local dev) ──→ required before Phase 1 entry (02c); can start immediately, in parallel with 0.75C/D
0.75H (Observability) ──→ required before pilot; support-access piece overlaps with 0.75C/D
0.75I (R2/backup/migration design) ──→ should settle before 0.75E's registry migration is finalized; required before pilot
```

## 8. Recommended Delivery Sequence

1. **0.75A** — primarily implementation work (a workflow file change); suitable for Codex; no Cloudflare console setup beyond confirming the existing `CLOUDFLARE_API_TOKEN` secret's scope (a quick manual check, not a new setup task).
2. **0.75G** (start in parallel with step 1's review) — mixed design + implementation; the design portion (environment map, naming convention) is primarily Claude/design work requiring Joel's approval before any resource creation; resource creation itself needs explicit follow-on authorization.
3. **0.75C** — primarily design work first (the identity pattern, the membership entity shape), then substantial Codex-suitable implementation once the design is approved by Joel.
4. **0.75D** — follows directly from 0.75C; similar design-then-implement split.
5. **0.75B** — can run in parallel with 3–4; the canonical-posting-trigger decision specifically needs Joel's (and likely an accountant's) input before implementation, per Section 10.
6. **0.75F** — pure design/decision work; needs Joel's approval; no implementation in this phase.
7. **0.75E** — depends on 0.75C/D being substantially complete; requires Cloudflare console/API setup for the new Worker's deployment pipeline (though not for any D1 database creation, which remains deferred); requires Joel's approval of the topology decision before starting (already sought in Section 5, but concretely re-confirmed here as a gate).
8. **0.75I** — design work, can run any time before 0.75E's registry migration is finalized; the retention-policy questions specifically need external accountant/legal review, not just Joel's internal sign-off.
9. **0.75H** — can start once 0.75C/D's identity/capability machinery exists for the support-access piece; the redaction-rules piece can proceed independently and earlier.

**Packages requiring external security or accountant review specifically:** 0.75B (canonical posting-trigger date/policy implications), 0.75I (document retention policy).

## 9. Phase 1 Entry Criteria

See `docs/accounting/02c-phase-1-entry-checklist.md` for the complete, formal checklist, organized by gate (Phase 1 control-plane work / ledger development / pilot / general release).

## 10. Human Decisions Required

| Decision | Recommended default |
|---|---|
| Approve Accounting Gateway topology (Option B) | Approve — strongest available isolation, confirmed scalable, confirmed low-complexity relative to alternatives |
| Approve building a new general platform-user identity (not extending donor/admin) | Approve |
| Approve the collapsed registry state machine in Section 4 (Workstream 5) over the prompt's longer suggested list | Approve, with the understanding that states can be added later if a real gap emerges |
| Approve Queues (not Workflows) as the primary background primitive, with Workflows reserved for Aplos migration specifically | Approve |
| Approve keeping the shared parish bearer token for non-accounting features, indefinitely, rather than scheduling its removal now | Approve — removing it is a separate, larger, non-accounting-driven project |
| Decide the canonical Stripe posting-trigger event (`checkout.session.completed` vs. `payment_intent.succeeded`) for donations | No default recommended — this needs input from whoever will also weigh in on Accounting Philosophy §14's "which date controls" open question, since the two are related; flagged for the accountant conversation already planned for Philosophy §31 |
| Decide whether automated payout-event posting is in scope for pilot, or deferred to manual reconciliation | Recommended default: **defer** — pilot can reconcile payouts manually or via Stripe's own dashboard initially; automating it is real but non-blocking work |
| Decide whether check-signing capability should model physical signature authority, not just digital authorization (Philosophy §23 open item, `02d`) | No default recommended — genuinely a parish-governance question |
| Approve one documents bucket with typed prefixes plus a separate backup bucket (Workstream 10) | Approve |
| Approve the document-retention policy approach for accounting documents | No default recommended — flagged for legal/accountant review per Accounting Philosophy §31 |
| Approve production deploy remaining push-triggered (after the CI gate lands) rather than becoming approval-gated | Approve remaining push-triggered for now; revisit if pilot experience suggests otherwise |

## 11. Deferred Work

Everything explicitly out of scope for Phase 0.75 per the governing prompt: the chart of accounts, funds, journal entries and lines, the posting engine, bank reconciliation, accounts payable, check printing, accounting reports, Aplos migration, any parish accounting user interface, and any actual parish accounting database. Also deferred within this phase's own findings: creation of any new Cloudflare resource (Worker deployments beyond the gateway's initial skeleton, D1 databases, R2 buckets, Queues); resolution of every Accounting Philosophy §31 open policy question (only the ledger-blocking subset gates further work); a decision on Workers for Platforms (not needed at current or foreseeable scale); a platform-wide migration away from the shared parish bearer token for non-accounting features; automated payout-event posting (pending Joel's decision above); and full design of content-type/size-limit/malware-scanning rules for the new accounting R2 bucket.

## 12. Final Readiness Verdict

**Ready for Phase 1 after specified packages** — specifically, Packages 0.75A, 0.75C, 0.75D, 0.75E, and 0.75G, per `02c`'s formal entry checklist. Package 0.75B's ledger-blocking items must complete before ledger/posting-engine work begins, but not before Phase 1 control-plane work (which is registry and gateway construction, not posting). Packages 0.75F, 0.75H, and 0.75I contain real prerequisites for pilot but are not blocking Phase 1 entry itself.

This is not a "wait and reassess" verdict — every package above is scoped, small, and independently testable, and none requires resolving open accounting-policy questions that belong to an accountant rather than an engineer. The codebase's actual foundations (Stripe idempotency, structured logging, the audit-log pattern, the backup/restore runbook, the donor auth pattern, and — newly confirmed — comfortably scalable D1 binding limits) are stronger than a first read of Phase 0 might have suggested. The work remaining is specific and well-bounded, not open-ended architectural risk.
