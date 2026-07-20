# Phase 1C implementation report

## Summary

Phase 1C adds the isolated parish ledger schema and internal services for safe initialization, drafts, posting, reversals, voids, opening balances, period locks, idempotency, provenance, ledger events, and validation. Phase 1A control-plane and Phase 1B provisioning behavior remain intact.

## Delivered

- `accounting-migrations/0002_core_ledger.sql`: account types, chart, funds, fiscal years, periods, journal headers/lines, entry links, posting idempotency, opening balances, locks, events, indexes, constraints, and immutability triggers.
- `src/accounting/ledger/service.js`: capability-gated initialization and ledger operations using parameterized D1 statements and atomic batch posting.
- Stable nonprofit account types and an Orthodox parish starter chart.
- One default unrestricted General Operating Fund.
- Calendar-year initialization with twelve periods; the model remains parish-configurable for non-calendar years.
- Server-side balanced-entry validation, integer amounts, source uniqueness, version checks, period and lock checks.
- Idempotent posting and controlled opening balances.
- New opposite-entry reversals and draft-only void behavior.
- Structured foundation validation for system types/accounts, default fund, posted balance integrity, period bounds/overlap, hierarchy cycles, duplicate sources/reversals, and initialization state.
- Narrow Phase 1C capabilities added to the established authorization catalog and role templates.

## Invariants

Posted entries balance, contain at least two lines, use active posting accounts and funds, and belong to an open unlocked period in an open fiscal year. Posted accounting fields and lines are immutable. Corrections use reversals. Source postings and reversals are unique. System records are protected by service policy. The journal, not a balance cache, is authoritative.

## Known limitations and Phase 2 readiness

Phase 1C intentionally has no full accounting UI or unrestricted mutation endpoints. Account/fund maintenance workflows, soft-close override workflow, non-calendar fiscal-year setup UI, reporting, source integrations, reconciliation, payables, budgeting, and financial statements remain Phase 2 work. The schema and service boundaries are ready for those workflows without weakening parish isolation or ledger invariants.
