# Phase 1A Control Plane Architecture

## Purpose

Phase 1A introduces the central Accounting Control Plane. It answers one question: which parish has which future accounting database, and is that database safe for accounting services to use?

It does not create accounting ledgers, chart of accounts, funds, journal entries, journal lines, reports, AP, reconciliation, checks, budgets, or posting behavior.

## Boundary

The control plane lives in central AGAPAY D1. It stores registry and lifecycle facts only:

- accounting entity ownership by parish
- lifecycle state
- activation state
- subscription tier
- database registry row
- schema and migration version metadata
- provisioning and health state
- lifecycle event history

Parish accounting data belongs in future parish accounting D1 databases, not here.

## Server-Only Resolution

Future accounting services resolve accounting database metadata through `resolveAccountingControlPlaneDatabase()` and the existing `resolveAccountingDatabase()` boundary. The resolver:

- accepts authenticated parish context, not browser-provided database identifiers
- denies cross-parish resolution
- rejects unknown, suspended, archived, unhealthy, or incompletely provisioned registry rows
- returns safe metadata without exposing the stored physical database identifier

## Integration Points

- `migrations/0021_accounting_control_plane.sql` creates normalized central registry tables.
- `src/accounting/control-plane.js` owns lifecycle transitions, validation, schema-version updates, and audit integration.
- `src/accounting/database-resolution.js` now attempts registry-backed resolution when the central registry exists, and safely falls back to `unconfigured` when it does not.
- `scripts/accounting-control-plane-tests.mjs` verifies the control-plane behavior.

## Design Decisions

1. One accounting entity corresponds to one parish for Phase 1A.
2. The database physical identifier is stored centrally but never returned by the public resolver metadata.
3. Lifecycle transitions are explicit and deny by default.
4. All lifecycle actions write central audit rows through `recordAuditEvent`.
5. Registry tables are normalized relational tables, not JSON blobs.
6. The control plane is ready for Phase 1B provisioning, but does not provision Cloudflare resources itself.
