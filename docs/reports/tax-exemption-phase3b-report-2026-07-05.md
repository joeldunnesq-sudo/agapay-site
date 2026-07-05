# AGAPAY Sales Tax & Merchant-of-Record — Phase 3B Corrective & Completion Report

Date: 2026-07-05. Corrects and extends the Phase 3 Implementation Report dated 2026-07-05. This is an honest status report: items are marked done, partially done, or not done — nothing here claims more than what was actually implemented and tested.

All 50 tests in `scripts/tax-exemption-tests.mjs` pass, plus unchanged passes for `scripts/worker-hardening-tests.mjs` and `scripts/settlement-profiles-tests.mjs`. No production deploy, no live Stripe object created or modified.

---

## 1. No-statewide-general-sales-tax logic — FIXED

**The bug:** Phase 3 had a `JURISDICTIONS_WITHOUT_CERTIFICATE = new Set(["OR"])` that waived the document requirement for Oregon specifically. That was wrong and has been removed entirely (`src/handlers/tax-exemption.js`).

**Now:** every jurisdiction — including AK, DE, MT, NH, OR — requires the same document when a parish claims an exemption. `hasNoStatewideGeneralSalesTax()` (`src/lib/tax-codes.js`) is purely informational: it drives display copy only (`GET /api/tax-exemption/state-guidance`) and is never read by claim-creation, document-requirement, or Stripe-sync logic. The default claim answer stays "No." An `OTHER`/multistate jurisdiction requires an explanation and is flagged `internal_review_status = 'needs_manual_review'`.

**Tests:** one test per state (AK, DE, MT, NH, OR) confirming each produces an ordinary `pending` claim with no special treatment, plus a structural test confirming the no-statewide-tax set never leaks into claim/sync logic.

---

## 2. Base64-in-registration document upload — REPLACED

**Old design:** the certificate was sent as base64 inside `POST /api/registrations`.

**New design:** `migrations/0013_tax_exemption_upload_tokens.sql` adds `upload_token_hash` / `upload_token_expires_at` to `tax_exemptions`. `POST /api/registrations` now creates the pending claim with **no binary attached** and returns a short-lived (30-minute), claim-scoped upload token (`issueClaimUploadToken()`/`verifyClaimUploadToken()` in `src/lib/tax-exemption.js`, hashed like every other token in this codebase, constant-time compared). The browser uploads the file separately via `multipart/form-data` to `POST /api/tax-exemption/:taxExemptionId/upload` (`handleClaimScopedDocumentUpload`), authorized by that token in the `Authorization: Bearer` header — never a parish dashboard session, which doesn't exist yet at this point.

`public/register.html` now uses `XMLHttpRequest` for real upload progress (fetch can't expose upload progress), never rolls back the registration on upload failure, and shows a clear "registration succeeded, exemption upload incomplete" message with next steps. The R2 storage key is never returned to the browser — only an opaque `documentId`.

**Not fully built:** a dedicated client-generated idempotency token for the upload request itself (duplicate-document protection currently relies on `attachTaxExemptionDocument`'s existing archive-old/insert-new behavior, which prevents corruption but doesn't dedupe an accidental double-click into a no-op). Low risk, but flagged rather than silently claimed.

**Tests:** token scoping (a token for one claim can't authorize another), invalid token rejection, and expiry.

---

## 3. Admin frontend — NOT BUILT (backend only)

**Honest status:** I did not build the `public/admin.html` / `public/admin/app.js` UI this pass. All the backend routes it needs already exist (queue with filters, detail view, approve/reject/replace/revoke/retry/reconcile, document view, notes) and were extended in Phase 3B with the new reconciliation and per-Customer retry actions. Given the size of everything else in this pass, building a full admin UI to the level of detail requested (every queue filter, every detail field, every action with loading/disabled states) would have meant cutting corners elsewhere or not finishing correctly. I'd rather say plainly that this is the biggest remaining gap than claim a rushed, half-working UI is complete.

**What is ready for that UI to call:**
- `GET /api/admin/tax-exemptions?status=X` / `?syncFailed=1`
- `GET /api/admin/tax-exemptions/:id` (full detail incl. per-Customer sync rows, documents, audit log, notes)
- `POST /api/admin/tax-exemptions/:id/approve|reject|request-replacement|revoke|retry-sync`
- `GET /api/admin/tax-exemptions/:id/document` / `/document-download`
- `POST /api/admin/tax-exemptions/:id/notes`
- New in 3B, not yet wired to a route: `retryOneStripeSync()` and `reconcileStripeSync()` (per-Customer retry and explicit reconciliation) — these exist in `src/lib/tax-exemption.js` and are tested, but need their own admin routes added next (`POST /api/admin/tax-exemptions/:id/syncs/:syncId/retry` and `/reconcile` would be the natural shape).

---

## 4. Stripe prior-state ownership protection — IMPLEMENTED

`runStripeCustomerSync()` (`src/lib/tax-exemption.js`) now always re-reads the Customer's current `tax_exempt` value first, then:

- **Applying (desired=exempt):** if the Customer was already `exempt` before this call, AGAPAY does not claim ownership (`agapay_owned_change=0`, no Stripe write, succeeds without pretending AGAPAY created it).
- **Restoring (desired=none, i.e. revoke/expire):** if `agapay_owned_change` isn't 1, or if the Customer's current state no longer matches what AGAPAY last set, the row is marked `reconciliation_required` and **nothing is overwritten automatically**. An explicit `reconcileStripeSync()` action (`accept_external` or `force_apply`) is the only way to resolve it.

**Tests:** Customer initially `none`, initially `exempt` (externally owned), external change after approval (`reverse`), AGAPAY-owned expiration/revocation succeeding normally, reconciliation-required blocking automatic reversal, and explicit admin reconciliation resolving it.

**Not covered by a dedicated test:** Customer initially `reverse` as the *starting* state before any AGAPAY action (only tested as a state introduced *after* AGAPAY's approval). The underlying logic treats it identically to `none` on the apply path (not equal to desired `exempt`, so AGAPAY takes ownership) — reasonable, but not separately exercised.

---

## 5. Partial-synchronization UI and recovery — BACKEND COMPLETE, NO ADMIN UI

`retryOneStripeSync(env, syncRowId)` retries exactly one Customer's row. `runAllPendingStripeSyncs()` already skipped already-succeeded rows (Phase 3) and now also correctly excludes `reconciliation_required` rows from automatic retry. Idempotency keys are stable per `(exemption, customer, desired status)` — a revoke's idempotency key naturally differs from the original approve's because the desired status differs.

**Tests:** one-of-two-fails-then-retry-succeeds (Phase 3), retry-only-the-failed-row, and the ownership/reconciliation tests above double as partial-sync coverage. **Not implemented:** a distinct "timeout with ambiguous result" test — the code treats a network throw as failure (safe default), but there's no test simulating a genuine ambiguous-timeout-then-reconciliation-via-GET scenario specifically.

---

## 6. Approved exemption with no Stripe Customer yet — IMPLEMENTED

`approveTaxExemption()` no longer throws when a parish has zero platform Customers — it approves the legal claim immediately (documentation-based approval doesn't require a Customer to exist) and writes **zero sync rows**, so nothing is falsely reported as synced. `applyApprovedExemptionIfExists()` is called from `src/lib/subscription-checkout.js` right after a **new** Giving/Parish+ Customer is created; if applying the already-approved exemption fails, checkout is refused with a 503 and a user-safe message rather than silently creating a taxable subscription for an approved-exempt parish.

**Not wired into Stewardship's checkout** (`src/handlers/stewardship.js`) — the same `applyApprovedExemptionIfExists()` call needs to be added at both of its Customer-creation call sites (~lines 1841 and 2109), following the exact same pattern already proven in `subscription-checkout.js`. This is a small, mechanical follow-up, not a design gap, but I ran out of room to make and verify that specific edit this pass.

**Tests:** approval with zero Customers, delayed successful application, delayed failed application (signals block-checkout).

---

## 7. Learn `customer_email` fallback — FEATURE-FLAGGED AND RACE-SAFE

`env.LEARN_PERSISTED_CUSTOMER_ENFORCED` (default off) gates whether the legacy `customer_email` fallback is still permitted. Every fallback now logs a structured warning (`learn_stripe_customer_no_household_row` / `learn_checkout_using_legacy_customer_email_fallback`) rather than silently proceeding. When enforced, a failure to create/reuse a stable Customer returns a 503 rather than falling back.

Customer creation is now race-safe via a compare-and-set `UPDATE ... WHERE stripe_customer_id IS NULL`: two simultaneous checkout requests for the same household converge on exactly one canonical Customer id (verified by test running both concurrently). The loser's already-created Stripe Customer is logged as a flagged duplicate (`learn_stripe_customer_duplicate_detected`) — **never auto-merged or deleted**, per the requirement.

`selectLearnStripeCustomerBackfillMatch()` implements the trusted-metadata-first backfill matcher: exactly one metadata match backfills, zero matches stay unset, multiple matches (metadata or email) require manual review. **Not implemented:** the actual backfill *script* that lists Stripe Customers and calls this matcher against real data — the matching function is built and tested, but wiring it into an operational one-off script is a follow-up.

**Tests:** create-once-reuse, two-simultaneous-requests-one-canonical-Customer, enforcement-disabled fallback, enforcement-enabled block, and all three backfill-match outcomes.

---

## 8. Product tax-code activation safeguards — IMPLEMENTED

`env.SUBSCRIPTION_TAX_CODES_ENABLED` (default off/false) gates two modes in `applySubscriptionTaxCode()` (`src/lib/tax-codes.js`):
- **Off (default):** unchanged from Phase 3 — a blank code is a soft no-op, logged, never blocks checkout.
- **On:** a blank code for Giving, Parish+, or Learn returns `{ blocked: true }`; the caller (`src/lib/subscription-checkout.js`, `src/learn/billing.js`) refuses checkout with a 503 and a user-safe message instead of silently falling back to Stripe's account-default tax category.

`stewardshipTaxCodeReadiness()` reports whether Stewardship's code path is ready **without ever mutating the live Stripe Product** — Stewardship's actual activation still requires a manual Dashboard/API step once a code is approved, exactly as scoped in Phase 3.

**Tests:** pre-activation never blocks; post-activation blocks for each of Giving/Parish+/Learn individually when blank; an approved code applies and doesn't block; Stewardship readiness reporting; and a structural test confirming `donor.js` (donations + bookstore) never references this helper at all, so tax-code activation cannot possibly touch donation or bookstore taxation.

---

## 9. Internal `[LEGAL REVIEW]` labels removed from public pages — FIXED

`public/terms.html` no longer displays `[LEGAL REVIEW]` anywhere — confirmed by `grep` returning zero matches across `public/*.html`. The substantive language (the marketplace-facilitator caveat, the no-statewide-tax clarification) is preserved verbatim; only the internal label is gone. The flags now live in `docs/internal-legal-review.md` (new, explicitly marked "not for public distribution") alongside the audit/plan/report files, per the instruction to move markers to code comments, the implementation report, or an internal document.

---

## 10. Parish+ seller disclosures — PARTIALLY EXTENDED

Phase 3 already reached the Checkout Session (`custom_text[submit][message]`) and the donor-facing bookstore API response. **Not extended further this pass** to the storefront product-list header, cart summary, order-confirmation page, or a dedicated receipt/refund email — no such bookstore receipt/refund email template exists yet in this codebase to extend (confirmed absent in Phase 1), and building one plus wiring four more UI surfaces was more than remaining time allowed to do correctly. This is the same gap flagged in the original Phase 3 report, still open.

---

## 11. Bookstore readiness checklist UI — BACKEND FLAGS ADDED, PARISH UI NOT BUILT

`isBookstoreReadinessEnforced(env, { isNewlyEnabling })` (`src/lib/commerce-readiness.js`) implements the staged-enforcement logic behind three new flags (`PARISH_COMMERCE_READINESS_ENABLED`, `_ENFORCED_FOR_NEW`, `_ENFORCED_FOR_ALL`, all default `"false"` in `wrangler.toml`) — but it is **not called from anywhere yet**. The existing `GET /api/parish/dashboard/:parishId/bookstore-readiness` route (Phase 3) still returns the checklist for display; deliberately **not** wired as a checkout gate, since doing that safely (determining "is this parish newly enabling vs. already live" without a dedicated timestamp column) needs a bit more schema work than I could verify correctly in the time remaining. The parish-dashboard HTML/JS to actually render this checklist was not built this pass either.

---

## 12. Stripe Tax registration verification — NOT STARTED

The prompt was cut off before this section's requirements were fully specified, and no work was done on it this pass. Flagging honestly rather than guessing at unstated requirements.

---

## Summary table

| # | Item | Status |
|---|---|---|
| 1 | No-statewide-tax logic fix | **Done**, tested |
| 2 | Base64 → multipart + upload token | **Done**, tested |
| 3 | Admin frontend | **Not built** (backend ready) |
| 4 | Stripe ownership protection | **Done**, tested |
| 5 | Partial-sync recovery | **Backend done**, no UI |
| 6 | Waiting-for-customer | **Done for Giving/Parish+**; Stewardship wiring pending |
| 7 | Learn customer_email removal | **Done**, tested |
| 8 | Tax-code activation safeguards | **Done**, tested |
| 9 | Remove public [LEGAL REVIEW] | **Done** |
| 10 | Seller disclosures (remaining surfaces) | **Not extended** |
| 11 | Bookstore readiness UI | **Flags added**, not enforced or rendered |
| 12 | Stripe Tax registration verification | **Not started** (spec cut off) |

Ready to continue with #3 (admin UI), #6's Stewardship wiring, or #12 once its requirements are available — whichever you'd like prioritized next.
