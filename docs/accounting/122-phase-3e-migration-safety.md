# Phase 3E migration safety

Schema verification compares canonical required tables, indexes, and immutable triggers against `sqlite_master`; it does not trust one version integer. Missing critical objects become critical findings and block unsafe posting. Phase 3E adds query indexes for period/status journal access, source/status lookup, integration health, reconciliation health, close health, findings, scans, recovery evidence, and alerts.

Production rollout is preflight → verified backup → small canary cohort → migration → schema scan → representative Trial Balance → broader cohorts → post-deploy scan. A failed canary or drift halts expansion. A failed migration is never recorded as successful.

D1 production migrations use reviewed forward fixes by default. Rollback is reserved for safe application rollback or a tested non-destructive database procedure. Never delete migration history, edit a production migration in place, or retry a destructive statement indefinitely.
