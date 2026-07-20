# Phase 2B manual ledger

Mission and Parish Accounting both include the complete manual ledger. Parish retains a future `advanced_operations` entitlement for AP, vendors, budgets, approvals, check printing, departmental accounting, and other operational modules; none are implemented here.

Phase 2B adds editable versioned drafts, revision snapshots, draft duplication/deletion, authoritative Phase 1C posting and reversal/void rules, paginated journal search, posted-only general ledger/account/fund registers, server-calculated running balances, allowlisted CSV, and print-only HTML. Posted entries and lines remain immutable. Drafts never affect balances.

All amounts remain integer minor units. Search and registers require `accounting.view`; draft work requires `accounting.journals.create`; posting and reversal continue through their narrow Phase 1C capabilities. The future HTTP boundary must resolve the authenticated parish database through the Accounting Gateway, enforce Mission/Parish entitlement server-side, use private no-store responses, and never accept physical database identifiers.

Attachment metadata is schema-only in this phase; no file storage is enabled. Donation, Stripe, bookstore, reconciliation, AP, budgeting, vendors, and financial statements remain outside Phase 2B.
