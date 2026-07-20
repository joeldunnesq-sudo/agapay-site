# Phase 3D implementation report

## Summary

Phase 3D adds the final core operational accounting domain: controlled close sessions and checklists, adjustments, period locks and reopening, nonprofit year-end closing, immutable snapshots, close packets, accountant handoff, audit readiness, retention classification, legal holds, and archival groundwork.

## Repository inspection and reuse

The implementation inspected and reused fiscal years and periods, hard locks, journal creation/posting/reversal and idempotency, immutable ledger triggers, account normal balances, fund restriction types, Trial Balance, Statements of Activities and Financial Position, Fund Activity, reconciliation, Give/Stripe exceptions, AP, budgets, commerce, ledger events, and prior phase tests. It creates no second ledger or balance engine.

## Files and migration

Migration `0011_phase3d_closing_and_audit.sql` adds normalized policies, close sessions, checklist rows, adjustments, recurring templates and runs, net-asset mappings, fiscal-year close records, immutable snapshots, export jobs, retention settings, and legal holds with ownership, status, version, foreign-key, uniqueness, and lookup indexes. `src/accounting/close/service.js` contains the domain and safe DTO/output builders; the accounting barrel exports it. Phase 3D tests are part of the ledger regression chain.

## Workflows and controls

Validation distinguishes blocking failures from review warnings. Warning waivers require capability and reason; blockers cannot be ordinarily waived. Adjustments are balanced authoritative journals. Auto-reversals are explicit and idempotent. Period completion snapshots then locks. Reopening preserves history and requires elevated authority and a reason.

Year-end uses deterministic, fund-aware direct closing. Revenue and expense activity closes into explicitly mapped restricted or unrestricted nonprofit net assets. Post-close validation proves the Trial Balance remains balanced and temporary balances are zero before completion. Continuous carryforward preserves permanent balances without duplicate openings. Reopening reverses the closing entry and rejects unsafe later-period dependencies.

## Handoff, audit, and records

Accountant packages include safe CSVs and a manifest with per-file hashes. Parish packages include advanced module files. Audit Readiness identifies unresolved bookkeeping evidence without claiming compliance. Audit CSV and print-ready close packets exclude secrets. Retention is classification-only; legal holds prevent archival, and archival never changes ledger history.

## Tier, privacy, and operations

Mission receives the complete essential close package. Parish adds AP, budget, commerce, tax, settlement, and inventory review. Narrow capabilities, optimistic concurrency, parameterized queries, immutable records, safe DTOs, and explicit disclaimers are enforced in the domain. Authenticated route and dashboard wiring remains an integration concern for the existing gateway and must use private, no-store delivery and background jobs for large outputs.

## Verification and production steps

Run the accounting migration through the existing per-parish migration orchestrator, then deploy the application service that imports the close domain. Run `node scripts/accounting-phase3d-tests.mjs` and the repository-wide `npm run check` before production promotion. No separate datastore, opening-entry process, secret, or external accountant identity is required.

## Completion and optional future modules

With authenticated UI/route integration, this domain completes the ordinary Configure → Record → Integrate → Reconcile → Report → Budget → Review → Adjust → Close → Export → Archive lifecycle. Fixed assets, depreciation schedules, payroll, purchasing, automated feeds, tax filing, diocesan consolidation, and external accountant collaboration remain optional demand-driven modules rather than launch blockers.
