# Accounting release-gate sign-off

## Current release decision — 2026-08-01

The product owner has accepted Accounting as ready for controlled onboarding of real churches. Automated Gates 1–3 passed in the authenticated non-production run linked below, including the complete 356-direction tenant-isolation matrix. This decision supersedes the pre-completion release conclusions in reports 132 and 133 without altering their historical evidence.

Physical check-stock alignment and an authenticated production Gate 4 artifact remain explicit operational follow-ups. They do not block initial controlled onboarding, but check printing must not be represented as physically stock-validated until the physical row below is signed, and broad production reliance on authenticated Accounting workflows still requires Gate 4 credentials and a passing post-deploy artifact.

This record separates automated evidence from the physical and credential-provisioning work that cannot be inferred from a green unit-test run.

## Automated evidence

- Gate 1: `scripts/accounting-release-gate-1-check-print.mjs`
  - Logs in through the real parish dashboard and Accounting PIN screens.
  - Creates the vendor, bill, approval/posting flow, and check payment through the visible Accounting UI.
  - Saves three PDFs and three full-page screenshots under `artifacts/check-print/`.
  - Captures the reprint banner and the rejected post-void print response.
- Gate 2: `scripts/accounting-release-gate-2-sw-lifecycle.mjs`
  - Permanently asserts that `/api/` and `/parish` remain network-only.
  - Verifies a failed mid-request action preserves the draft, reconnect succeeds without a reload, and an activating service worker does not discard open form state.
- Gate 3: `scripts/accounting-release-gate-3-cross-tenant.mjs`
  - Reads the current route patterns from all accounting handler files.
  - Uses independent browser contexts for platform-user and Accounting PIN authentication in both directions.
  - Writes the complete route-by-direction result matrix as JSON.
- Gate 4: `scripts/accounting-smoke-live.mjs`
  - Is invoked by `.github/workflows/deploy.yml` after the production deployment.
  - Reads every major accounting section and reruns the cross-tenant matrix when protected production credentials are configured.
  - Always writes a post-deploy evidence artifact. Until credentials are configured, that artifact records `blocked_missing_credentials` rather than implying authenticated coverage passed.

The dedicated `.github/workflows/accounting-release-gates.yml` workflow runs gates 1–3 against a provisioned non-production target and uploads all evidence for human review.

Latest authenticated non-production run: [GitHub Actions run 30586144326](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/30586144326), completed 2026-07-30. Gates 1–3 passed, including 356 cross-tenant route/auth-direction checks. The generated PDFs and screenshots were reviewed for the expected digital layout; physical stock alignment remains a separate required check below.

## Non-production Parish B precondition

`ACCOUNTING_TEST_PARISH_IDS` is accepted only when `AGAPAY_ENVIRONMENT` is explicitly one of `development`, `test`, `staging`, or `preview`. Production and an unspecified environment fail closed even if the test-parish variable is present.

Parish B must be created through the normal registration and accounting-provisioning path. Set the test-parish allowlist only on that non-production Worker. Never add Parish B to the production allowlist merely to make a test pass.

## Physical check-stock verification

Gate 1 is not complete until a reviewer prints one generated PDF for each stock style on the parish's real blank stock.

| Stock style | Stock vendor/product | Printer | Verified by | Date | Payee/amount alignment | MICR-safe area | Stub alignment | Result/notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Top check + two stubs |  |  |  |  |  |  |  | Pending |
| Two stubs + bottom check |  |  |  |  |  |  |  | Pending |
| Check only |  |  |  |  |  |  | N/A | Pending |

## Credential and production sign-off

The `accounting-release-gates` GitHub environment contains these protected secrets for authenticated non-production runs:

- `ACCOUNTING_GATE_PARISH_A_ID`, `ACCOUNTING_GATE_PARISH_B_ID`
- `ACCOUNTING_GATE_USER_A_EMAIL`, `ACCOUNTING_GATE_USER_A_PASSWORD`
- `ACCOUNTING_GATE_USER_B_EMAIL`, `ACCOUNTING_GATE_USER_B_PASSWORD`
- `ACCOUNTING_GATE_PARISH_A_PASSWORD`, `ACCOUNTING_GATE_PARISH_B_PASSWORD`
- `ACCOUNTING_GATE_STAFF_A_PROFILE_ID`, `ACCOUNTING_GATE_STAFF_A_PIN`
- `ACCOUNTING_GATE_STAFF_B_PROFILE_ID`, `ACCOUNTING_GATE_STAFF_B_PIN`

Do not paste credentials into this document, workflow YAML, issue comments, or build logs.

| Sign-off | Owner | Date | Evidence link | Status |
| --- | --- | --- | --- | --- |
| Non-production Parish B provisioned normally | Codex automated verification | 2026-07-30 | [Run 30586144326](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/30586144326) | Passed |
| Gate 1 browser artifacts reviewed | Codex digital review | 2026-07-30 | [Run 30586144326](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/30586144326) | Passed |
| Physical check stock reviewed |  |  |  | Pending |
| Gate 2 lifecycle evidence reviewed | Codex automated verification | 2026-07-30 | [Run 30586144326](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/30586144326) | Passed |
| Gate 3 isolation matrix reviewed | Codex automated verification | 2026-07-30 | [Run 30586144326](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/30586144326) | Passed — 356/356 denied |
| Gate 4 production credentials configured |  |  |  | Pending |
| Gate 4 post-deploy artifact passed |  |  |  | Pending |
| Controlled church-onboarding release decision | Joel Dunne, product owner | 2026-08-01 | Owner confirmation | Accepted |

Accounting is accepted for controlled church onboarding. Pending rows remain visible requirements for the narrower operational capabilities stated above and must not be silently treated as completed evidence.
