# Package 0.75B - Stripe Event Completeness

## Objective

Package 0.75B closes the Stripe webhook readiness gap before Phase 1 accounting. The goal is not to post accounting entries. The goal is to make Stripe activity complete enough to become a reliable operational source-event stream later.

## Implementation

- Added `src/accounting/stripe-source-events.js` as the accounting-facing source-event contract for Stripe events.
- Added schema versioning, event allowlisting, stable idempotency keys, Stripe identifier extraction, refund/dispute/payout normalization, and a ban on posting fields such as journal IDs, debit accounts, credit accounts, and posted timestamps.
- Corrected the confirmed commerce gap: Stripe charge disputes now mirror to bookstore `commerce_orders` through `disputeCommerceOrderFromStripe`, matching the existing refund behavior.
- Added `scripts/stripe-source-event-tests.mjs` to cover source-event envelopes, partial/full refunds, disputes, payouts, forbidden accounting fields, and commerce dispute state changes.

## Event Readiness Notes

Supported source events include checkout session completion/failure/expiry, payment intent success/failure/cancel, charge refunds, charge dispute creation/closure, invoice success/paid, and payout success/failure.

The contract captures operational identifiers and settlement-profile hooks, but intentionally does not create ledgers, journals, AP records, reconciliation records, accounting reports, or UI.

## Tests

- `node scripts/stripe-source-event-tests.mjs`
- `npm run check`

## Acceptance Verdict

Accepted. Stripe operational events now have an accounting-safe source envelope, and the confirmed commerce dispute reflection gap is fixed.

## Human Policy Decisions Before Phase 1

- Decide which Stripe event types become posting triggers versus audit-only source events.
- Decide how disputed/won/lost payment states map to Phase 1 accounting workflows.
- Decide whether payout events are used as settlement evidence, reconciliation evidence, or both.
