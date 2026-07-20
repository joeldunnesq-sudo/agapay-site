# Phase 1C ledger architecture

Phase 1C establishes the accounting domain inside each parish’s isolated database. It does not add public ledger APIs, a full accounting UI, automatic donation posting, reconciliation, payables, budgeting, or financial statements.

The ledger uses nonprofit double-entry accounting. Assets and expenses normally carry debit balances; liabilities, net assets, and revenue normally carry credit balances. Amounts are integer minor units. A posted entry must contain at least two lines and equal debits and credits.

## Domain model

- Account types define category, normal balance, and statement classification.
- The chart of accounts supports header/posting accounts and validated hierarchy.
- Funds are reporting/restriction dimensions. They are not bank accounts, Revenue Streams, donation options, or settlement profiles.
- One active unrestricted `GENERAL` fund is initialized as the default.
- Fiscal years contain nonoverlapping periods. Only open periods accept ordinary posting; any active period lock blocks posting.
- Journal headers and lines are authoritative. No mutable balance table exists.
- Posting derives totals server-side, records an idempotency result, updates the entry through compare-and-set, and appends a ledger event in one D1 batch.
- Database triggers prohibit mutation, insertion, or deletion of posted lines and prohibit changes to posted accounting fields.
- Corrections use a new opposite journal entry. The original is marked reversed only after the reversal posts.
- Drafts may be voided with a reason. Posted entries cannot be voided.
- Opening balances are controlled batches that must balance and post through the same journal service. The `Opening Balance Net Assets` system account is available, but the service never invents a balancing amount.

## Initialization and operational state

Initialization is capability-gated, idempotent, and resumable. Metadata distinguishes `not_initialized`, `initializing`, `initialized`, and `failed`. A Phase 1B-ready database is infrastructure-ready; it becomes ledger-operational only when initialization is `initialized` and foundation validation passes.

The default chart is an editable starting template for a small Orthodox parish, not legal, tax, or accounting advice. Re-running initialization uses stable IDs and `INSERT OR IGNORE`, so parish customizations are not overwritten.

## Security

All domain services require narrow accounting capabilities. Callers receive safe ledger DTOs, never provider IDs or physical database names. The approved Accounting Gateway remains responsible for authenticated parish resolution, entitlement checks, lifecycle/health checks, and preventing cross-parish access before supplying a database handle.

SQL values are parameterized. Physical identifiers, bearer tokens, Cloudflare credentials, payment credentials, and bank account numbers must never enter ledger events. Central audit records privileged security actions; parish ledger events preserve accounting-domain history without duplicating sensitive payloads.

## Migrations and recovery

`0002_core_ledger.sql` is additive and preserves the Phase 1B technical tables. It creates normalized domain tables, indexes, constraints, and immutability triggers. Production rollback is code rollback plus D1 Time Travel when data restoration is required; destructive down migrations are intentionally not provided.
