# Phase G production-gate evidence — 2026-07-21

## Outcome

Phase G is partially complete. The production control-plane canary, scheduled integrity scan, received alert, protective-state recovery, representative-volume query plans, backup, restore, and most authenticated responsive/keyboard UI checks now have direct evidence. Authenticated check-print output, service-worker offline behavior, and a two-credential cross-tenant browser test remain open; Accounting 1.0 is not production-ready.

No customer parish was connected to the canary and no customer accounting data was created or changed.

## Gate status

| Gate | Status | Evidence |
| --- | --- | --- |
| Fresh per-parish D1 canary | Pass with remediation | `agapay-accounting-canary` contains all 69 accounting tables through migration 0014. `PRAGMA quick_check` returned `ok`; `PRAGMA foreign_key_check` returned no rows. |
| Migration sequence | Finding fixed operationally | Migration 0006 requires the default chart/fund created by `initializeLedger()`. A blind 0001–0014 apply failed at 0006. `scripts/accounting-canary-bootstrap.sql` now makes the required 0001–0005 → initialize → 0006+ sequence explicit for provisioning/runbooks. |
| Financial sanity | Pass | Empty canary trial balance is balanced; 32 accounts, one default fund, and 12 fiscal periods are present. |
| Production query plans | Pass at representative volume | The control-plane canary holds 3,000 journals, 6,000 lines, 1,200 bills, 20 budget lines, 2,000 bank transactions, and 36 reconciliation sessions across 2024–2026. Ledger, AP aging, trial balance, and statement plans use indexes; measured query times were 2.08–41.61 ms. |
| R2 backup | Pass | Exported the canary to private bucket `agapay-accounting-backups` at `canary/2026-07-21/agapay-accounting-canary.sql`. Export size: 86,840 bytes. SHA-256: `4453DD3A78E2DECEDD61EBCE978E3CC53741EC0816885229FF64F86703725F9C`. |
| Isolated restore | Pass | Restored into `agapay-accounting-restore-drill`. Restore processed 202 statements; quick check returned `ok`, foreign-key check returned no rows, and table/key counts match the canary (69 tables, 32 accounts, one fund, 12 periods). |
| Worker backup binding | Ready in code | `ACCOUNTING_BACKUPS` is declared as a private R2 binding and reflected by the accounting storage registry. Deployment is intentionally pending. |
| Scheduled integrity scan + alerts | Pass | `agapay-phase-g-canary` was activated through the central lifecycle registry and a dedicated D1 binding. Remote scheduled invocation scanned two parishes. A labeled unbalanced fixture produced 4 findings/3 critical failures, `posting_blocked` version 3, Resend receipt `db56ce45-24f1-4f14-be7b-e6a0f6920c29`, and Gmail inbox receipt `19f86871fd61a81a`. A clean scan then completed release request `phase-g-release-001`, returning state `normal`, version 4. |
| Authenticated browser/mobile/keyboard/service-worker/tenant switch | Partial; release blocker remains | Authenticated St. Fiacre desktop and 375×844 mobile views passed after fixing mobile reachability/containment and retained scroll. Keyboard focus was visible. St. Fiacre has no payable/check fixture, so physical print output remains unverified. Only one parish credential was available, so a real two-credential A→B browser test remains unverified. Service-worker offline behavior also remains unverified. |

## Production resources created for the drill

- D1: `agapay-accounting-canary`
- D1: `agapay-accounting-restore-drill`
- Private R2: `agapay-accounting-backups`

These resources are intentionally isolated from the parish registry. Retain them for the next recovery drill or remove them through the Cloudflare console after evidence retention requirements are decided.

## Remaining release gates

1. **Closed:** production-path canary provisioning, dedicated least-privilege D1 binding, weekly scanner wiring, received alert, and protective lock/release.
2. **Closed:** representative-volume seed and indexed production query/capacity measurements.
3. **Closed in code:** Phase H settings, batch payment, stock-aware print, reason-required reprint, void, and check-status UI, gated to `advanced_operations`.
4. **Open:** create an authenticated non-customer payment/check fixture and capture browser + physical/PDF print evidence for every supported stock style.
5. **Open:** exercise service-worker offline/update behavior against the authenticated shipped UI.
6. **Open:** provision a second authenticated test parish and capture live A→B and B→A denial evidence for every Accounting route group and view.
7. Run a final post-deployment smoke scan after items 4–6 before designating Accounting 1.0 production-ready.
