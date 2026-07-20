# Phase 3E operational runbooks

Use this common sequence for every accounting incident: preserve evidence and correlation IDs; classify severity; contain with parish-scoped read-only/posting block when needed; inspect safe health findings and job state; verify backups; perform only documented reversible actions; validate with schema scan, Trial Balance, source links, reconciliations, and close snapshots; communicate verified facts; then complete a retrospective.

| Incident | Severity | Immediate containment | Safe recovery |
|---|---:|---|---|
| Trial Balance or ledger integrity failure | SEV-1/2 | Block posting; preserve database | Verified restore or reviewed forward correction; never edit posted lines |
| Cross-tenant concern | SEV-1 | Disable affected surface platform-wide | Preserve logs, rotate exposed credentials if any, isolation test before release |
| Migration/schema drift | SEV-2 | Halt canary rollout; block unsafe posting | Restore test copy, forward-fix, rerun schema and financial scans |
| Source/Stripe backlog or conflict | SEV-2/3 | Pause affected consumer | Reconcile stable source IDs; replay idempotently |
| Bank/reconciliation inconsistency | SEV-2 | Block reconciliation completion/close | Compare snapshot, match groups, and ledger evidence |
| AP or commerce inconsistency | SEV-2 | Pause affected module posting | Review source documents and immutable journals; reverse normally if required |
| Year-end failure | SEV-2 | Keep fiscal year uncompleted | Preserve failed entry, controlled reversal/correction, revalidate |
| Job backlog | SEV-3 | Stop runaway retries | Classify dependency/permanent/transient, resume from checkpoint |
| Attachment/R2 or export leak concern | SEV-1/2 | Revoke delivery and access | Audit keys/downloads, rotate authorization, notify based on verified scope |
| Parish restore | SEV-2 | Freeze affected parish posting | Restore to new DB, verify fully, approved cutover |
| Platform outage | SEV-1 | Accounting read-only/unavailable | Recover dependencies, canary parish, staged release |

Prohibited actions: editing posted journals, deleting migration history, exposing raw provider payloads, weakening tenant checks, restoring over production without test validation, or assuring “no data affected” before evidence supports it.

Internal communication templates: “Accounting is temporarily read-only while we verify integrity”; “integration processing is delayed and safe retries are in progress”; “a reconciliation requires review before completion”; “migration rollout is paused at canary”; “export regeneration is underway and prior links are revoked”; “service is restored after verification.” Include parish scope, verified impact, current containment, next update time, and correlation reference.
