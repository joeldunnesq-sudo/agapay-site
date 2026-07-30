# Nonprofit-pricing application and monitoring workflow

**Date:** 2026-07-28
**Status:** Implemented locally; production infrastructure and deployment pending

## Stripe-confirmed operating rules

- Every AGAPAY Standard connected parish applies separately.
- The connected-account owner must be logged into the parish Stripe account.
- The parish must contact Stripe directly; AGAPAY cannot submit for it.
- Stripe’s review team notifies the connected account when pricing is applied.
- Measurement period, direct-charge coverage, covered card brands/origins, and API verification remain unresolved.

## Parish workflow

The Parish Dashboard now provides:

1. readiness checks using the complete Stripe volume scan;
2. an authorized-representative attestation;
3. EIN last-four storage only;
4. private nonprofit-document upload;
5. instructions for submitting while logged into the parish Stripe account;
6. Stripe support case tracking;
7. submission status; and
8. Stripe decision tracking, with approval evidence required before approval can be recorded.

AGAPAY does not activate discounted pricing from a parish attestation. Approval remains a separate Stripe decision and later fee-schedule activation step.

## Admin monitoring

The Admin Dashboard **Nonprofit Pricing** tab shows every connected parish:

- donation percentage and dollars;
- classified non-donation percentage and dollars;
- unclassified dollars;
- a 20% exposure meter;
- the calculated amount of additional non-donation volume the parish could process before reaching 20%;
- a what-if calculator for planned non-donation receipts;
- application and scan status; and
- risk band.

Risk bands:

- safe: below 15%;
- watch: 15%–17.49%;
- near: 17.5%–19.99%;
- breached: 20% or above;
- indeterminate: incomplete scan or no measured volume.

For safety, exposure equals classified non-donation volume plus unclassified volume. Daily scheduled alerts go to `NONPROFIT_PRICING_ALERT_EMAIL` once per parish per newly entered risk band. Returning to safe/indeterminate resolves the active alert; entering a later band produces a new alert.

## Private storage

Documents use `NONPROFIT_PRICING_DOCS`, a dedicated private R2 bucket. It must not have an `r2.dev` public URL. Files are limited to validated PDF, JPEG, or PNG content and are served only through authenticated Worker routes with private/no-store response headers.

## Production release order

1. Create the private R2 bucket `agapay-nonprofit-pricing-docs` with public access disabled.
2. Apply migrations `0041_stripe_nonprofit_volume_tracking.sql` and `0042_nonprofit_pricing_applications.sql`.
3. Confirm `NONPROFIT_PRICING_ALERT_EMAIL`.
4. Confirm the connected-account webhook endpoint receives `charge.succeeded`, `charge.updated`, and `charge.refunded`.
5. Deploy the Worker and assets.
6. Complete an initial volume scan for each pilot parish.
7. Submit a test attestation and private document in a non-production account.
8. Run the Admin Dashboard alert check and verify one email is sent and deduplicated.

## Verification

`npm run check` passes, including new workflow, threshold, storage-key, routing, UI-presence, migration, and existing regression tests.
