# Parish and accounting self-service recovery

## User experience

Settings contains **Backup & restore · Whole parish**. The Accounting header has
**Backup & restore**, opening the **Accounting only** panel. Both show the last
verified, scope-specific restore-ready cloud backup and refresh status every 30
seconds while visible. The platform-wide database backup timestamp remains a
separate, explicitly scoped status in the original parish backup card.

**Back up now** creates a verified private cloud restore point. **Download latest
backup** exports that point as readable JSON/CSV and files in a ZIP. The original
parish-export download is unchanged. Export ZIPs are not accepted as executable
restore input: restore reads only server-created snapshots belonging to the
authenticated parish and requested scope.

**Restore…** defaults to the newest manual point, shows its date and available
safety points, explains replacement, requires acknowledgment and the exact phrase
`RESTORE PARISH` or `RESTORE ACCOUNTING`, then creates a new safety snapshot before
replacement. An interrupted operation exposes Resume, pre-replacement cancellation,
or recovery of the pre-restore safety copy. Completed restores can be undone by
selecting their safety point. Reload the dashboard after restoring its records.

## Scope and preservation

Parish recovery covers the reviewed tenant-owned central tables, the parish's
accounting database, owned files, eligible legacy records, and explicitly reviewed
parish-editable registration configuration (including funds and campaigns).
Accounting recovery covers only the books and accounting attachments. It never
rolls back central parish records.

Credentials, staff permissions, subscription/billing/provider identity, shared or
independent identities, audit history, legal holds, and technical database metadata
remain current. Registration configuration is patched into the current record;
it does not restore old session tokens or passwords. Reviewed legacy registration
mirrors receive the same configuration with current credentials preserved.

Restores do not refund, charge, send messages, replay provider events, or revert
external services. Changed payment and external-source tables block rollback
before replacement; this requires reconciliation rather than an automatic undo.
Schema changes, a newly shared/foreign-owned record, active accounting holds,
unclassified data, or incoming references outside the rollback also block it.

## Execution and safety

- Migration `0128_parish_recovery.sql` provides durable operations, scope locks,
  snapshot metadata, and immutable financial recovery-retention receipts.
- Primary parish authentication is required. New operations and downloads require
  recent MFA. The original authenticated session can continue its already-confirmed
  fixed operation after its MFA window expires; another session needs fresh MFA.
- A unique active operation per parish serializes backup/restore. Leases prevent
  concurrent phase execution; the operation is reread after acquiring the lease.
- Database triggers fence ordinary writes, including in-flight requests, background
  jobs and webhooks. File/KV writes use the existing durable storage-operation fence;
  the operation waits for prior writes to drain. Recovery verifies its trigger hash.
- Capture runs in separate central/books/files phases while data is frozen. Each
  R2 component is read back and SHA-256 verified before the point becomes ready.
  `createdAt` is capture time; `verifiedAt` is successful cloud verification time.
- All components, ownership, schema, dependencies, and ledger balance are validated
  before replacement. A verified safety point is mandatory.
- Financial evidence from the safety point is separately preserved in the restricted
  retention bucket before replacement. The review date is at least seven years,
  honoring longer accounting retention settings. No automatic financial-evidence
  deletion is implemented. This evidence is not a parish-facing download endpoint.
- Each database replacement is a native D1 batch transaction. Original triggers are
  restored inside that transaction; a failed statement rolls back its changes.
  Cross-store execution uses durable, replayable phases and stays write-locked until
  verification. It is not represented as one atomic transaction across D1/R2/KV.
- File bodies, record values, provider details and credentials are not logged.
- Browser continuation is immediate. The existing five-minute scheduled handler
  advances one saved phase when the browser is closed. A provider-interrupted lease
  can take ten minutes to become retryable. Paused errors require Resume or safety
  recovery and never silently release the workspace.
- Normal restore points and safety points expire after seven days. Scheduled cleanup
  excludes points pinned by active operations. Financial evidence uses the separate
  restricted retention process.

Self-service bounds are 10,000 rows per table, 12 MB per stored component, 10,000
objects per physical inventory, 200 distinct files/legacy keys across the selected
and safety points, and a bounded single-database replacement transaction
(at most 900 prepared statements). Large archives still respect the existing 24 MB
ZIP export limit. Bounds fail explicitly; no partial backup is labeled successful.
Each invocation also enforces an 800-operation work budget, including individual
statements in batches and object-store requests, with a reserved allowance for
saving a paused checkpoint and releasing the execution lease.
Before replacement, the planner checks the database work plus its transaction and
registration mirrors against a conservative per-phase allowance. Oversized restores
remain cancellable and leave current records and files unchanged.
External media remains external. Original pre-feature exports are not restore points.

## Release gate — not enabled on production

`PARISH_RECOVERY_ENABLED` defaults to false. Keep it false until:

1. Apply the recovery migration and verify schema/guard compatibility on a disposable
   deployment with the current central and accounting schemas.
2. Qualify **all** current file/KV writers and ownership registries, including orphan
   files and sacrament documents. The staged rollout sets
   `PARISH_STORAGE_GUARDS_ENABLED="true"`; enabling it without this qualification
   can disrupt existing uploads. Old ownership-audit scripts predate current storage
   bindings and must not be treated as complete evidence without updating their scope.
3. Verify private `PARISH_EXPORTS`, `PARISH_RETAINED_DATA`, and original independent
   `PARISH_CLOSURE_LEDGER` bindings, retention policies, and accounting database identity.
   Recovery refuses a suppressed/closed parish. Never bind a restored closure ledger.
4. Rehearse snapshot, restore, interrupted-phase safety recovery, and financial-evidence
   retention on disposable resources with native D1/R2/KV, using the real deployed
   schema and representative volume. Verify unrelated parishes remain unchanged.
5. Enable the verified storage guards, then enable recovery. Create fresh restore
   points before inviting parish users to rely on the Restore controls.

No production snapshot or restore is run by this implementation's tests. A release
must not enable a destructive feature merely because its UI or unit tests passed.

### September 30 storage-guard rollout evidence

- [Hosted qualification](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/36762488404)
  passed both restore scopes and the D1 HTTP transaction rollback probe, with complete cleanup.
- [Production read-only audit](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/36764246962)
  reviewed all ten file buckets, all three accounting databases, 26 files and 18 parish legacy keys:
  zero unresolved owners, matching authoritative registries, and verified private recovery storage.
- [Ownership verification reconciliation](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/36764512395)
  updated control metadata only and verified exact readback of all 26 files and 18 keys.
- This stage enables storage guards while leaving recovery disabled. Post-deployment
  health and another read-only consistency audit are required before recovery activation.

## Verification

The September 30 qualification updates the read-only ownership audit to cover
all registered production accounting databases and sacrament documents. The audit
asserts that its physical bucket list matches the application's file bindings.
Run the existing recovery-drill workflow with `ownership_audit_only: true` for
an aggregate report using protected provider credentials. This option does not
run the restore drill, write registries, or enable recovery. An audit report must
say `verified_ready_for_registry_review`; a completed job alone is not readiness.
The reviewed Phase G technical canary is recognized only by its exact documented
parish/database/binding identity. An unidentified canary cannot contribute uploaded
attachments to the audit. Any other unregistered accounting owner still blocks it.

Once the complete ownership audit passes, the same workflow can reconcile ownership
metadata with `reconcile_ownership_registry: true` and both exact reviewed registry
hashes. It reruns the audit, rejects changed hashes, pending writes and ownership
reassignment, updates control records only, and verifies full readback. It does not
change parish records, ledger entries, file bodies, or feature flags. Recovery and
storage guards must remain disabled until this result is verified.
After deploying storage guards, rerun the read-only ownership audit before enabling
recovery. Both registry consistency checks must pass; any concurrent storage change
requires another audit, and any unresolved mismatch keeps recovery disabled.
Accounting resolution includes databases created by the onboarding provisioner,
with parish identity verified before access. Managed-service queries share the
invocation work budget. The cloud rehearsal also verifies D1 HTTP batch rollback
on a disposable database, matching the provisioner's transaction transport.

Run the following from the repository root:

```text
node scripts/parish-recovery-tests.mjs
node scripts/accounting-recovery-tests.mjs
node scripts/parish-recovery-failure-tests.mjs
node scripts/parish-recovery-runtime-tests.mjs
node scripts/parish-recovery-browser-tests.mjs
node scripts/parish-backup-tests.mjs
node scripts/parish-backup-browser-tests.mjs
node scripts/parish-portability-tests.mjs
```

The native runtime drill uses the complete reviewed central schema plus later
migrations and every checked-in accounting migration. Its default is local
workerd/D1/R2/KV with network egress forbidden. It verifies both restore scopes,
interrupted file replacement, fenced writes, safety rollback, financial retention,
and unrelated-parish isolation. Platform contact leads remain independent.

The manual `self-service-recovery-qualification.yml` workflow runs the same drill
on fresh disposable hosted stores through a private service-only Worker. It uses
synthetic data, verifies private bucket settings, and removes its own run-scoped
resources in an always-run cleanup step. Both `passed` and `cleanupComplete` must
be true in its aggregate evidence artifact. Production bindings are rejected.
This workflow must run from protected main and does not enable parish recovery.
UI screenshots are
written to `artifacts/parish-recovery/` using synthetic data.
