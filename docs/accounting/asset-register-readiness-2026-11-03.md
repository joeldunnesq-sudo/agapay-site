# Asset register release and reporting validation

Prepared November 3, 2026. **Built and locally validated; user approved publication to main and production.** No hosted financial records were changed.

The original isolated release directory starts from the last treasurer UX release, production version `22a12abf-81d0-4958-952d-dc32a86bee30`. The main working checkout contains unrelated work and was not used as the release source. `changes.patch` and `change-manifest.json` describe the changes against that baseline. Recheck the currently deployed version before any release.

## Item 3: asset register

Implemented:

- Treasurer account setup can create or reuse cost, accumulated-depreciation and expense accounts with the correct categories, balances and cash-flow classifications. Setup is atomic and creates no journals.
- An **Assets** tab in the Accounting homepage and an **Asset Register** report in the searchable report library.
- Asset tags and names, acquisition and in-service dates, acquisition cost, salvage value, useful life, location, serial number, insurance value, and notes.
- Registration against an existing posted asset debit, with an atomic allocation limit. Registering an asset never books its acquisition a second time.
- Monthly straight-line schedules using whole-cent cumulative allocations, plus nondepreciable property. The policy includes full in-service and disposal months; the final charge reaches salvage value exactly.
- Explicit journal previews and confirmed depreciation postings. Disposal previews include catch-up depreciation, proceeds, gain or loss, and removal of cost and accumulated depreciation.
- Immutable movement/audit records, capability checks, stale-version protection, replay protection, and ledger-period controls. The ledger and asset movement commit together.
- Acquisition documents through the existing private journal-attachment service. Multiple assets on one acquisition journal share its supporting documents.
- Historical as-of asset values, registered control-account reconciliation, and PDF/CSV/print through the existing financial-report document engine. Disposed asset historical values are separated from active totals.
- Cash-flow reclassification for asset disposals, so investing activity shows actual sale proceeds and noncash retirement does not invent cash flow.

Boundaries of this first release:

- Straight-line and nondepreciable assets are supported. Other depreciation methods, component depreciation, impairments, and automatic unattended posting are not included.
- Assets with accumulated depreciation from a prior system require a reviewed opening subledger import. The new-asset registration form explicitly explains this; it is not a historical-asset conversion tool.
- Financial terms are fixed at registration. Estimate changes and corrections to asset-linked postings require a reviewed asset correction; ordinary journal reversal is blocked to prevent the subledger from diverging. A self-service correction workflow is not included.
- Insurance value is tracking information and does not alter ledger value.
- Acquisition selectors show the latest 500 qualifying debit lines. The register reports at most 5,000 assets and fails explicitly beyond that limit.
- Matching registered control accounts does not certify that the parish has inventoried every physical asset.

Synthetic screenshots and the sample PDF are archived locally under `artifacts/asset-register/screenshots`.

## Item 5: validation findings

| Area | Result | Evidence and remaining work |
|---|---|---|
| Fund and financial reporting | Pass in local tests | Accounting statements, fund reports, shared dates, budget variance, transaction drilldowns and PDFs pass. These tests use synthetic fixtures; they do not certify every hosted parish's mappings. |
| Independent departments/projects | Gap | No independent department/project dimension exists on journal lines or budgets. Fund and expense grouping are available, but cannot represent fund + department + project independently. Add dimensions, allocation rules, filters and reconciliation tests before claiming this capability. |
| Council report packages | Partial | The budget council packet generator passes tests, including executive totals, major variances and assumptions. Council giving reports also pass. Saved, reusable multi-report packages with one-click generation and publication are not implemented. |
| Migration tooling | Pass within supported scope | Reviewed chart, fund, vendor and opening-balance CSV flows pass; unbalanced imports are rejected, actor/permission checks and duplicate-posting protections pass. Advanced transaction history has stated limitations. This is not certification of an arbitrary Aplos or QuickBooks conversion. A representative real export still needs a rehearsed import and control-total tie-out. Historical asset opening balances need additional import work. |
| Backup/restore software | Pass in a disposable local database | The actual capture → plan → atomic apply functions restore exact asset, movement, journal and audit snapshots; remove post-backup purchases, depreciation and disposal activity; reinstate protective triggers; pass SQLite integrity and foreign-key checks; and reconcile cash flow. Backup evidence/freshness, retention and recovery operator tests also pass. |
| Production recovery | Not certified | No production backup was restored or production database overwritten. Verify a recent backup artifact, restore to a separate production-like database, recover private documents, measure elapsed time, reconcile books and record authorized cutover/rollback evidence before promising recovery time or data-loss objectives. |
| Support operations | Documented, not operationally certified | Incident and recovery runbooks exist. Staffing, escalation ownership, response-time commitments, and actual customer-support availability require an operational decision and rehearsal. Tests cannot establish an SLA. |

## Validation evidence

Run from the repository root (the original evidence logs are archived under `artifacts/asset-register`):

- `node scripts/run-tests.mjs accounting`: **49 test commands passed**. Log: `release/asset-accounting-tests.log`.
- `node scripts/accounting-assets-tests.mjs`: registration/allocation authorization; exact-cent schedules; no-write previews; posting retries; stale versions; repeated monthly postings; disposal gain/loss; zero-proceeds retirement; cash-flow classification; as-of reconciliation; immutable records; fault-injected rollback; closed-period rejection; and full financial restore passed.
- `node scripts/accounting-assets-browser-tests.mjs`: desktop/mobile layout, filtering, acquisition form, explicit posting review, PDF download, escaping and unavailable-service recovery passed.
- `node scripts/accounting-report-pdf-browser-tests.mjs`: all **17** report PDFs, accounting totals, selected dates, Greek fonts, CSV parity, ledger pagination and mobile layout passed.
- `node scripts/typecheck.mjs`: strict Worker/Learn/browser checks, owned declarations and runtime parameter checks passed. Authoritative TypeScript is now the private provisioner's configured entrypoint so its workflow parameter contract survives type generation.
- ESLint passed for the changed accounting, handler, portability and browser source files.
- Migration-manifest checks passed; prior migration checksums are unchanged.
- Worker deployment dry run passed. The private provisioner is also built locally to verify the migration bundle before release.
- **Original inherited quality failure (fixed for the main release):** `source-size-budget-tests.mjs` fails because unchanged `public/donor/app.js` has 2,555 lines against its 2,553-line budget. This file is byte-identical to the release baseline and was not changed here. The main release simplifies the latest-contribution display expression to meet the existing donor source budget without changing behavior. The asset portability allowlist is extracted into its own module to keep its generated source within the same size policy.

## Production release requirements

This release adds accounting migration **0027_fixed_assets.sql**: three asset tables, indexes, and protective triggers. It does not seed property, create journals, or change existing financial totals. Release the reviewed Worker and provisioner artifacts, apply the checksummed accounting migration through the established migration/bootstrap workflow to the intended accounting databases, and perform an authorized canary check before enabling general use.

The user explicitly approved pushing to main and deploying this release. Production was verified at the baseline above. The main release includes previously approved report, fee-coverage and homepage changes that were already live but absent from main. Publish through the existing CI migration and deployment workflow. A deployment dry run is not a deployment or hosted acceptance test.

Recommended next work after this first asset release: reviewed historical-asset import and self-service corrections; independent department/project dimensions; saved council report packages; a production-like restore rehearsal with document recovery; and an assigned support owner with agreed response times.
