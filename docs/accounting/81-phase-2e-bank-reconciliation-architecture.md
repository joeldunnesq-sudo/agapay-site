# Phase 2E — Bank reconciliation architecture

Phase 2E keeps three concepts separate: a bank account is safe metadata for where cash is held; its mapped asset account is the ledger classification; and a fund remains a restriction/reporting dimension. Revenue Streams, settlement profiles, and Stripe Clearing are likewise not bank accounts.

CSV statements are bounded to 1 MB and 5,000 rows, parsed without spreadsheet evaluation, previewed without persistence, and committed as integer-minor-unit evidence. File and row hashes prevent exact reimports. Only filename, hashes, normalized rows, provider references, and masked last-four metadata are retained—never complete account or routing numbers, credentials, or raw files.

Reconciliation links imported transactions to immutable posted cash-account journal lines. Explainable suggestions use exact amount, date proximity, check numbers, and references. Confirmed links—not journal mutation—record clearing. Stripe payout matching reuses Phase 2D payout journals and cannot recognize revenue.

Server-derived reconciliation math rolls unmatched ledger deposits and withdrawals forward as outstanding items. A zero difference is mandatory for completion. Completion writes an immutable hashed snapshot and ledger event. Reopening requires a separate capability and reason and preserves every prior snapshot. Adjustments post through the normal journal service and its open-period controls.

Mission and Parish tiers receive identical core functionality. Browser/API route wiring, visual reconciliation workspace, import exception administration, and print rendering remain integration work before production enablement.
