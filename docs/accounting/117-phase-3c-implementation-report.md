# Phase 3C implementation report

Implemented migration `0010_phase3c_commerce_accounting.sql`, the Parish-only commerce accounting service, focused regression coverage, and documentation. Phase 2D source events gain allowlisted commerce/tax facts; normalized tables add mapping precedence, operational-item accounting configuration, source item snapshots, and idempotent inventory movements.

Services implement item configuration, canonical ingestion, automatic/review proposals, taxable and exempt sales, actual Stripe fees and fee refunds, full/partial refund allocation, disputes, payouts, tender-specific clearing, inventory/COGS and returns, overview reporting, sales-tax liability reporting, safe CSV, and non-mutating backfill previews. Ledger writes always use the authoritative journal service.

This phase does not recalculate historical tax, file returns, initiate payments, implement purchasing/receiving, claim FIFO, build warehouse management, or duplicate the commerce catalog. Authenticated routes, dashboard workspaces, webhook/background-job wiring, cash-deposit orchestration, full report suite, and weekly-email presentation remain integration work before operational enablement. Production rollout requires applying accounting migrations through `0010` to Parish-tier databases.
