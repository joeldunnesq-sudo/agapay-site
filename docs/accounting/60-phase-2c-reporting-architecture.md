# Phase 2C reporting architecture

All core reports are included for Mission and Parish Accounting. Reports use posting date by default, fall back to entry date only for historical posted records without a posting date, and derive exclusively from posted/reversed journal effects. Drafts and voided drafts never affect reports.

The report engine provides Trial Balance, nonprofit Statement of Financial Position, Statement of Activities, and Fund Activity foundations. It applies account normal balances, preserves fund restriction attribution, exposes safe account IDs only for authorized drill-down, validates the Trial Balance and financial-position equation, and emits formula-injection-safe CSV. The ledger remains authoritative; no mutable report balance or snapshot table is introduced.

Statement of Financial Position presents Assets, Liabilities, and Net Assets. Current unclosed revenue less expenses is included in net assets so the accounting equation remains meaningful before year-end closing entries exist. Statement of Activities presents revenue, expenses, and change in net assets by actual account and fund restriction type.

Reporting indexes cover posted-date/status/source scans and account/fund journal-line access. Future HTTP routes must reuse the authenticated dynamic-D1 context, require report capability, enforce Mission/Parish entitlement, return private no-store DTOs, and never expose provider metadata.
