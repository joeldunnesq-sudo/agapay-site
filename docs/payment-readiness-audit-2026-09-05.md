# Parish readiness audit — September 5, 2026

Reviewed commit: `449a3b39ec18b78652f3dd4841f8de853fe79d4c`.

## Remediation

The code findings below have now been addressed. Recurring Checkout Sessions remain setup records, and each paid invoice creates one payment record and uses the accounting integration. Both legacy and current Stripe invoice shapes retain subscription/payment identities. Donor history hides redundant setup rows once an invoice exists. Checkout verification and account claiming do not convert unpaid payments into gifts. Stored fund IDs, refund/dispute fields, and receipt state survive subsequent updates, and late invoice events cannot reset a refund.

Receipts use a D1 delivery record with an atomic lease, frozen provider payload, and stable Resend idempotency key. Ambiguous retries stop before the provider's 24-hour key retention expires and remain in `needs_review` for reconciliation. Migration `0125_donation_receipt_delivery.sql` is required before deploying the application. Receipt delivery records are included in the reviewed parish portability inventory and financial retention policy.

Checkout now checks recurring/commemoration toggles and resolves active campaign identities from the parish catalog. Unavailable festal destination funds are rejected rather than silently redirected.

`node scripts/payment-integrity-tests.mjs` replaces the original audit reproducer with desired-behavior regression tests using real SQLite central and parish accounting databases. It covers event order, concurrent invoice processing, renewals, current invoice shape, partial refunds, receipt concurrency/retry, fund renames, and checkout settings. It is included in both the full CI suite and critical-path suite.

Historical production gifts have not been automatically rewritten. Ambiguous historical fund allocations and any previously duplicated donation/accounting records require reconciliation against Stripe before correction. Live two-parish testing, a real backup restore, and the production trial/billing transition remain deployment acceptance checks; local fixtures are not evidence that these live checks occurred.

The following findings describe the original audited commit, before remediation.

Recommendation: resolve the payment-integrity findings below before enabling recurring giving for another parish. This review found application defects; it does not establish whether existing production records are affected. No production transactions, emails, data changes, or deployments were made.

## Confirmed high-priority findings

### P1: Unpaid recurring checkout is treated as a completed donation

`src/handlers/stripe.js:521` sets status to completed whenever mode is subscription, even when payment_status is unpaid. The completed branch then invokes accounting and receipt handling. Checkout supports ACH (`src/handlers/parish-checkout.js:558`), so delayed payment is a supported path.

Reproduced by storing a pending monthly gift and delivering checkout.session.completed with mode subscription and payment_status unpaid. The result is status completed, paymentStatus unpaid. A later failure changes operational status but the async-payment-failed branch does not reverse the earlier accounting posting.

Required correction: distinguish subscription creation from settled payment. Keep unsettled gifts pending; issue donation receipts and journal entries only for confirmed payment. Test ACH success and failure after checkout completion.

### P1: The first recurring payment becomes two completed gift records

Checkout persists the offering under the Checkout Session ID (`src/handlers/parish-checkout.js:603`). Checkout completion marks it completed. Invoice payment separately inserts an offering under the Invoice ID (`src/handlers/stripe.js:709`). There is no initial-invoice reconciliation between those records. The paid-offering query returns both (`src/handlers/parish-giving-read-models.js:69`).

Reproduced checkout completion, async payment success, and the initial paid invoice for one subscription: one $10 payment becomes two completed $10 records. This is duplicate recording, not evidence of two Stripe charges. It can inflate giving history and totals and create separate receipt/commemoration sources.

Required correction: establish one canonical payment identity across Session, Invoice, and PaymentIntent events. Preserve the subscription/setup record without counting it as an additional payment. Test both event orders and replay.

### P1: Recurring invoice payments lack a reliable accounting handoff

The invoice-paid branch (`src/handlers/stripe.js:686`) stores a gift, creates commemoration data, and attempts its receipt, but never calls wireGivingOfferingToAccounting. The PaymentIntent branch only posts when an offering already exists (`src/handlers/stripe.js:599`, `:613`). If payment_intent.succeeded arrives before invoice.paid, there is no renewal offering to update/post; invoice.paid subsequently creates it without posting it.

This is a confirmed missing call and event-order dependency from code tracing, not a live-ledger reproduction. The invoice reproducer verifies that the branch creates the operational record. No automatic giving backfill was found in the reviewed accounting/operations paths.

Required correction: post the canonical paid-invoice gift through the idempotent accounting integration and test PaymentIntent-before-Invoice, the reverse order, and retries against a real SQLite accounting fixture.

### P1: Saving a gift discards its stable designated-fund ID

Checkout and invoice callers supply fundId, but storeDonorOffering omits it from the persisted record (`src/handlers/parish-donor-offerings.js:59`). The same serializer serves D1 and KV. Accounting and reporting fall back to the fund's name.

Reproduced: save a gift with fundId stable-fund-id and name Special Fund; rename that fund and reuse Special Fund for another ID. createFundAllocationResolver assigns the saved gift to the other fund. Restoring its original ID produces the correct allocation. This can misclassify historical designated gifts and undermine the existing catalog's identity protections.

Required correction: persist stable allocation IDs throughout storage and updates. Review affected historical gifts for recoverable Stripe metadata; do not guess ambiguous allocations from reused names.

## Further issues to address

### P2: A second invoice event resets receipt deduplication

Both invoice.paid and invoice.payment_succeeded enter the same store path. storeDonorOffering replaces the entire data document and defaults missing emailReceiptSentAt to an empty string (`src/handlers/parish-donor-offerings.js:96`, `:121`). The subsequent receipt check therefore loses its durable sent marker.

Reproduced by persisting a sent marker after invoice.paid, then processing invoice.payment_succeeded for the same invoice. The marker is erased. No email was sent by the reproduction. A duplicate receipt is possible when a provider is configured. The receipt send itself also uses a read/check/send sequence without an atomic claim.

Required correction: preserve delivery state during financial updates and use a stable provider idempotency key plus durable delivery state. Test both invoice event types and concurrent delivery.

### P2: Checkout does not consistently enforce parish giving settings

Code inspection: parishFromRegistration exposes recurringGivingEnabled and commemorationsEnabled, but handleCheckout only validates the frequency's vocabulary and the Give+ entitlement. It does not reject recurring gifts when the parish has disabled them or commemorations when that toggle is off (`src/handlers/parish-checkout.js:389`, `:399`). Ordinary campaign IDs/names are accepted from the request rather than resolved against the parish's active catalog (`:488`); unmatched festal campaigns fall back to a default fund.

A stale page or crafted request can therefore bypass UI choices. These paths were inspected but not exercised through a complete mocked checkout in this audit. Enforce settings and canonical active campaign/fund allocation before creating a Stripe session; reject unavailable selections with actionable messages.

## Validation performed

- The initial in-memory audit reproducer confirmed the unpaid status, duplicate first-payment records, lost fund identity/misallocation, and cleared receipt marker. It has been replaced by `scripts/payment-integrity-tests.mjs` as described above.
- `npm run check:critical`: all 13 command groups passed, including worker security, authentication, organization authorization, accounting gateway/staff/ledger, migrations, and Stripe source events.
- Targeted accounting trial access, provisioning, giving catalog, and D1 recovery tests all passed.
- No live second-parish cross-tenant gate or restore drill was performed. The live cross-tenant script requires two parishes and their credentials; local fixture checks cannot establish production readiness.

Stripe's [webhook guidance](https://docs.stripe.com/webhooks) explicitly requires handling duplicate events and does not guarantee event order. Its [subscription webhook documentation](https://docs.stripe.com/billing/subscriptions/webhooks) describes invoice-paid processing. These are normal integration conditions that the regression suite should cover.

## Acceptance criteria for the next parish

After correction, run a test-mode journey with two distinct parishes: initial shared-dashboard launch, independent accounting PIN, one-time card gift, pending/successful/failed ACH gift, first recurring gift and renewal, cancellation, partial/full refund, receipt, donor history, fund report, and matching balanced accounting entry. Replay and reorder payment events and confirm exactly one gift, receipt, and journal effect per payment. Verify no cross-parish access for dashboard sessions, accounting PIN sessions, and object IDs. Advance the 30-day trial through its billing transition in a controlled test environment and test payment failure/recovery. Verify an actual backup restore separately from manifest/checksum unit tests.

The audit concentrates on payment-to-accounting correctness and the second-parish access/provisioning boundaries. Passing existing tests does not certify every module, browser flow, external service configuration, or production record.
