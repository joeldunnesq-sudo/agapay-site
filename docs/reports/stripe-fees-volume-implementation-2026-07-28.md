# Stripe fee and nonprofit-volume implementation

**Date:** 2026-07-28  
**Status:** Implemented locally; migration and deployment pending

## Delivered

- One authoritative integer-cent fee engine in `src/lib/payment-fees.js`.
- Standard card estimate remains 2.9% + 30 cents.
- ACH Direct Debit estimate is 0.8%, with no fixed fee and a $5 maximum.
- Cover-fee amounts now solve against the fee on the final gross charge.
- The public giving form receives fee schedules from the parish API instead of owning rate constants.
- ACH Checkout completion is not treated as payment until Stripe reports `payment_status=paid`.
- AGAPAY donation Checkout metadata is `qualifying_donation`.
- Bookstore Checkout metadata is `nonqualifying_commerce`.
- Existing metadata is conservatively classified; unknown charges remain `unclassified`.
- A D1 ledger stores gross, refunded, and net Stripe charge volume per parish.
- An authenticated dashboard endpoint incrementally scans year-to-date Stripe charges in bounded pages.
- Refund, charge-success, and charge-update webhooks update the local volume ledger.
- The parish dashboard shows donation, non-donation, unclassified, and estimated donation-share values.
- Giving summaries exclude commerce and unclassified Stripe charges.

## Conservative eligibility behavior

The displayed percentage is:

`qualifying donation net volume / all successful net Stripe charge volume`

Unclassified volume is included in the denominator and excluded from the numerator. AGAPAY only marks the 80% volume threshold as met after a complete scan (or while refreshing a previously completed scan). This is an operational estimate, not a Stripe approval.

## Release order

1. Apply `migrations/0041_stripe_nonprofit_volume_tracking.sql`.
2. Confirm the connected-account webhook endpoint subscribes to `charge.succeeded`, `charge.updated`, and `charge.refunded`.
3. Deploy the Worker and static assets.
4. Open each pilot parish dashboard and refresh **Stripe nonprofit volume** until the initial scan completes.
5. Review every unclassified charge before using the generated percentage in a Stripe application.

## Verification

`npm run check` passes, including fee cap/gross-up, classification, conservative denominator, webhook, route, migration, and existing platform regression tests.
