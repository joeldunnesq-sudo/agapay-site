# Phase 1A Registry Schema Report

## Migration

`migrations/0021_accounting_control_plane.sql`

## Tables

### `accounting_entities`

One row per parish accounting entity.

Tracks parish ownership, lifecycle state, activation state, subscription tier, enablement, suspension, archival, and timestamps.

### `accounting_schema_versions`

Catalog of accounting schema/migration versions known to the control plane.

This is a registry table only. It does not describe ledger tables or account structures.

### `accounting_databases`

One database registry row per accounting entity per environment.

Tracks the server-side database identifier, environment, schema version, migration version, provisioning status, health status, and validation timestamps. The stored `database_identifier` is not returned by the resolver.

### `accounting_lifecycle_events`

Append-only lifecycle history for accounting entity/database registry operations.

This complements the durable central `audit_log`; it records state-machine history, while `audit_log` records privileged action audit context.

## Normalization

The registry uses typed columns and relational references. It intentionally avoids JSON blob persistence for registry facts.

## Explicitly Not Present

The migration does not create:

- ledger accounts
- funds
- journal entries
- journal lines
- account balances
- accounts payable tables
- reconciliation tables
- reports
- posting queues

## Acceptance Notes

The schema is additive to central AGAPAY D1. Existing Give, Learn, Commerce, and Parish+ tables are not modified.
