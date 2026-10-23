# Accounting staging release — October 23, 2026

The accounting fixes are deployed to the dedicated staging environment, and the protected release workflow passed in full. This record supplements the [original readiness review](readiness-review-2026-10-23.md); it does not replace the historical production release record.

## Application changes

The release makes journal creation, posting, payable finalization and reversal atomic; enforces version, period and lock checks within write transactions; validates calendar dates and safe whole-cent totals; binds idempotency to its journal; and protects authenticated actor, tier and URL-selected IDs from submitted JSON.

Live acceptance also exposed an operational gap: the current fiscal period was still future, and the application had no authorized way to open it. Settings now allows a user with accounting configuration capability to open an unused period in an open fiscal year. The operation checks its version and locks inside the transaction and records a `period.opened` audit event. Closed books continue through the existing close/reopen workflow.

The next protected run found an older initialized ledger without its configuration row. Settings now offers authorized setup completion in this state, and the existing initialize action calls the setup service rather than only ledger initialization. The service preserves existing books and creates missing configuration.

DOMPurify and the shipped browser sanitizer were upgraded to 3.4.17. The dependency audit reports zero advisories.

## Protected acceptance

The protected workflow uses named staff authentication, MFA and the Accounting PIN flow against the dedicated staging origin. Its service-worker fixture recognizes the generated cache declaration. The isolation matrix retries transport failures only; any HTTP response is evaluated immediately, and only 401, 403 or 404 is accepted for a foreign parish.

The reconciliation fixture contains a failed payout without settlement transactions. Its smoke test verifies that failed payouts contribute no deposited amount, missing bank confirmation and bank differences are rejected, and incomplete reports cannot close. This fixture establishes fail-closed behavior; it does not establish successful automatic settlement matching.

## Release evidence

- Staging: https://agapay-site-staging.joeldunnesq.workers.dev
- Deployed application commit: `786d4132`.
- Worker version: `bc2c87df-214a-4f15-a106-7919f7bc57c9`.
- [Deployment and required checks](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/40006715463): Quality, all 338 application test commands, central and both parish migrations, and deployment passed. Public health returned HTTP 200 with `ok: true`.
- [Protected acceptance and downloadable evidence](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/40008779806): all steps passed against that deployment. Acceptance commit `b304afb0` differs from the deployed commit only in the gate script, which explicitly selects Printed check in the current payment form.
- Gate 1: real named-staff/MFA/PIN authentication, vendor and bill creation, independent platform approval, bill posting, printed check creation, all three PDF/PNG layouts, reprint banner, void, and HTTP 400 rejection of printing the voided payment passed. The three layout PNGs and reprint PNG were visually reviewed for legibility and content. Setup completion and current-period opening had succeeded through the UI in the preceding run against the same application revision.
- Gate 2: API/parish network bypass, visible disconnect failure, draft preservation, reconnect without reload, and open-tab service-worker update notification passed.
- Gate 3: 93 routes across all 10 accounting handler families, four credential/direction combinations, 372 requests; every request returned HTTP 401 with no transport retries.
- Parish reconciliation and giving-catalog protected smoke steps passed. Reconciliation coverage is limited to the failed-payout fixture described above.

The successful run retains its PDF, PNG, JSON matrix and lifecycle evidence as GitHub workflow artifacts. Earlier failed runs informed the period-opening, configuration-recovery and test-interaction fixes; they are not substituted for the final green run.

Physical printer/check-stock measurements and a fresh production deployment smoke remain separate release requirements. This work deployed only to staging and does not establish broad production sign-off.
