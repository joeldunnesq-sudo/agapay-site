# Phase G production-gate evidence — 2026-07-21

## Outcome

Phase G is partially complete. The canary migration, integrity, query-plan, encrypted-at-rest backup, and isolated restore gates have direct Cloudflare production-account evidence. Scheduled scanning/alert delivery and authenticated browser/tenant testing remain blocked until a real accounting parish is provisioned and the pending accounting UI is supplied.

No customer parish was connected to the canary and no customer accounting data was created or changed.

## Gate status

| Gate | Status | Evidence |
| --- | --- | --- |
| Fresh per-parish D1 canary | Pass with remediation | `agapay-accounting-canary` contains all 69 accounting tables through migration 0014. `PRAGMA quick_check` returned `ok`; `PRAGMA foreign_key_check` returned no rows. |
| Migration sequence | Finding fixed operationally | Migration 0006 requires the default chart/fund created by `initializeLedger()`. A blind 0001–0014 apply failed at 0006. `scripts/accounting-canary-bootstrap.sql` now makes the required 0001–0005 → initialize → 0006+ sequence explicit for provisioning/runbooks. |
| Financial sanity | Pass | Empty canary trial balance is balanced; 32 accounts, one default fund, and 12 fiscal periods are present. |
| Production query plans | Pass for canary volume | Ledger, bank, and integration queue queries use indexes. AP aging initially scanned all bills; migration 0014 adds `idx_accounting_bills_aging`, and D1 now reports `SEARCH b USING INDEX idx_accounting_bills_aging`. Empty-canary timing is not a substitute for representative-load testing. |
| R2 backup | Pass | Exported the canary to private bucket `agapay-accounting-backups` at `canary/2026-07-21/agapay-accounting-canary.sql`. Export size: 86,840 bytes. SHA-256: `4453DD3A78E2DECEDD61EBCE978E3CC53741EC0816885229FF64F86703725F9C`. |
| Isolated restore | Pass | Restored into `agapay-accounting-restore-drill`. Restore processed 202 statements; quick check returned `ok`, foreign-key check returned no rows, and table/key counts match the canary (69 tables, 32 accounts, one fund, 12 periods). |
| Worker backup binding | Ready in code | `ACCOUNTING_BACKUPS` is declared as a private R2 binding and reflected by the accounting storage registry. Deployment is intentionally pending. |
| Scheduled integrity scan + alerts | Blocked | Production central registry has no accounting entities/databases. The Worker has no Cloudflare control-plane credentials for per-parish D1 access, and the current weekly schedule does not execute the accounting integrity scanner. Do not claim this gate until a real canary tenant exists and an alert is observed end-to-end. |
| Authenticated browser/mobile/keyboard/service-worker/tenant switch | Deferred | The user is supplying canonical accounting UI templates. This audit should run against that final UI and at least two provisioned test tenants; running it against the interim UI would not certify the shipped experience. |

## Production resources created for the drill

- D1: `agapay-accounting-canary`
- D1: `agapay-accounting-restore-drill`
- Private R2: `agapay-accounting-backups`

These resources are intentionally isolated from the parish registry. Retain them for the next recovery drill or remove them through the Cloudflare console after evidence retention requirements are decided.

## Remaining release gates

1. Provision a non-customer canary parish through the same control-plane path production will use.
2. Provide least-privilege Worker access to its per-parish D1 databases; do not reuse an interactive developer token.
3. Schedule the integrity runner, deliberately trigger a non-destructive test finding, and capture alert receipt and recovery evidence.
4. Seed representative accounting volume and repeat the query/capacity measurements.
5. Apply the final UI templates, then complete authenticated desktop/mobile, keyboard, print, service-worker, and cross-tenant isolation testing.
6. Run post-deployment smoke scans before designating Accounting 1.0 production-ready.
