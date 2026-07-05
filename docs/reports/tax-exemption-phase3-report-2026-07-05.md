# AGAPAY Sales Tax & Merchant-of-Record — Phase 3 Implementation Report

Date: 2026-07-05. This report documents what was actually built, verified against the repository, tested, and what remains for a follow-up pass. No production deploy was performed — this is code + migrations ready for Joel to deploy via the existing Wrangler/GitHub Actions pipeline.

## 1. Repository tracing (resolved before implementation)

| Item | Verified location |
|---|---|
| Registration POST target | `POST /api/registrations` (`src/worker.js`) → `handleRegistrations()` (`src/handlers/parish.js`) |
| Registration persistence | `saveRegistrationRecord()` (`src/handlers/parish.js`), table `registrations`, JSON `data` column + promoted columns |
| Registration response shape | `{ ok, reference, mode, message }`, now also `taxExemption` when a claim was submitted |
| Parish dashboard route | `GET/PATCH /api/parish/dashboard/:parishId` → `handleParishDashboard()`, bearer-token auth via `verifyParishDashboardBearer()` |
| Bookstore storefront handler | `handleDonorBookstore()` (`src/handlers/donor.js`) |
| Bookstore checkout | Same function — direct charge, `stripeFormConnectedRequest`, confirmed unchanged in this phase |
| Worker scheduled entry point | `export default { async scheduled(event, env, ctx) {...} }` in `src/worker.js`, existing weekly cron `"0 14 * * 6"` |
| Admin auth | `requireAdminContext()` / `verifyParishDashboardBearer()` / `getBearerToken()` (`src/handlers/parish.js`, `src/lib/core.js`) |
| Stripe raw-fetch helpers | `src/lib/stripe-connect.js` (`stripeFormRequest`, `stripeGetRequest`, `stripeFormConnectedRequest`, `stripeGetConnectedRequest`) — no Stripe SDK, no `Stripe-Version` header anywhere |
| D1 helpers | `d1`, `d1First`, `d1All`, `d1Run` (`src/lib/core.js`) — **no batch support existed**; added `d1Batch()` this phase |
| R2 binding convention | `wrangler.toml` `[[r2_buckets]]`; existing `CAMPAIGN_ASSETS` is public — new `TAX_EXEMPTION_DOCS` binding added, must not be made public |
| Test framework | No external test runner. `node:assert/strict` + hand-rolled `test()` helper + `node:sqlite` `DatabaseSync` D1 shim (established precedent: `scripts/settlement-profiles-tests.mjs`). New: `scripts/tax-exemption-tests.mjs` follows the same pattern. |
| Email/notification helpers | `sendEmail()`, `agapayEmailHtml()` (`src/lib/email.js`), Resend-backed |
| Learn household table | `learn_households` (`migrations/0003_agapay_learn_phase1.sql`), id = `learn_household_<slug(email)>`, deterministic, **not** recomputed on email change (documented technical debt, unchanged this phase) |
| Stewardship's separate Stripe Customer | `registration.stewardshipStripeCustomerId`, created independently in `src/handlers/stewardship.js` (~lines 1841, 2109) |

## 2. What was implemented

### Database (additive only — no existing table/column altered or dropped)
- `migrations/0011_tax_exemptions.sql` — `tax_exemptions`, `tax_exemption_stripe_syncs`, `tax_exemption_documents`, `tax_exemption_audit_log`, `tax_exemption_notes`; promoted `registrations.tax_exemption_status` / `tax_exemption_expiration_date` / `current_tax_exemption_id`. Includes a **partial unique index** enforcing at most one `approved` exemption per registration at the database level (SQLite supports partial indexes; verified with a real constraint-violation test).
- `migrations/0012_learn_stripe_customer.sql` — `learn_households.stripe_customer_id` (unique where present) + subscription tracking columns.
- `src/lib/core.js` — added `d1Batch(env, statements)` for atomic multi-statement local writes (Cloudflare `D1Database#batch`).

### Core logic (`src/lib/tax-exemption.js`)
- Single state-transition gate: `transitionTaxExemption()` is the only function permitted to change `tax_exemptions.status`; an explicit `ALLOWED_TRANSITIONS` map rejects anything else (verified by test: rejected → approved throws).
- Per-Customer Stripe sync tracked in `tax_exemption_stripe_syncs`, one row per applicable platform Customer (`giving_parish_plus` and/or `stewardship`). Idempotency key per `(exemption, customer, desired status)`. A Customer that already succeeded for the same desired status is never redundantly re-called on retry.
- `approveTaxExemption()` follows the required sequence: validate → resolve Customers → D1 rows to pending → Stripe calls → **only if every Customer succeeds**, D1-finalize to `approved`. Verified by test: one succeeding + one failing Customer leaves the claim `pending` (never partially approved), and a subsequent retry that only re-attempts the failed Customer finalizes the approval.
- `rejectTaxExemption()` never calls Stripe (verified by test).
- `requestReplacementDocumentation()` and `revokeTaxExemption()` disable the Stripe exemption using the same D1-pending → Stripe → D1-finalize pattern; `keep_active_during_replacement` defaults to `0` (no grace period), per the Phase 2 recommendation.
- `processExpiredTaxExemptions(env)` — scheduled-job entry point, wired into the existing `scheduled()` handler in `src/worker.js` alongside the existing weekly cron jobs.
- Every mutation writes to the append-only `tax_exemption_audit_log`; a separate `tax_exemption_notes` table holds free-form admin commentary.

### Secure document storage (`src/lib/tax-exemption-storage.js`)
- New R2 binding `TAX_EXEMPTION_DOCS` (`wrangler.toml`) — bucket `agapay-tax-exemption-docs`, **not** the public `CAMPAIGN_ASSETS` bucket. The bucket itself must still be created via `wrangler r2 bucket create agapay-tax-exemption-docs` before this binding resolves in a real environment — not something a code change can do.
- Fully random 32-byte-hex keys (`texdoc/<hex>`) — no parish name, reference, certificate number, filename, or email anywhere in the key (verified by test).
- Upload validation: extension + declared MIME type + magic-byte signature must all agree; SVG/HTML/executables rejected implicitly (not in the allow-list); 10MB max; empty files rejected (verified by test: a renamed text file fails, a genuine PDF signature passes, an 10MB+1-byte file is rejected).
- Documents are streamed directly from the Worker (`streamExemptionDocument()`) with `Content-Type` from validated stored metadata, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, a restrictive CSP, and `Content-Disposition` defaulting to `inline` with a distinct `attachment` mode for explicit admin downloads.

### Routes (`src/handlers/tax-exemption.js`, wired in `src/worker.js`)
- Public: `GET /api/tax-exemption/state-guidance?state=XX` — informational only, returns the no-statewide-tax copy; never used server-side to decide anything.
- Parish (bearer-auth via existing `verifyParishDashboardBearer`): `GET/POST /api/parish/dashboard/:parishId/tax-exemption`, `POST .../tax-exemption/upload`, `GET .../tax-exemption/document`.
- New: `GET /api/parish/dashboard/:parishId/bookstore-readiness` (see below).
- Admin (existing `requireAdminContext`): `GET /api/admin/tax-exemptions` (queue, with `status` and `syncFailed` filters), `GET .../:id` (full detail: registration, documents, audit log, notes, per-Customer sync rows), `POST .../:id/approve|reject|request-replacement|revoke|retry-sync`, `GET .../:id/document` and `.../document-download`, `POST .../:id/notes`.

### Registration-time claim submission
- **Resolved timing question from Phase 2**: rather than a second authenticated round-trip (the parish has no dashboard bearer token yet immediately after registration), the exemption claim — and, if provided, the document, base64-encoded — is submitted as part of the **same** `POST /api/registrations` request body (`body.taxExemption`), processed server-side by `handleRegistrations()` after the registration itself is saved. A failure here is caught and returned as `taxExemption.error` in the response; **it never blocks or rolls back the registration**, exactly as required.
- `public/register.html` — new "Sales Tax Exemption" section with the exact required copy, jurisdiction/type/certificate/dates/rep-name/rep-title/certification fields, file input, and the no-statewide-general-sales-tax informational notice (client-side only, purely descriptive — the shared list in `src/lib/tax-codes.js` is the server-side source of truth). Default claim answer is "No." Oregon is the one jurisdiction that doesn't require a document by default (`JURISDICTIONS_WITHOUT_CERTIFICATE` in `src/handlers/tax-exemption.js`) — still creates a `pending` claim rather than auto-approving.

### Stripe product tax codes (`src/lib/tax-codes.js`)
- `SUBSCRIPTION_TAX_CODES` (`giving`, `parishPlus`, `learn`, `stewardship`) — all blank pending CPA sign-off; `applySubscriptionTaxCode()` is a safe no-op when blank (verified by test) and logs a structured, non-sensitive warning when omitted.
- Wired into the actual line-item creation code: `src/lib/subscription-checkout.js` (Giving/Parish+ platform tiers — all four tiers map to the `giving` key since they're the same underlying product at different price points) and `src/learn/billing.js` (Learn). Stewardship's checkout uses a persisted Stripe `price` id rather than inline `price_data`, so its code must be set on the Stripe Product directly, not per-checkout — documented in `tax-codes.js`, not silently skipped.

### AGAPAY Learn Stripe Customer persistence
- `ensureLearnHouseholdStripeCustomer()` (`src/learn/billing.js`) — creates a Customer once, persists `stripe_customer_id` on `learn_households`, reuses it on every subsequent checkout. `learnBillingCheckout()` now passes `customer` (with `customer_update[address]: auto`) instead of bare `customer_email` whenever a household row already exists; falls back to `customer_email` only if the household record doesn't exist yet or Customer creation fails, so today's checkout never breaks mid-rollout. Metadata `agapay_household_id` / `agapay_product: "learn"` distinguishes it from parish and donor/bookstore Customers. `learn_households.id` is explicitly **not** recomputed from email — documented as existing technical debt in code comments, consistent with the Phase 2 plan's guidance not to attempt a broad primary-key migration in this phase.

### Parish+ bookstore seller-identity and readiness (no charge-model change)
- `src/lib/commerce-readiness.js` — `bookstoreReadinessChecklist()` / `bookstoreReadinessSummary()`, a non-blocking checklist (Stripe account status, seller display name, support email, refund/fulfillment policy, tax-responsibility and merchant-of-record acknowledgments, commerce terms acceptance). **Deliberately not wired as a checkout-blocking gate** — flipping already-enabled parishes to blocked would break live payments, which the assignment explicitly prohibits. Exposed read-only via the new `GET /api/parish/dashboard/:parishId/bookstore-readiness` route for the parish dashboard to render as a checklist.
- Seller disclosure (`bookstoreSellerDisclosure()`) wired into the actual bookstore Checkout Session via `custom_text[submit][message]` (`src/handlers/donor.js`) — the one AGAPAY-controlled surface every bookstore order already passes through — and returned in the donor-facing `GET` bookstore response. **Not yet threaded into**: the storefront product list, cart summary, order-confirmation page, or refund-email templates (no dedicated bookstore receipt-email function exists yet in this codebase to hook into) — flagged below as follow-up rather than silently skipped.

### Terms (`public/terms.html`)
- New **Section 8: "Parish+ Commerce & Merchant of Record"** (all subsequent sections renumbered 9–21, cross-checked — no broken anchors, no duplicate numbers) stating the parish is seller/merchant of record, controls pricing/inventory, is responsible for its own tax registration/collection/filing, and that AGAPAY is software/payment-infrastructure only — with an explicit `[LEGAL REVIEW]` flag on the marketplace-facilitator classification question, using language closely tracking the assignment's required framing.
- Section 9 ("Tax Status & Charitable Giving") gained two new bullets: AGAPAY's own subscription-seller/exemption status, and the no-statewide-general-sales-tax clarification (also `[LEGAL REVIEW]`-flagged).
- None of this is final legal language — flagged throughout for attorney review, per instructions.

## 3. Testing

New: `scripts/tax-exemption-tests.mjs` — 19 tests, all passing, using the same `node:sqlite`-backed D1 shim pattern as the existing `scripts/settlement-profiles-tests.mjs` (not wired into `npm run check` for the same Node-version reason that file isn't — see its header). Covers: no-statewide-tax state list correctness, tax-code no-op/set behavior, filename sanitization, storage-key randomness, upload signature/size validation, state-machine transition rejection, the database-level one-approved-exemption constraint, full approve success, **partial-failure-then-retry** (the multi-Customer scenario central to this feature), reject-never-touches-Stripe, revoke, scheduled expiration, replacement-without-grace-period, and document-replacement bookkeeping.

Regression check: `node scripts/worker-hardening-tests.mjs` and `node scripts/settlement-profiles-tests.mjs` both still pass unchanged after this phase's edits. `node scripts/check-learn.mjs` fails, but verified via `git stash` that this failure **pre-exists on `main`** and is unrelated to this work (a missing `public/manifest.webmanifest`, deleted in an earlier unrelated commit). `npm run check`'s first step (`scripts/check.mjs`) also hits that same pre-existing missing file.

`node --check` passes on every new/modified `.js` file.

## 4. Known follow-ups (not silently dropped)

1. **Bookstore seller disclosure** is wired into the Checkout Session and the donor API response, but not yet into the storefront HTML, cart UI, order-confirmation page, or a dedicated receipt/refund email (no such email function exists yet to extend — building one is a larger, separate task).
2. **Bookstore readiness checklist** is read-only/informational this phase, not checkout-blocking — a deliberate choice to avoid breaking live payments for already-enabled parishes; making any item blocking for *newly*-enabling parishes is a follow-up product decision.
3. **Stewardship's product tax code** must be set directly on the Stripe Product (Dashboard or one-time API call) once approved — it cannot be wired through the per-checkout code path like the other three products, since Stewardship references a persisted `price` id rather than inline `price_data`.
4. **`TAX_EXEMPTION_DOCS` R2 bucket** must actually be created (`wrangler r2 bucket create agapay-tax-exemption-docs`) before this binding resolves in any real environment — the `wrangler.toml` entry alone doesn't provision it.
5. **Admin UI** (`public/admin.html` / `public/admin/app.js`) was not touched this phase — the backend routes (queue, detail, approve/reject/replace/revoke/retry, document view, notes) are complete and ready to be wired into the existing admin tab structure, but that frontend build was out of scope for this pass given the size of the rest of the work; happy to take that on next if useful.
6. **`SUBSCRIPTION_TAX_CODES` values are all blank** — by design, pending CPA/tax-adviser sign-off, exactly as specified.
7. All `[LEGAL REVIEW]` items in the audit, plan, and terms language remain unresolved legal questions, not conclusions reached by this code.

## 5. Rollback

Every migration is additive (new tables, nullable columns) — reverting application code alone (via git) is sufficient to disable the feature; no schema rollback is needed or recommended. If a rollback of the code is needed, the new routes simply stop being called; nothing in this phase modifies or depends on rewriting existing rows in `registrations`, `donor_offerings`, `commerce_orders`, or `learn_households` beyond the new nullable columns.
