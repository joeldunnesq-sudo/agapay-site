# Accounting Phase 1B — Per-parish database provisioning

Phase 1B adds the server-side foundation that creates one isolated Cloudflare D1 database for each parish. It does not add a ledger or financial records.

## Lifecycle

`not_enabled → provisioning → provisioned → migrating → ready`

A database is not marked healthy or ready until the baseline migration has been applied and validated. Failed attempts remain recoverable: the database name is deterministic, so a retry finds and resumes the same database instead of creating a duplicate.

## Isolation and names

Names use `agapay-acct-<environment>-<20-character SHA-256 suffix>`. The suffix is derived server-side from the environment and stable parish identifier. Parish names and identifiers are not exposed in the physical name. Provider identifiers are server-only and are excluded from control-plane DTOs.

## Provider boundary

`src/accounting/provisioning/adapters.js` defines the provider operations used by the orchestrator. Production uses the Cloudflare D1 REST API with server-side `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` bindings. Local tests use a deterministic memory adapter and never call Cloudflare.

The API token must have only the D1 permissions required to list, create, and query databases in the target account. It must never be placed in browser code, request payloads, logs, or database rows.

## Baseline schema

`accounting-migrations/0001_accounting_database_foundation.sql` creates only:

- `accounting_database_metadata`
- `accounting_migrations`
- `accounting_health_checks`
- `accounting_idempotency_keys`

The migration checksum is recorded in every parish database. A different checksum for an already-applied version is treated as drift and blocks readiness. Validation also rejects financial tables such as ledgers, journals, funds, balances, payables, or postings during Phase 1B.

## Recovery

The central `accounting_provisioning_operations` table is the operation journal for idempotency, attempt tracking, leases, failures, and correlations. The orchestrator also tolerates interruption after provider creation: it finds the same opaque database on retry, reapplies idempotent DDL, validates it, and advances the central lifecycle.

## Deployment order

1. Apply central migration `0034_accounting_provisioning_phase1b.sql`.
2. Configure server-only Cloudflare account credentials per environment.
3. Deploy the Worker.
4. Provision a staging canary and confirm the lifecycle reaches `ready`.
5. Validate retry behavior before enabling production setup controls.

Do not manually create ledger tables or bypass the provisioning service. Future accounting migrations must use new immutable version files and checksums.
