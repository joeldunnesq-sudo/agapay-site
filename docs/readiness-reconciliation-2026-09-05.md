# Historical reconciliation and live acceptance — September 5, 2026

Application commit: `6b821bbb371580cec1fa95a3f7f770fc45184c18`.

## Historical financial reconciliation

Read-only production D1 queries were compared with the authenticated Stripe dashboard. No production financial records, Stripe payments, refunds, subscription settings, or emails were changed. Raw query evidence is retained locally under `artifacts/readiness-2026-09-05/`, outside version control.

The central database contains 95 donation records: 91 paid St. Fiacre demo records, one expired unpaid St. Fiacre checkout, one paid Test Lubbock gift, and two expired unpaid Test Lubbock checkouts. Both bookstore records are explicitly identified as demo records. There are no duplicate nonempty payment-intent IDs in the donation table. All 33 donation records with subscription IDs belong to St. Fiacre's seeded demo history; there are no recorded live recurring donations to reconcile.

Test Lubbock is mapped to connected account `acct_1U3nOw6HOK0CIbX2`, displayed by Stripe as Anchor Podcasting (AgaPay). Its unfiltered Payments view shows one succeeded payment, zero refunded payments, zero disputed payments, and no additional PaymentIntents. That payment exactly matches the stored PaymentIntent, charge, and Checkout Session identities.

| Item | AGAPAY | Stripe | Result |
| --- | ---: | ---: | --- |
| Donor charge | $1.34 | $1.34 | Match |
| Gift amount | $1.00 | $1.00 in metadata | Match |
| Processing fee | $0.34 | $0.34 | Match |
| AGAPAY fee | $0.00 | $0.00 in metadata | Match |
| Gift net before separate account fees | $1.00 | $1.00 | Match |
| Fund identity | Missing `fundId`; label Candles / Vigil Lights | `fund_id=candle`, same label | Recoverable omission |

Payment: `pi_3U3pMy6HOK0CIbX21Qeb6CmW`, succeeded August 13. Stripe's payout `po_1U6JpR6HOK0CIbX2YMFuODzG` was paid August 20 for $0.85. Its composition is the $1.00 net charge minus a separate $0.15 Radar fee. This explains the difference between the gift net and the bank payout; it is not a missing donation or an AGAPAY fee.

AGAPAY records its receipt as sent at `2026-08-13T03:32:18.017Z`. Stripe shows no Stripe-sent receipts; AGAPAY sends its own receipt, so these are different delivery systems. This audit verifies the application marker, not inbox delivery or the provider's historical delivery log.

The exact historical metadata repair is to restore `fundId: "candle"` on the single matching Test Lubbock offering. Stripe provides the original stable ID, so no interpretation of the current fund catalog is needed. This report does not execute that repair or resend the receipt.

Test Lubbock's accounting database is active and healthy, but contains no journal entries or integration source events. Both giving and Stripe posting are disabled, posting mode is `review_required`, and the integration start date is August 30. The August 13 gift and August 20 payout predate that start. Consequently, this is a reconciled operational payment, not a demonstrated historical ledger posting. Choosing a backfill period or opening-balance treatment remains a separate accounting configuration decision.

Scope limitation: the comparison covers recorded parish donations/bookstore orders and the associated live connected-account payment/payout history. It does not constitute a platform subscription revenue audit, a bank-statement audit, or proof that each demo balance is a real Stripe balance.

## Live two-parish acceptance attempt

The current main commit was deployed successfully to the isolated staging Worker by [run 33988749261](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/33988749261). Quality checks, the full test job, central/parish migrations, and staging deployment passed.

The protected two-parish acceptance workflow was then dispatched against `https://agapay-site-staging.joeldunnesq.workers.dev` using the existing `accounting-release-gates` credentials: [run 33989007249](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/33989007249).

**Result: blocked at authentication; not passed.** Password login returned HTTP 200 without a session token, which the bootstrap script does not handle. Privileged login now requires the MFA challenge/enrollment flow. The bootstrap failure caused subsequent reconciliation, giving catalog, check-print, service-worker, and cross-parish matrix steps to be skipped. No cross-parish attempt count should be attributed to this run.

The current staging registrations also use `acct_staging_*` onboarding simulation IDs, not real Stripe test-account IDs. These fixtures can exercise onboarding presentation but cannot demonstrate real Stripe checkout, payout reconciliation, recurring billing, or webhook delivery. Existing synthetic commerce history indicates earlier test activity, but does not establish that the current setup remains connected.

The latest production smoke artifact from [deployment 33987746217](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/33987746217) reports public health passed and `authenticated.status=blocked_missing_credentials`. A green deployment job must not be described as a successful authenticated two-parish test. The staging runbook intentionally keeps staging credentials out of production deployment secrets.

## Work required to finish acceptance

1. Complete staging administrator authentication and restore real Stripe test connections through normal onboarding routes; keep production keys/accounts unchanged.
2. Enroll/verify the dedicated test principals' MFA and update the acceptance harness and protected credential storage to support it. Do not disable MFA, reset an existing factor, or fabricate authenticated sessions to make a gate pass.
3. Rerun all authenticated gates and retain their actual evidence.
4. Exercise one-time and recurring Stripe test payments, delayed-payment success/failure, renewal, cancellation, refunds, replay, receipts, donor history, fund reports, and accounting effects. The current failed run proves none of these.
5. Verify the shared-dashboard initial launch, independent accounting PIN, and 30-day trial/billing transition on the deployed test system. The prior local regression results remain useful but are not substitutes for this acceptance evidence.

A separate real backup restore remains outside the completed checks in this report.
