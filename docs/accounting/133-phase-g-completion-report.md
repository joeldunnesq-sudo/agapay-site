# Phase G follow-up evidence — 2026-07-21

## Release decision

**Not ready for Accounting 1.0 production designation.** Integrity/alerting, representative volume, query plans, and Phase H implementation are closed. Authenticated check-print output, service-worker offline/update behavior, and a two-credential cross-tenant browser test remain open.

## 1. Scheduled integrity scan and alerting

| Evidence | Result |
| --- | --- |
| Canary parish | `agapay-phase-g-canary` |
| D1 | `agapay-acct-production-e4601e1d985ec8dcb9fe`, UUID `0b55d572-7dbc-4f6d-97a5-826841f4bbb8`, WNAM |
| Access | Worker binding `ACCOUNTING_DB_PHASE_G_CANARY`; no API token or developer credential in Worker configuration |
| Registry | `ready`, `active`, tier `parish`, schema `14`, migration `0014_phase_g_query_indexes`; 5 lifecycle events |
| Cron | Wrangler deployment reports `schedule: 0 14 * * 6`; `src/worker.js` invokes `runScheduledAccountingIntegrity` |
| Clean baseline | `integrityscan_44f2ccf1-d0d7-4fba-81e1-f15a08577ce6`: 9 checks, 0 failures |
| Deliberate finding | Entry `phase_g_integrity_fixture`, correlation `phase-g-deliberate-finding`; 4 findings, 3 critical |
| Protective state | `posting_blocked`, version 3, source scan `integrityscan_4bd56846-b89c-4a24-8280-355c0202ce99` |
| Provider alert | Resend `sent`, message ID `db56ce45-24f1-4f14-be7b-e6a0f6920c29` |
| Received alert | Gmail inbox message `19f86871fd61a81a`, subject `[CRITICAL] AGAPAY accounting integrity alert — agapay-phase-g-canary`, received `2026-07-21T21:13:49Z` |
| Recovery | Fixture removed; `PRAGMA quick_check` = `ok`; clean scan `integrityscan_149047ba-6712-4f6c-b988-afb0ba85d69d` |
| Release | Request `phase-g-release-001` completed; result `normal`, version 4; released by `accounting-integrity-scheduler` at `2026-07-21T21:16:00.854Z` |

Commands used:

```text
npx wrangler d1 migrations apply agapay-production --remote
npx wrangler deploy
npx wrangler dev --remote --test-scheduled --port 8793
GET /__scheduled
npx wrangler d1 execute <canary> --remote --command <evidence queries>
```

Deployment versions during this gate: `51315af4-3632-472a-b130-d6146d70a397`, `e397f002-bbea-40f8-8360-a2f1c2d27090`, `e9c855a0-5f40-4a14-8f53-f754e1ebc9e9`.

## 2. Representative-volume validation

Seed command:

```text
npx wrangler d1 execute agapay-acct-production-e4601e1d985ec8dcb9fe --remote --file scripts/accounting-phase-g-volume-seed.sql
```

Final deterministic canary counts:

| Object | Count |
| --- | ---: |
| Journal entries | 3,000 |
| Journal lines | 6,000 |
| Bills | 1,200 |
| Budget lines | 20 |
| Bank transactions | 2,000 |
| Reconciliation sessions | 36 |

Ledger dates run from `2024-01-01` through `2026-06-18`. The seed import processed 13,240 changes in 206.45 ms initially; final database size was 6.59 MB.

| Query | Result volume | D1 SQL time | Plan evidence |
| --- | ---: | ---: | --- |
| Ledger register (`acct_1010`) | 3,000 | 16.8451 ms | `SEARCH l USING INDEX idx_accounting_lines_reporting (account_id=?)` |
| AP aging | 960 | 2.0838 ms | `SEARCH b USING INDEX idx_accounting_bills_aging (status=? AND bill_date<?)` |
| Trial balance | 32 accounts | 14.8447 ms | `SEARCH l USING COVERING INDEX idx_accounting_lines_reporting (account_id=?)` |
| Financial statement aggregation | 2 categories | 41.6129 ms | `SEARCH e USING INDEX idx_accounting_entries_reporting (status=?)`; journal lines use their `journal_entry_id` autoindex |

Trial-balance volume remained balanced: debits `34,498,500`, credits `34,498,500` cents.

## 3. Phase H check printing

Implemented and verified by `node scripts/accounting-phase3a-tests.mjs`, `node scripts/accounting-route-ui-tests.mjs`, and the full check command:

- Check settings: next number, payer name/address, two signature lines, and stock style.
- Supported layouts: `top_check_two_stubs`, `bottom_check_two_stubs`, `check_only`.
- Pay Bills screen with vendor-safe bill selection and batch applications.
- Original-print state, reprint count, reason required for sequence > 1, and voided state.
- Stock-aware printable letter layout and reprint watermark.
- `advanced_operations` gate remains the same gate used by Payables/Budgets.

Deployed version containing the completed UI: `52bb6a24-2b9f-4fa8-bea4-84a72685269d` (followed by responsive fixes below).

## 4. Authenticated UI/device evidence

| Check | Evidence | Status |
| --- | --- | --- |
| Desktop authenticated | St. Fiacre loaded Parish Accounting; overview contained balanced reports and no error card. Desktop nav: 9 enabled buttons, each 129×43 px at 1,521 px viewport. | Pass |
| Advanced tier | UI label `Parish Accounting`; copy `Advanced operations enabled`; Payables view accessible. | Pass |
| Mobile authenticated | 375×844 effective viewport: body, shell, and top rail all 375 px wide; no horizontal overflow; 9 nav buttons render 118×38 px. | Pass after fix |
| Mobile reachability | Added `data-nav-tab="accounting"`; authenticated mobile navigation opened Accounting. | Pass after fix |
| Retained scroll | Switching to Accounting now records `scrollY: 0`. | Pass after fix |
| Keyboard | Tab focus moved through visible bottom navigation controls; focused element remained inside viewport with browser focus outline. | Pass |
| Check settings UI | Authenticated Payables → Payments & Checks exposed `Check settings`; St. Fiacre correctly showed that no bank account was ready. | Partial |
| Print output | No authenticated payable/check fixture existed in St. Fiacre; browser/PDF/physical stock output was not captured. | **Open** |
| Service worker | CDP service-worker inspection could not be completed against the claimed authenticated tab. | **Open** |
| Cross-tenant | Only the St. Fiacre credential was available. Unit/route authorization tests pass, but a real two-credential A→B/B→A browser attempt was not possible. | **Open** |

Responsive/mobility deployment version: `99f5528f-8b23-4046-87f4-63eb0a2afee5`.

## 5. Required checks

`npm run check` was run after steps 1, 2, 3, and 4. Each run exited `0`. The final run reported:

```text
Route-map integrity OK.
47 migration file(s) found, all non-empty and UTF-8 readable.
Migration integrity check passed.
AGAPAY platform checks passed.
AGAPAY Learn checks passed.
Accounting route and parish UI checks passed.
```

## Open release gates

1. Create a non-customer authenticated payable/check fixture, exercise original print + reason-required reprint + void, and retain browser plus PDF/physical stock evidence for each supported layout.
2. Complete authenticated service-worker install/update/offline/reconnect testing.
3. Provision a second authenticated test parish and capture A→B and B→A denials across setup, ledger, reports, payables, budgets, bank/reconciliation, integrations, and close routes/views.
4. Run the final post-deployment smoke scan after gates 1–3.
