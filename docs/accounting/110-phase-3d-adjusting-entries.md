# Phase 3D adjusting entries

Adjustments are ordinary balanced journal drafts with a close-session link, type, effective date, reason, supporting memo, actor, correlation ID, and optimistic version. Posting delegates to the immutable journal service and creates a source link. Posted adjustments are corrected only through reversal.

Supported types include accrual, deferral, prepaid and accrued activity, correction, reclassification, fund reclassification, bank, inventory, AP, and other adjustments. The effective period must be open and every account and fund is validated by the journal engine.

Auto-reversal is opt-in, requires a later open period, uses a stable idempotency key, swaps journal debits and credits through the existing reversal service, and records exception state on failure. Recurring templates create drafts by default and never auto-post merely because a schedule exists.
