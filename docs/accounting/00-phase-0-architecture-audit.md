# AGAPAY Accounting — Phase 0 Architecture Audit

**Scope:** Read-only inspection of `joeldunnesq-sudo/agapay-site` (branch `main`) to determine readiness for a per-parish, double-entry accounting system.
**Method:** Static inspection of `wrangler.toml`, `src/`, `migrations/`, `docs/`, `scripts/`, and `workflows/`. No code was changed, no migrations were created, no Cloudflare resources were touched.
**Honesty note:** This audit distinguishes *confirmed* (I read the code/config directly) from *inferred* (reasonable conclusion not directly proven) and flags anywhere the repository didn't give me enough to be sure. Given the size of the repo (`src/worker.js` alone is 3,325 lines; `src/handlers/parish.js` is 5,889 lines), some lower-priority corners — e.g. every Learn sub-module, every commerce edge case — were sampled rather than read line-by-line. Where that matters, it's called out explicitly rather than glossed over.

---

## 1. Executive Summary

**Overall readiness: Not ready for separate per-parish D1 databases as currently architected — but the codebase is unusually disciplined for a one-developer project, and the gap is narrower than "rebuild from scratch."**

- AGAPAY today is a **single Cloudflare Worker, single D1 database** (`agapay-production`), single KV namespace, three R2 buckets. There is no multi-database concept anywhere in the runtime code.
- The core D1 access helper — `d1(env)` in `src/lib/core.js:531` — **hardcodes `env.AGAPAY_DB`**. Every call site (`d1First`, `d1All`, `d1Run`, `d1Batch`) inherits that single-database assumption. This is the central fact the whole audit turns on: nothing routes a query to "the right database for this parish" — there is only one database, ever.
- Cloudflare Workers cannot dynamically attach a D1 binding at runtime chosen by request data — bindings are static, declared in `wrangler.toml` at deploy time. This is a genuine platform constraint, not a gap in AGAPAY's code, and it rules out "one binding per parish" at any real scale. Section 5 and Section 10 work through what *is* available on the platform today (confirmed against this repo's `compatibility_date = "2026-05-25"` and current Workers bindings usage — I did not test undocumented Cloudflare features and none should be assumed).
- Tenancy today is **enforced by parish-scoped WHERE clauses inside a shared database**, authenticated by a **single shared bearer credential per parish** (`verifyParishDashboardBearer`, `src/handlers/parish.js`) — not by per-user roles. There is no rector/treasurer/bookkeeper/approver distinction anywhere in the schema or code. This is the single largest authorization gap for accounting, where separation of duties (the person who enters a bill ≠ the person who approves it ≠ the person who cuts the check) is a hard requirement, not a nicety.
- The financial event pipeline (Stripe webhooks) is **genuinely solid**: signature verification, an idempotency ledger (`stripe_events` table, claim/finish pattern), structured logging, and a real append-only `audit_log` table already exist. This is real, reusable infrastructure for posting into a ledger safely.
- There are **no Cloudflare Queues, no Workflows, and no dispatch namespaces** anywhere in `wrangler.toml`. There is exactly one cron trigger (`0 14 * * 6`, weekly). Background/async processing is currently done synchronously inside request handlers or manually via admin-triggered routes. Any multi-database provisioning, migration-fanout, or retry-heavy accounting posting will need infrastructure that doesn't exist yet.
- **CI does not run tests before deploy.** `workflows/deploy.yml` deploys on every push to `main` with no `npm run check` gate. There is a real test suite (`scripts/*.mjs`, custom assertions, no Jest/Vitest), but it isn't wired to block a bad deploy. This must change before anything with real money and legal/audit exposure (accounting) ships.
- **Recommended architecture (detailed in Section 5/6):** a **central "Accounting Gateway" pattern** — one Worker (either the existing Worker extended, or a new internal Worker reached via a **Service Binding**) that owns all D1 accounting bindings, resolves `parish_id → accounting D1 binding` server-side from a registry table in the central `AGAPAY_DB`, and is the only code in the system allowed to open an accounting database. This is compatible with Cloudflare's actual binding model (static bindings, many of them, one Worker) and scales to on the order of dozens–low hundreds of statically-bound databases before requiring a different pattern (see Section 5 table for the ceiling and what changes above it).
- **Should implementation proceed immediately?** No. Five prerequisites (Section 12 / end-of-report) should land first. None of them are large rewrites — they're a registry table, a role system, a CI test gate, a background-job primitive, and a written decision on the binding-scaling ceiling.

---

## 2. Current System Map

**Confirmed from `wrangler.toml`, `src/worker.js`, and directory structure.**

- **Runtime:** One Cloudflare Worker (`name = "agapay-site"`, `main = "src/worker.js"`), `compatibility_date = "2026-05-25"`, `nodejs_compat` flag on.
- **Frontend:** Static assets served via Workers Assets (`[assets] directory = "./public"`, binding `ASSETS`), with `run_worker_first` routing the Worker in front of specific HTML paths (`/give/*`, `/myagapay/*`, `/learn/*`, `/listen/*`, `/donor/*`, etc.) so those routes can be dynamic/authenticated while the rest is served as static files. No frontend framework build step was found (no `package.json` React/Vue/Next dependency) — this is server-rendered/vanilla HTML + JS under `public/`.
- **Backend:** All API logic routes through `src/worker.js`'s `fetch()` handler, which dispatches to handler modules in `src/handlers/*.js` and `src/learn/*.js`. `src/lib/core.js` is the shared utility/data-access layer (auth helpers, D1 helpers, KV helpers, rate limiting, JSON responses).
- **Databases/storage (all declared in `wrangler.toml`):**
  - D1: `AGAPAY_DB` → database `agapay-production` (id `24f514a6-6904-425b-a4c8-b3584b23c0be`). **Only one.**
  - KV: `AGAPAY_REGISTRATIONS` (namespace id `c0c630...`). Legacy/fallback store for registrations; D1 is now authoritative (confirmed — see Section 3).
  - R2: `CAMPAIGN_ASSETS` (public, has an `r2.dev` URL — `CAMPAIGN_ASSETS_URL` var), `TAX_EXEMPTION_DOCS` (private, no public URL, comment in `wrangler.toml` explicitly warns against ever adding one), `GIVING_STATEMENTS` (private, same rule).
  - `[browser] binding = "BROWSER"` — Cloudflare's headless browser rendering binding (used with `@cloudflare/puppeteer`, likely for PDF generation — confirmed dependency in `package.json`, not fully traced to every call site).
- **Cron:** one trigger, `0 14 * * 6` (Saturdays 14:00 UTC), handled by `scheduled()` in `src/worker.js:2340`.
- **Queues/Workflows/dispatch namespaces:** none declared. Confirmed by absence in `wrangler.toml` (no `[[queues]]`, no `[[workflows]]`, no dispatch namespace config).
- **Local dev:** `server.mjs` — a plain Node `http` server (not `wrangler dev`) that reimplements routing for local development by importing handler functions directly, with hardcoded local-preview auth (`localPreviewEmail = "preview@agapay.local"`, `localPreviewToken = "agapay-local-preview"`). This means local dev does **not** exercise the actual Workers runtime, D1 bindings, or `wrangler.toml` bindings config — it's a parallel harness. **This matters directly for Phase 0**, because any new binding-based architecture (Service Bindings, multiple D1 bindings) needs its own local-dev story, since `server.mjs` doesn't currently model bindings at all.
- **Secrets vs vars:** `wrangler.toml [vars]` holds non-secret config (from-email addresses, feature flags, public URL). Stripe secret key, Stripe webhook secret(s), and `AGAPAY_ADMIN_TOKEN` are referenced as `env.STRIPE_SECRET_KEY`-style bindings in code but are **not** in `wrangler.toml` — confirming they're Wrangler secrets (`wrangler secret put`), not plaintext vars. This is correct practice. I did not and will not print any secret values; none were encountered in plaintext in the repo.
- **Deployment:** GitHub Actions (`workflows/deploy.yml`) deploys via `cloudflare/wrangler-action@v3` on every push to `main`. **No test step runs first** (see Section 11/13).

### Text architecture diagram (current state)

```
                        ┌─────────────────────────────┐
  Browser  ───────────► │   Cloudflare Worker          │
  (public/*.html, JS)   │   agapay-site (src/worker.js)│
                        │                              │
                        │  handlers/: parish, donor,   │
                        │  admin, stripe, stewardship,  │
                        │  tax-exemption, giving-       │
                        │  statements, marketplace,     │
                        │  listen, parish-interest       │
                        │  learn/: handlers.js + 20      │
                        │  domain modules                │
                        └───────┬─────────┬─────────┬───┘
                                │         │         │
                     ┌──────────▼──┐ ┌────▼────┐ ┌──▼───────────┐
                     │  D1: AGAPAY_DB│ │   KV    │ │  R2 (x3)     │
                     │  (single DB,  │ │AGAPAY_  │ │CAMPAIGN_     │
                     │  all tenants, │ │REGIS-   │ │ASSETS (pub)  │
                     │  27 migrations│ │TRATIONS │ │TAX_EXEMPTION_│
                     │  applied)     │ │(legacy/ │ │DOCS (priv)   │
                     │               │ │fallback)│ │GIVING_       │
                     └───────────────┘ └─────────┘ │STATEMENTS(pv)│
                                                    └──────────────┘
                         cron (weekly) ──► scheduled() in worker.js
                         Stripe webhooks ──► handleStripeWebhook()
                         BROWSER binding ──► PDF rendering (puppeteer)

  No queues. No workflows. No service bindings. No second Worker.
```

---

## 3. Relevant Repository Map

**Cloudflare configuration**
- `wrangler.toml` — the entire runtime topology: one Worker, one D1, one KV, three R2, one cron, `BROWSER` binding, feature-flag vars.
- `workflows/deploy.yml` — GitHub Actions deploy-on-push, no test gate.

**Database access**
- `src/lib/core.js` — `d1(env)` (hardcoded to `AGAPAY_DB`), `d1First`/`d1All`/`d1Run`/`d1Batch` (thin prepare/bind/run wrappers), `d1GetSetting`/`d1SetSetting`. This is the closest thing AGAPAY has to a data-access layer, and it is **not a repository pattern** — most handlers still write raw SQL inline, just through these four helper functions rather than hitting `env.AGAPAY_DB` directly (confirmed: only `src/worker.js`, `src/lib/core.js`, and `src/handlers/stewardship.js`/`donor.js` call `.prepare(` directly; everything else that touches D1 goes through the `d1*` helpers — a good sign for centralizing a future rewrite).
- `src/handlers/parish.js` (5,889 lines) — the largest handler file; parish dashboard, registration lifecycle, sacraments, settlement profiles routing, checkout status.
- `src/learn/repository.js` — a dedicated repository-style module for AGAPAY Learn data (worth studying as the *better* pattern to imitate for accounting, vs. the more ad hoc SQL-in-handler style elsewhere).

**Migrations**
- `migrations/` — 27 flat `.sql` files, sequentially numbered (with some duplicate numbers across features, e.g. two different `0003_*.sql` and `0004_*.sql` files for different feature areas — confirmed by `ls`; this means the numeric prefix is not a strict single-timeline sequence but per-feature). Applied via `wrangler d1 migrations apply` per `docs/settlement-profiles.md:195` and `docs/SOFT_LAUNCH_READINESS.md:521`, which confirms Wrangler's own migration-tracking table is in use (not a custom tracker).
- `docs/BACKUP_RESTORE_RUNBOOK.md` — real, detailed runbook: `wrangler d1 execute --remote` for exports, a restore-test database, `wrangler d1 migrations list` to check drift, row-count spot checks across key tables. This is genuine operational maturity most solo-dev projects don't have at this stage.

**Authentication / tenancy**
- `src/lib/core.js` — `hashSessionToken`, `getAdminToken`, `getBearerToken`, donor session helpers.
- `src/handlers/parish.js` — `requireDonor`, `requireAdmin`, `requireAdminContext`, `handleAdminSession`, `requireSacramentsParishContext` (and similar per-feature `require*ParishContext` gates), `verifyParishDashboardBearer` (parish-side shared credential check).
- `src/handlers/admin.js` — `requireAdmin`/`requireAdminContext` call sites gating every admin route.

**Stripe**
- `src/handlers/stripe.js` (900 lines) — webhook signature verification (`verifyStripeWebhookWithAnySecret`, supports secret rotation via multiple secrets), idempotency claim/finish (`claimStripeEvent`/`finishStripeEvent` against the `stripe_events` table), `processStripeWebhookEvent` (900-line dispatcher for event types), Connect onboarding.
- `src/lib/stripe-connect.js`, `src/lib/subscription-checkout.js`, `src/lib/subscriptions.js`.
- `migrations/0001_production_records.sql`, `0002_stripe_event_status.sql` — `stripe_events` table + status columns.

**Giving**
- `src/handlers/donor.js`, `src/lib/registrations.js`, `migrations/0001_production_records.sql` (`donors`, `donor_offerings`, `commemorations`).

**Commerce (Parish+/Bookstore)**
- `migrations/0009_parish_commerce.sql` — `parish_commerce_permissions`, `parish_commerce_receipt_sequences`, and (per naming) commerce order/product tables.
- `src/lib/commerce-readiness.js` — feature-gating and the explicit "parish is merchant of record" language (`src/lib/commerce-readiness.js:125`).
- `docs/tax-exemption-preview-qa.md`, `migrations/0011_tax_exemptions.sql`, `migrations/0013_tax_exemption_upload_tokens.sql`, `src/handlers/tax-exemption.js`, `src/lib/tax-exemption*.js`.

**Settlement profiles / revenue streams**
- `migrations/0010_settlement_profiles.sql` — `settlement_profiles` (has a `parish_id`, `profile_type` enum-like column, and — notably — an **`accounting_category` column already present**, unused today but a clean forward hook), `settlement_profile_modules`.
- `src/lib/settlement-profiles.js`, `docs/settlement-profiles.md` (excellent internal documentation — explains the "Revenue Streams" UI name vs. `settlement_profiles` backend name explicitly so future engineers don't create a duplicate concept).

**R2**
- `src/lib/giving-statement-storage.js`, `src/lib/tax-exemption-storage.js` — both generate random opaque keys (`generateStorageKey()` → `texdoc/<64-hex>`, confirmed at `src/lib/tax-exemption-storage.js:62-67`) rather than embedding `parish_id` in the object key. Tenancy is enforced by a D1 row mapping `storageKey → parish_id`, checked before streaming, not by the R2 key itself.

**KV**
- Referenced across nearly every handler (`src/handlers/*.js`, `src/learn/*.js`) — used for rate limiting, session-adjacent lookups, and legacy registration lookups (fallback path only, per `findRegistrationByParishId`, `src/handlers/parish.js:1944`).

**Queues and scheduled jobs**
- None (no Queues). One cron (`scheduled()` in `src/worker.js:2340`) — confirmed weekly-only trigger.

**Testing**
- `scripts/check.mjs`, `scripts/check-learn.mjs`, `scripts/worker-hardening-tests.mjs`, `scripts/settlement-profiles-tests.mjs`, `scripts/tax-exemption-tests.mjs`, `scripts/tax-exemption-route-tests.mjs`, `scripts/tax-readiness-tests.mjs`, `scripts/route-map-integrity.mjs` — all custom Node scripts run via `npm run check`, no Jest/Vitest/Playwright-in-CI (Playwright is a devDependency but I did not confirm it runs anywhere in CI — only referenced as a dependency).
- `scripts/prelaunch-checks.mjs`, `scripts/smoke-live.mjs`, `scripts/smoke-api.mjs`.

**Deployment**
- `workflows/deploy.yml` (see above). No staging/preview environment block found in `wrangler.toml` (no `[env.staging]` or `[env.preview]` sections) — **confirmed: this repo has no formally declared second environment**, though Cloudflare Workers previews/branch deployments may exist outside this file (out of scope to verify without dashboard access).

---

## 4. Current Financial Data Flow

*(Traced from actual code, not assumed. Some downstream steps — e.g. exact payout timing — are Stripe-side and not verifiable from this repo alone; flagged where that's the case.)*

**A donation:** Browser → Stripe Checkout Session created (`src/handlers/stripe.js` / `src/handlers/parish.js` checkout helpers) → donor completes payment on Stripe → Stripe fires `checkout.session.completed` (and related PaymentIntent events) to `POST /api/stripe/webhook` → `handleStripeWebhook` (`src/handlers/stripe.js:197`) verifies the signature against one or more configured secrets, claims the event id in `stripe_events` (idempotency gate), then `processStripeWebhookEvent` updates the corresponding `donor_offerings` row (status, payment_status) and records a receipt. **Authoritative source for "a donation happened": the `donor_offerings` D1 row**, populated from Stripe webhook data. Stripe itself remains authoritative for the money movement (charge, fee, payout) — AGAPAY mirrors it.

**A Stripe fee:** Not separately captured as its own ledger line today as far as this audit found — Stripe's fee is netted into the Connect payout math on Stripe's side. I did not find a table storing "Stripe fee" as a first-class field on `donor_offerings` (only payment/status fields were confirmed). **This is a real gap for accounting**: a fund-accounting system needs the gross amount, the Stripe fee, and the net separately as distinct debit/credit lines, and today AGAPAY does not appear to persist the fee amount at all — it would need to come from the Stripe Balance Transaction object at posting time. **Flagged as needing confirmation** — a targeted follow-up read of `processStripeWebhookEvent`'s full 400+ lines (I sampled, did not read every branch) would be needed before Phase 1 design to confirm whether fee data is captured anywhere.

**A payout:** Stripe Connect payout events would arrive as webhook events (`payout.paid`, etc.) if AGAPAY subscribes to them. I confirmed Stripe Connect onboarding code exists (`createStripeOnboardingSession`, `handleStripeRefresh`) but did not confirm which specific webhook event types are subscribed to or handled in `processStripeWebhookEvent` beyond checkout/session events — **open item**, not confirmed either way.

**A refund / a dispute:** Not confirmed in the sampled portion of `processStripeWebhookEvent`. Given the file's size (900 lines) and that I did not read it end-to-end, **I am not asserting refund/dispute handling doesn't exist — only that I did not confirm its presence or shape.** This must be verified line-by-line before Phase 1, since refunds/disputes are exactly the kind of event that creates reversing journal entries and is easy to get wrong.

**A bookstore sale:** Parish+ commerce checkout (schema in `migrations/0009_parish_commerce.sql`) → Stripe direct charge (parish is merchant of record per `src/lib/commerce-readiness.js:125`) → order recorded in commerce tables → sales tax computed (Stripe Tax integration implied by `agapay-bookstore`/`agapay-tax-exemption` memory context and `migrations/0011_tax_exemptions.sql`, not re-verified line-by-line here) → settled to the parish's `bookstore` settlement profile (`profile_type = 'bookstore'` per `migrations/0010_settlement_profiles.sql`).

**Sales tax:** `migrations/0011_tax_exemptions.sql` and `src/lib/commerce-readiness.js` show a real tax-exemption workflow (parish declares exemption, uploads documentation to the private `TAX_EXEMPTION_DOCS` R2 bucket, subject to `TAX_EXEMPTION_STRIPE_SYNC_ENABLED`). Full Stripe Tax calculation flow was not re-traced end-to-end in this pass.

**A settlement profile:** Created automatically (`ensureDefaultGivingProfile`-style helpers per `docs/settlement-profiles.md`) — every parish gets a `general_giving` profile, Parish+ parishes also get `bookstore`. Both settle through the *same* Stripe Connect account and *same* bank account today — settlement profiles are a **reporting/categorization layer only**, not a separate money-movement path. This is important for accounting design: settlement profiles already look like a natural precursor to "funds" or "revenue GL account mappings," but they do not currently represent separate settlement/payout mechanics.

---

## 5. Per-Parish D1 Feasibility Analysis

Cloudflare D1 bindings are declared statically in `wrangler.toml` and attached to a Worker at deploy time. A Worker cannot accept an arbitrary runtime string and open "the D1 database with that name" — it can only use a binding it was deployed with. That single platform fact drives everything below. (I am not asserting anything about Cloudflare features not visible in this repo's Wrangler version/compat date; if Cloudflare has since added true dynamic D1 resolution, that would need to be confirmed against current Cloudflare docs, not assumed.)

| Approach | Compatible with current architecture? | Security | Complexity | Scalability | Migration mgmt | Local dev | Operational burden | Recommendation |
|---|---|---|---|---|---|---|---|---|
| **Static binding per parish, all in the main Worker** (`wrangler.toml` grows one `[[d1_databases]]` block per parish) | Partially — no code change needed to *add* bindings, but `d1(env)` in `core.js` would need to become parish-aware | Good — no dynamic trust decision, bindings are compile-time | Low to start, grows linearly with parish count in config file | Poor beyond ~tens of parishes — `wrangler.toml` becomes huge, every deploy touches every binding, redeploy needed to add a parish | Must run migrations against every bound DB — no built-in fan-out tooling exists today | Works with `wrangler dev` once bindings are declared, but `server.mjs` (current local harness) doesn't model bindings at all and would need rework regardless of approach chosen | Rises fast — every new parish is a code deploy | Acceptable for pilot (single digits–dozens of parishes), not for general release |
| **Internal "Accounting Worker" reached via Service Binding, holding all accounting D1 bindings** | Not present today — would be a new Worker | Strong — the gateway Worker is the only thing that ever opens an accounting DB; the main Worker calls it over a Service Binding (in-process RPC, no public network hop) and passes an authenticated, server-derived `parish_id` | Medium — one new deployable, one new binding-resolution layer | Same scaling ceiling as above (still static bindings, just isolated in their own Worker so the *main* Worker's `wrangler.toml` doesn't balloon) | Same fan-out problem, but isolated to one Worker's deploy pipeline | Needs its own dev setup; still bounded by the "must model bindings locally" gap in `server.mjs` | Cleaner separation of concerns; still requires a deploy to add a parish | **Recommended for Phase 1/pilot** — see Section 6 |
| **Cloudflare API-based D1 access (D1 HTTP API using an API token, called from a Worker like any external HTTP call)** | Compatible with zero binding changes | Weaker — requires storing/using a Cloudflare API token inside a Worker (secret-management burden, broader blast radius than a binding) and paying HTTP-call latency/quota rather than the binding's direct access | Low to implement, higher to secure correctly | Better raw scalability (no `wrangler.toml` growth), but adds real per-query latency and rate-limit exposure | Migrations would need to be run over the same HTTP API — no native tooling parity with `wrangler d1 migrations apply` | Straightforward to fake locally (it's just an HTTP call) | New failure mode: token expiry/rotation, HTTP error handling for every query | Not recommended for the primary ledger path — acceptable only for background/batch jobs (e.g., nightly export) where latency is tolerable |
| **Deployment-per-database (one Worker deployment per parish)** | Not compatible — total architectural change | Strong isolation | Very high — N deployments, N sets of secrets, N cron schedules | Does not scale operationally past a handful of parishes | Each deploy carries its own migration state — hardest to keep synchronized | Effectively requires simulating N environments | Very high — this is "one app per customer," which AGAPAY's current single-repo/single-deploy model was not built for | Not recommended at any scale relevant to AGAPAY's stated ambition (parish software platform, not bespoke-per-customer) |
| **Dispatch namespaces (Workers for Platforms)** | Not present, not evaluable from this repo alone — I found no evidence AGAPAY's Cloudflare account has Workers for Platforms enabled, and did not confirm compatibility with the current plan/setup | Unknown without confirming plan entitlement | High — this is a genuinely different product (multi-tenant Worker dispatch), not a toggle | This is the pattern actually designed for "many tenants, many isolated resources," and is Cloudflare's own answer to this exact problem at real scale (hundreds–thousands of tenants) | Would need its own migration-orchestration design — not automatic | Would need real investigation of local-dev support | High initial investment, lower long-run per-tenant marginal cost | **Worth a deliberate future evaluation once parish count materially exceeds what static bindings can hold** — not recommended for Phase 1, but should be the named "what we migrate to" answer so nobody is surprised later |

**Recommended architecture for Phase 1 (see Section 6 for full diagram):** Static D1 bindings, one per participating parish, held by a dedicated internal Worker (or a clearly isolated module boundary within the existing Worker if a second Worker is judged premature — see Section 11 open decision), reached from the main Worker via a Service Binding, with the *central* `AGAPAY_DB` holding a registry table (`accounting_databases`: `parish_id`, `d1_database_id`, `binding_name`, `status`, `provisioned_at`) that the gateway consults to resolve which binding to use — **never** trusting a client-supplied database identifier. This is honest about not scaling indefinitely: the report explicitly recommends deciding, before Phase 1, what parish count triggers evaluation of Workers for Platforms / dispatch namespaces (Section 11).

**If the current architecture does not permit safe dynamic per-parish D1 access — say so plainly:** It does not, and no code change fixes that, because it's a Cloudflare platform constraint, not an AGAPAY one. The smallest architectural change required is: (1) add a `binding_name`/registry concept in central D1, (2) stop routing all D1 access through a single hardcoded `d1(env)` helper — introduce a parish-aware equivalent that takes a resolved binding rather than assuming `AGAPAY_DB`, and (3) decide the Worker topology (extend the existing Worker vs. a new internal Worker behind a Service Binding) before writing any ledger code.

---

## 6. Recommended Target Architecture

```
  Browser (parish treasurer/bookkeeper UI)
        │  (authenticated request, parish_id NEVER trusted from client alone)
        ▼
  ┌───────────────────────────────┐
  │  Main AGAPAY Worker            │
  │  - existing auth/session        │
  │  - resolves parish_id from       │
  │    server-side session/context,  │
  │    not from client-supplied value│
  └───────────────┬────────────────┘
                   │ Service Binding (in-process, no public hop)
                   ▼
  ┌────────────────────────────────────────────┐
  │  Accounting Gateway Worker (new)             │
  │  - holds one static D1 binding per parish     │
  │    accounting database                        │
  │  - looks up parish_id → binding_name via       │
  │    `accounting_databases` registry table        │
  │    (lives in central AGAPAY_DB, NOT in the      │
  │    accounting DB itself)                         │
  │  - enforces role/permission checks (rector,       │
  │    treasurer, bookkeeper, AP clerk, approver,      │
  │    signer, viewer, auditor, AGAPAY support) before  │
  │    ANY read or write reaches an accounting DB        │
  │  - all writes go through explicit journal-entry        │
  │    posting functions, never raw ad hoc SQL from a        │
  │    route handler (this is a hard requirement for a        │
  │    ledger, distinct from AGAPAY's current looser pattern)  │
  └───────┬───────────────────────┬──────────────────────┬─────┘
          │                       │                        │
          ▼                       ▼                        ▼
  ┌───────────────┐      ┌─────────────────┐      ┌──────────────────┐
  │ Parish A D1     │      │ Parish B D1       │      │ Parish N D1        │
  │ (accounting)     │ ... │ (accounting)       │ ...  │ (accounting)        │
  └───────────────┘      └─────────────────┘      └──────────────────┘

  Central AGAPAY_DB (unchanged authority for):
    - users, sessions, parish registry, subscriptions, permissions
    - accounting_databases registry (parish_id → binding_name/status)
    - Stripe platform records (stripe_events, donor_offerings, settlement_profiles)

  Posting sources → Accounting Gateway (via queue/workflow once one exists — see Section 9):
    - AGAPAY Give (Stripe webhook-confirmed donations)
    - Parish Commerce (Stripe webhook-confirmed bookstore sales)
    - Manual journal entries (bookkeeper-entered)

  R2 (new, recommended dedicated bucket — see Section 7):
    - vendor invoices, receipts, bank statements, check PDFs, report PDFs,
      Aplos migration files, accounting backups
    - keys scoped by parish_id + document type, metadata cross-checked
      against the accounting_databases registry before any stream-out

  Migration orchestrator (new — does not exist today):
    - applies the same accounting-schema migration set to every parish
      accounting DB, tracks per-database migration state, reports drift

  Backup process (extends the existing pattern in
  docs/BACKUP_RESTORE_RUNBOOK.md, which already covers AGAPAY_DB):
    - per-parish accounting DB export on the same cadence/tooling model
```

---

## 7. Data Ownership Boundaries

**Stays in central `AGAPAY_DB` (operational source records / tenant-routing / subscription data):**
- `registrations` (parish identity, status, Stripe Connect account linkage)
- `donors`, `donor_offerings` (giving-side operational records — these are the *source events* that get posted into the ledger, not the ledger itself)
- `stripe_events` (idempotency ledger for webhook processing — platform-wide, not per-parish)
- `settlement_profiles` (revenue-stream categorization/reporting — a natural mapping input *to* the ledger, not the ledger)
- `audit_log` (cross-cutting privileged-action trail — could remain central or split; recommend keeping central for a single audit surface across all parishes, with `organization_id` already present as the parish-scoping column, per `migrations/0014_audit_log.sql`)
- New: `accounting_databases` registry (parish_id → binding/status) — this **must** live centrally; it is tenant-routing data, and putting it inside a parish accounting DB would create a chicken-and-egg resolution problem.
- Sacrament requests, availability, tax-exemption workflow state, Learn data — all out of scope for the ledger, stay where they are.

**Belongs in each parish's accounting D1 (accounting records):**
- Chart of accounts, funds, fiscal years/periods, journal entries and lines, financial statements' underlying data, vendors, bills/AP, check register, budgets, period-close state, reconciliation state, bank account records (parish-specific), accounting-side audit trail (append-only, mirroring the `audit_log` insert-only pattern already established centrally).

**Derived records (computed, not authoritative anywhere — recompute, don't sync):**
- Financial statement outputs (balance sheet, P&L) should be generated on demand from the parish accounting DB's journal lines, not stored as a separate "authoritative" copy.

**File metadata:**
- R2 object keys and their parish/document-type mapping should live in whichever database owns the record the file supports — vendor invoice metadata in the parish accounting DB, giving-statement metadata stays where it already is (central, per existing `giving-statement-storage.js` pattern), to avoid a file's ownership record and the file's usage record living in different databases from each other.

---

## 8. Security Findings

| # | Finding | Severity | Affected files | Impact | Remediation | Blocks accounting? |
|---|---|---|---|---|---|---|
| 1 | No per-user role system; parish access is a single shared bearer credential per parish (`verifyParishDashboardBearer`) | **High** | `src/handlers/parish.js` (auth gate functions throughout) | Cannot enforce separation of duties (bill entry vs. approval vs. check-signing) — a foundational requirement for any accounting system, doubly so for a nonprofit/church context where trust and auditability matter | Design and ship a real role/permission model before ledger write paths exist | **Yes — blocks ledger development**, not necessarily Phase 1 control-plane work |
| 2 | CI deploys on push with no test gate (`workflows/deploy.yml` has no `run: npm run check` step) | **High** | `workflows/deploy.yml` | A broken migration or a broken posting-logic change could reach production `agapay-production` (and, later, every parish accounting DB) with no automated check | Add `npm run check` (or equivalent) as a required step before the deploy step | Yes — blocks pilot |
| 3 | Central `d1(env)` helper hardcodes a single database (`src/lib/core.js:531`) | **Medium** (architectural, not an active vulnerability) | `src/lib/core.js` and every caller of `d1First`/`d1All`/`d1Run`/`d1Batch` | Not a security hole today, but any naive extension to "just add a second binding" without changing this function risks accidentally querying the wrong database if not done carefully | Introduce a parish-aware resolver before any second D1 database is wired in | Blocks ledger development, not Phase 1 |
| 4 | R2 object keys are opaque random tokens with no parish scoping encoded in the key itself; tenancy is enforced only by an app-layer D1 lookup before streaming | **Medium** | `src/lib/tax-exemption-storage.js`, `src/lib/giving-statement-storage.js` | Not exploitable today because access always routes through an authenticated handler that checks the DB-side parish match — but it means R2 IAM/bucket policy alone provides zero tenant isolation; a bug in the app-layer check is a full cross-tenant file read | Continue app-layer checks (do not weaken them) for any new accounting-document bucket; consider parish-id-prefixed key convention for defense-in-depth on the new bucket | No — mitigated today, worth hardening for the new bucket |
| 5 | `donors`/`registrations`/other tables store a JSON blob in a `data` TEXT column alongside a handful of indexed columns, rather than fully normalized schema | **Low** | `migrations/0001_production_records.sql` and most subsequent migrations | Fine for the current feature set; would be a poor fit for ledger tables specifically, where every column needs to be queryable, constrainable, and summable by SQL (a JSON-blob amount field cannot be `SUM()`'d efficiently or constrained to be non-negative at the DB layer) | Design accounting-DB schema as fully normalized relational tables from day one — do not reuse the "row + JSON blob" convention for journal lines | No, but is a real design-pattern deviation the team must consciously choose to not carry over |
| 6 | No confirmed capture of Stripe fee amounts as a discrete field (Section 4) | **Medium** — unconfirmed, flagged as open item rather than asserted | `src/handlers/stripe.js` (`processStripeWebhookEvent`, not fully read) | If fees aren't captured, every posted donation needs a follow-up Stripe Balance Transaction lookup at posting time, adding latency/complexity to the posting path | Confirm during Phase 1 scoping; if absent, add fee capture to webhook processing before ledger posting depends on it | Blocks ledger development if confirmed absent |
| 7 | Refund/dispute webhook handling not confirmed either way (Section 4) | **Medium** — unconfirmed | `src/handlers/stripe.js` | Reversing entries in a ledger require reliable refund/dispute event data; unclear if this exists today | Full read-through of `processStripeWebhookEvent` required before Phase 1 sign-off | Blocks ledger development if confirmed absent |
| 8 | No staging/preview environment declared in `wrangler.toml` | **Low–Medium** | `wrangler.toml` | Accounting-schema migrations and posting-logic changes have no safe environment to validate against before hitting production | Add a `[env.staging]` (or equivalent) D1 + Worker setup before ledger migrations begin | Should complete before pilot |

No Critical findings were identified in the areas sampled. This should not be read as "no critical issues exist" — the audit did not exhaustively read `processStripeWebhookEvent`, all of `src/handlers/parish.js`, or all Learn modules line-by-line, and a targeted deeper pass (especially of Stripe event handling and admin diagnostic/repair tools, which were not located/inspected in this pass) is warranted before Phase 1 sign-off.

---

## 9. Required Foundational Refactors (ranked)

**Must complete before Phase 1 (accounting control plane / registry):**
1. Add `npm run check` as a required, blocking CI step in `workflows/deploy.yml`.
2. Confirm (via full read of `processStripeWebhookEvent`) whether Stripe fee amounts and refund/dispute events are captured today; close the gap if not.

**Must complete before ledger development (journal entries, posting):**
3. Design and implement a real role/permission system (at minimum: parish-scoped roles distinguishing entry, approval, and signing authority).
4. Replace the hardcoded `d1(env)` single-database assumption with a parish-aware resolver, backed by the new central `accounting_databases` registry table.
5. Decide and document the Worker topology (extend existing Worker vs. new internal Worker behind a Service Binding) — this is a decision, not a refactor, but it gates how #4 is implemented.
6. Establish a background-job primitive (Cloudflare Queue or Workflow) — none exists today, and posting-with-retry, multi-database migration fan-out, and Aplos import all need one.

**Must complete before pilot (real parish, real money):**
7. Add a staging/preview environment for D1 + Worker so accounting migrations aren't validated against production directly.
8. Extend the existing backup/restore runbook pattern (already strong for `AGAPAY_DB`) to cover per-parish accounting databases.
9. Harden the new accounting-document R2 bucket's key convention (parish-scoped prefixes) as defense-in-depth beyond the app-layer check.

**Can be deferred until general release:**
10. Evaluation of Workers for Platforms / dispatch namespaces as the longer-term answer once static per-parish D1 bindings approach their practical ceiling.
11. Normalizing older non-accounting tables away from the JSON-blob-in-D1 pattern (not urgent — that pattern is fine for its current, non-ledger uses).

---

## 10. Proposed Phase 1 Scope — Accounting Control Plane

**This section defines scope only. Nothing here should be implemented from this audit.**

- **Tables to add to central `AGAPAY_DB`:** `accounting_databases` (parish_id, binding_name, cloudflare_database_id, status [`provisioning`/`active`/`suspended`], provisioned_at, last_migration_version); an accounting-specific roles/permissions table (or extension of however the eventual general role system is designed — this audit found no existing role system to extend, so this may need to be the first piece of a broader permission system, not accounting-specific).
- **Services to add:** an Accounting Gateway module (or Worker) that resolves `parish_id → binding` server-side only, and a migration-orchestration script/service that can apply a given migration file to every registered parish accounting database and record per-database status.
- **Files likely to change:** `wrangler.toml` (new bindings as parishes are provisioned), `src/lib/core.js` (new parish-aware D1 resolver alongside, not necessarily replacing, the existing single-DB `d1()` helper used by non-accounting features), a new `src/handlers/accounting.js` (or equivalent) kept separate from the existing 5,889-line `parish.js` rather than added to it.
- **New abstractions required:** journal-entry posting function(s) that enforce balanced debits/credits at the application layer (D1 itself won't enforce double-entry balance), a registry-resolution helper, a role-check middleware.
- **Tests required:** registry resolution correctness (right parish → right binding, always), unauthorized cross-parish access attempts (must fail closed), CI gate itself (Finding #2) verified working.
- **Migration considerations:** decide whether accounting-schema migrations are authored once and fanned out identically to every parish DB (recommended — do not allow per-parish schema drift) or allowed to diverge (not recommended for a system aiming to eventually support financial-statement standardization and Aplos migration at scale).
- **Risks:** binding-count ceiling in `wrangler.toml` (Section 5); no queue/workflow primitive yet for safe multi-database fan-out; no role system yet to gate who can even reach these new endpoints.
- **Acceptance criteria (suggested, not prescriptive):** a parish can be registered in `accounting_databases`, a real Cloudflare D1 database can be provisioned and bound, the Accounting Gateway can resolve that parish's requests to the correct binding and reject any request for a parish it isn't authorized for, and the CI gate blocks a deploy that fails the existing `npm run check` suite.

---

## 11. Open Architectural Decisions

1. **Worker topology: extend the existing Worker, or stand up a new internal Worker behind a Service Binding?**
   - *Options:* (a) extend `src/worker.js`/existing handler set; (b) new dedicated Worker for accounting, reached via Service Binding.
   - *Advantages of (a):* no new deployable, reuses existing auth/session code directly, simpler local dev (still not solved, but not *worse*).
   - *Advantages of (b):* isolates the accounting binding surface (so `wrangler.toml`'s non-accounting bindings don't get harder to review as accounting bindings grow), a security boundary (a bug in Learn or commerce code cannot accidentally reach an accounting D1 binding it was never given), independent deploy cadence for something that will carry more compliance/audit weight than the rest of the app.
   - *Disadvantages of (b):* another deployable to operate, Service Binding call overhead (small but nonzero), local-dev story has to be built from scratch either way.
   - *Recommendation:* (b), given the compliance sensitivity of accounting data and the value of a hard binding-isolation boundary.
   - *Consequence of delaying:* every week spent building on the existing Worker without this decision made increases the cost of separating later.

2. **Binding-scaling ceiling: how many parishes before static D1 bindings stop working, and what's the trigger to move to Workers for Platforms / dispatch namespaces?**
   - *Options:* set a hard number now (e.g., "re-evaluate at 50 active accounting parishes") vs. leave it open-ended.
   - *Advantages of setting a number now:* forces the Workers-for-Platforms evaluation to happen before it's an emergency; gives a concrete planning input.
   - *Disadvantages:* the "right" number depends on Cloudflare account limits and `wrangler.toml` practical size limits that weren't verified in this audit (out of scope — requires checking current Cloudflare account-level binding limits, not found in this repo).
   - *Recommendation:* set a placeholder trigger now (order-of-magnitude — low tens), revisit with actual Cloudflare account limits confirmed.
   - *Consequence of delaying:* risk of hitting a hard platform ceiling with no fallback plan mid-rollout.

3. **Role system: build a minimal accounting-only role system now, or build (or at least design) a general-purpose AGAPAY role system that accounting is the first consumer of?**
   - *Options:* (a) accounting-specific roles bolted onto the existing parish-dashboard bearer-token model; (b) a general role/permission system.
   - *Advantages of (a):* faster to ship Phase 1.
   - *Advantages of (b):* avoids building two role systems (one now, a "real" one later) — this audit found zero existing role infrastructure to build on, so this is a from-scratch decision either way.
   - *Recommendation:* (b) — the audit's own required-role list (rector, treasurer, bookkeeper, AP clerk, approver, signer, viewer, auditor, support admin) is clearly general-purpose, not accounting-specific, and a narrow bolt-on would likely need to be redone.
   - *Consequence of delaying:* accounting ships with the same single-shared-credential model that's already a known weak point elsewhere in the app.

4. **Where does the migration orchestrator live, and how is per-database migration drift tracked?**
   - *Options:* extend the existing `wrangler d1 migrations apply` per-database (run manually or scripted N times) vs. build a dedicated orchestration tool/service.
   - *Recommendation:* start with a scripted fan-out over the existing Wrangler migration tooling (don't build custom migration tracking — reuse Wrangler's, per-database), formalize into a proper orchestrator only once parish count makes manual fan-out painful.
   - *Consequence of delaying:* not urgent to decide before Phase 1, but should be decided before more than a handful of pilot parishes are provisioned.

5. **Dedicated accounting R2 bucket vs. reuse of an existing bucket?**
   - *Recommendation (Section 7 detail):* dedicated bucket, private, following the exact pattern already established for `TAX_EXEMPTION_DOCS`/`GIVING_STATEMENTS` (no public `r2.dev` URL, ever; authenticated streaming only). Reusing `CAMPAIGN_ASSETS` (public bucket) for any accounting document would be a clear mistake given it already has a public URL.
   - *Consequence of delaying:* low urgency, but should be decided alongside the Phase 1 scope since document upload (vendor invoices, receipts) is an early accounting feature.

---

## 12. Final Recommendation

**Proceed with a separate D1 database per parish**, accessed through a dedicated internal Accounting Gateway (new Worker, reached via Service Binding) that statically binds one D1 database per participating parish and resolves `parish_id → binding` from a central registry table — never from client input. This is the approach most consistent with Cloudflare's actual, confirmed binding model (static, compile-time bindings; no dynamic runtime database selection available), keeps the strong per-tenant data isolation the accounting use case genuinely needs, and reuses real, already-solid AGAPAY infrastructure (Stripe webhook idempotency, the audit-log pattern, the backup/restore runbook) rather than inventing new mechanisms where good ones already exist.

This is explicitly **not** a recommendation for a shared multi-tenant accounting database with `parish_id` columns (the pattern AGAPAY uses for everything else today) — a general ledger's data-integrity, audit, and per-parish-backup/export requirements are a stronger case for the isolation a separate database provides than most of AGAPAY's existing features. It is also not a recommendation for deployment-per-parish (operationally unworkable) or unmediated Cloudflare-API D1 access (weaker security posture for the primary ledger path). Workers for Platforms/dispatch namespaces is flagged as the honest long-term answer once the static-binding approach's practical ceiling is reached — recommend deciding that ceiling explicitly (Open Decision #2) rather than discovering it under pressure.

---

## End-of-Report Summary

**1. Readiness verdict:** Not ready today. The gap is real but bounded — a registry table, a role system, a CI test gate, a background-job primitive, and one topology decision, not a rewrite. AGAPAY's existing Stripe-idempotency, audit-log, and backup/restore infrastructure are genuinely strong foundations to build on.

**2. Recommended per-parish D1 access architecture:** Static D1 binding per parish, held by a dedicated internal Accounting Gateway Worker, reached from the main Worker via Service Binding, with parish→binding resolution driven by a server-side registry table in central `AGAPAY_DB` — never by client-supplied identifiers.

**3. Five highest-priority prerequisites:**
   1. CI test gate before deploy (currently absent — `workflows/deploy.yml`).
   2. Confirm Stripe fee/refund/dispute event capture in `processStripeWebhookEvent` (unconfirmed in this pass).
   3. Real role/permission system supporting separation of duties (none exists today).
   4. Parish-aware D1 resolver to replace the hardcoded single-database `d1(env)` helper.
   5. A background-job primitive (Queue or Workflow) — none exists today, and is needed for safe multi-database posting/migration fan-out.

**4. Proposed Phase 1 implementation boundary:** Central-D1 registry table + Accounting Gateway topology + role-system foundation + CI gate. No ledger schema, no journal-entry posting logic, no parish accounting database provisioned for real use yet.

**5. Uncertainties that must be resolved before coding begins:**
   - Whether Stripe fee amounts are captured anywhere today (Section 4/8, Finding #6).
   - Whether refund/dispute webhook handling exists today (Section 4/8, Finding #7).
   - Actual Cloudflare account-level D1-binding and `wrangler.toml` practical limits (not verifiable from this repo — needs a Cloudflare-account-level check).
   - Whether Workers for Platforms/dispatch namespaces is available/enabled on AGAPAY's Cloudflare account (not evaluable from this repo).
   - Full contents of `processStripeWebhookEvent` (900-line file, sampled not fully read) and `src/handlers/parish.js` (5,889 lines, sampled not fully read) — a targeted full read of both is recommended before Phase 1 sign-off, specifically for any additional accounting-relevant logic this pass may have missed.
   - Whether any admin "repair tool" or direct-SQL diagnostic endpoint exists that could bypass planned tenant checks (mentioned in the audit brief's security-risk list; not located in this pass — worth an explicit targeted search before pilot).
