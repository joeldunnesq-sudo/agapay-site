# Phase 2D — AGAPAY Give and Stripe accounting integration

Phase 2D adds the parish-database pipeline `canonical source event → mapping resolution → posting proposal → journal service → source link`. Webhooks persist allowlisted financial facts and can enqueue processing; they never construct ledger rows directly. Mission and Parish tiers receive the same integration capabilities.

## Accounting policy

- The persisted AGAPAY offering is authoritative for gross contribution value and designation. Stripe balance transactions are authoritative for processing fees and net settlement; Stripe refund, dispute, and payout objects are authoritative for their respective movements.
- Donations and actual Stripe fees post as separate source-linked entries. Contribution revenue remains gross. Voluntary fee coverage is part of contribution revenue and is not assumed to equal the actual Stripe fee.
- No new AGAPAY platform percentage or legacy 2.1% fee is calculated or posted.
- Refunds use the original donation's revenue account and fund. A Stripe fee is reversed only from an explicit fee-refund event.
- Dispute withdrawals reverse contribution revenue; wins restore clearing against the historical revenue mapping. Chargeback fees are processing expense.
- Paid payouts debit the mapped parish bank account and credit Stripe Clearing. Failed or canceled payouts create no ledger movement; payout reversals reverse the bank transfer. Payouts never recognize revenue.

## Safety and lifecycle

Source events contain integer minor units and allowlisted references, not full Stripe payloads. Stable object-and-operation idempotency keys are shared by live processing and backfill. Conflicting duplicate hashes are rejected. Missing balance transactions wait; missing or unsafe mappings, restricted funds, closed periods, and posting failures enter exceptions. Review mode stores a server-generated balanced proposal; approval still posts through the authoritative journal service.

The integration start date is server-enforced. Backfill preview is read-only and bounded to 500 events per batch. Full webhook route wiring, background backfill execution, and the parish-facing mapping/review workspace remain integration work before enabling live automatic posting.
