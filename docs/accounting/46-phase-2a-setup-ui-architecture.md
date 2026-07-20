# Phase 2A Accounting setup architecture

Phase 2A exposes the isolated Phase 1C ledger as a Parish Dashboard configuration module. It covers provisioning/readiness, initialization, fiscal configuration, Chart of Accounts, funds, periods, opening balances, settings, and validation. Ordinary journals, source integrations, reconciliation, payables, budgets, and reports remain later phases.

## Mission and Parish tiers

Mission and Parish both receive the complete essential accounting system. A mission is not given a reduced ledger.

- `core`: Mission Accounting, including the full double-entry ledger, fund accounting, setup, manual transactions, Give integration, bank reconciliation, essential reports, fiscal controls, and security as those phases ship.
- `advanced_operations`: Parish Accounting, containing everything in core plus future operational features such as payables, approval workflows, budgets, fixed assets, inventory/bookstore accounting, expanded users, and complex multi-bank workflows.

Phase 2A setup and configuration functionality is included identically in both tiers. The advanced flag must not gate Chart of Accounts, funds, fiscal periods, opening balances, validation, or core ledger access.

## Server-derived setup state

`getAccountingSetupOverview()` creates an allowlisted overview from the parish database. It reports the entitlement tier, database readiness and health, initialization state, current fiscal year and period, active account/fund counts, validation reason codes, and a seven-step checklist. Browser state never marks a checklist item complete.

The overview deliberately excludes physical database names, provider identifiers, bindings, migrations, SQL, and credentials.

## Settings

`accounting_settings` is normalized and parish-database scoped. It stores base currency, fiscal start month, default fund reference, opening-balance policy/disposition, account-number rules, soft-close policy, setup completion facts, and a monotonic version.

Settings updates require `accounting.configure` and `expectedVersion`. Stale writes fail closed and require the administrator to reload. Initialization is idempotent and creates the settings row only after the General Operating Fund exists.

## Request boundary

The forthcoming HTTP handler must use the established platform-user membership authorization and Accounting Gateway. It must derive the parish from authenticated context, enforce `accounting.view` or the narrow mutation capability, verify entitlement and Phase 1B health, resolve only the parish’s isolated database, return private no-store responses, and audit privileged changes. The shared parish dashboard bearer must not become a shortcut around accounting capabilities.

## Active implementation sequence

1. Shared tier entitlement and normalized settings — implemented.
2. Safe setup overview and versioned settings service — implemented.
3. Provider-backed database handle and authenticated APIs.
4. Account, fund, fiscal-period, and opening-balance configuration services.
5. Dashboard navigation, overview, setup wizard, accessible mobile interfaces, and validation panel.
