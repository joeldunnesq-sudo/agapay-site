# Phase 3D year-end close

Year-end preview reads fiscal-year journal activity and emits a deterministic direct-closing proposal. All periods except the designated closing period must be closed or locked; the closing period remains open so the authoritative journal engine can post the closing entry. Required net-asset mappings must exist and duplicate successful closes are blocked.

Execution hashes the pre-close Trial Balance, posts exactly one closing journal with stable idempotency, regenerates the Trial Balance, verifies that revenue and expense balances are zero, and confirms the ledger remains balanced. Only then are the fiscal year and its periods locked and the close marked complete.

AGAPAY uses continuous ledger carryforward. Permanent accounts and net assets naturally continue; no duplicate opening journal is generated. Reopening requires an elevated capability and reason, blocks when later activity exists, preserves snapshots, and reverses rather than deletes the closing journal.
