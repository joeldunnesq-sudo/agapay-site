# Phase 3E integrity scanner

The scanner supports incremental, full, post-migration, post-restore, pre/post-close, manual, and canary runs. It is parish-database scoped, read-only except for its own scan/finding/health records, bounded to small diagnostic samples, checkpointed, resumable from paused state, idempotent at the job-envelope layer, and safe during concurrent reads.

Checks cover journal structure and balance, posting evidence, idempotency conflicts, references, account use, Trial Balance, source/journal links, refunds, reconciliation differences and snapshots, AP totals and applications, budget allocation, commerce tax and inventory, close locks and snapshot hashes, year-end uniqueness, and canonical schema objects. The scanner never repairs posted entries or invents missing facts.

Critical findings activate posting protection. Warnings remain visible without changing accounting results. Parish scans add AP, budget, commerce, inventory, and COGS checks; safety itself is identical across tiers.
