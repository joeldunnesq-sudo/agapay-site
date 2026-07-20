# Phase 3D accountant exports

Both accounting tiers can generate an idempotent CSV accountant package. Core files include the chart, funds, Trial Balance, General Ledger, journals, journal lines, core statements, fund activity, reconciliation summaries, and audit trail. Parish packages add AP aging, vendors, budget lines, commerce activity, and inventory summaries.

The manifest records fiscal year, date range, accounting basis, currency, modules, record counts, close status, warnings, included files, and a SHA-256 hash for every file. Stable references and source fields preserve traceability without disclosing physical database identity.

Exports omit secrets, raw provider payloads, complete bank numbers, credentials, complete tax identifiers, and unrelated donor data. Packages are modeled with expiration and private server-side delivery; the domain does not create public URLs or claim native third-party accounting formats.
