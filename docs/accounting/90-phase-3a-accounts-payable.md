# Phase 3A — Parish Accounts Payable

Phase 3A adds Parish-tier vendors, payment terms, accrual bills, approvals, payments, partial-payment applications, recurring-bill groundwork, aging, and reconciliation-ready bank references. Mission Accounting retains its complete core ledger and reconciliation functionality but cannot access AP data or mutations.

Approved bills debit their classified expense or asset lines and credit Accounts Payable through the authoritative journal service. Payments debit Accounts Payable and credit the mapped bank ledger account; they never recognize expense again. Bill and payment journals use stable idempotency keys and source links, remain visible in the journal and Phase 2C reports, and inherit open-period controls.

Vendor records store only ordinary contact details, classification, and optional tax-ID last four—never full tax IDs or bank credentials. Exact vendor invoice duplicates and bank/check-number duplicates are constrained server-side. Bill totals and payment applications are calculated and validated by the service. Posted bills are not editable; corrections require future credit/reversal workflows.

The implementation enforces a separate sole approver from the bill creator and preserves explicit approval history. Payments are accounting records only: AGAPAY does not initiate ACH or wire transfers. Check-number recording is supported; secure physical check generation is deferred.
