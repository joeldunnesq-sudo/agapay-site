# St. Fiacre demo readiness — September 16, 2026

## Release

PR #170 was approved by the owner, merged as `760f36c5d41d0541a4a8a824584a95b05dbed8e8`, and deployed.

Production workflow: https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/35097288309

Quality, Test, Deploy, and Post-deploy accounting smoke all succeeded. The live banking.js and reports.js contents were checked against the approved files. Production `/api/health` returned HTTP 200 with D1 and KV healthy.

Coverage limitation: the successful smoke job ran public health checks only. Its authenticated section reported missing configured credentials and did not run. Do not interpret the green job as an authenticated accounting verification.

## Demo preparation

The St. Fiacre sample database passed SQLite integrity and foreign-key checks. A full accounting integrity scan of the corrected snapshot passed all nine checks. Six report exports validated. Exact row comparisons confirmed that every journal entry and journal line was unchanged by the preparation.

Two synthetic bookstore source identifiers were corrected. The stale reconciliation was voided and retained, its old bank rows were superseded, and a consistent January–July sample statement was prepared with one $27 candle deposit left to match. Rehearsing the actual accounting service moved the difference from $27 to zero. Resetting and repeating the match also passed locally.

## Browser coverage and remaining step

Before deployment, the authenticated production overview, payables, budget variance, and income statement were inspected. The new matching controls and report-date form passed focused UI behavior tests. All 41 accounting test commands passed locally, and the protected full test suite passed in CI.

After reloading the deployed page, normal administrator MFA required fresh confirmation. The final authenticated browser click-through of the deployed match button and July cash-flow date form is therefore still pending. No MFA bypass or credential change was performed. The St. Fiacre tab was retained at the confirmation prompt.

After the owner completes MFA and unlocks Accounting:

1. Reconciliation → Bank reconciliation → January 1–July 31 statement. Verify a $27 difference, one open session, Review matches, and no Complete action on the voided session.
2. Review the candle deposit suggestion. Confirm once to verify the live difference becomes zero. Leave the session open. The narrowly scoped reset SQL in local artifacts can re-arm only this synthetic match; validate the reset before another presentation.
3. Reports → Statement of Cash Flows → July 1–31, 2026 → Apply report dates. Expected cash movement: $12,587, zero difference.

The historical January 1 opening-equity entry still produces a warning when included in the full-year cash-flow report. July is the validated presentation period; this limitation is documented in the presenter guide.

## Materials

- `docs/accounting/demo-presenter-guide.md`: 15-minute walkthrough.
- `artifacts/accounting-demo/presentation.html`: standalone local report fallback.
- `artifacts/accounting-demo/`: six CSV reports, synthetic statement, before/after snapshots, rehearsal evidence, and reset script. This directory is ignored by Git and contains private operational snapshots; do not publish it wholesale.
