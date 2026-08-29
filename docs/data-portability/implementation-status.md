# Parish portability implementation status

Updated August 29, 2026. Implemented and exercised in isolated staging;
the additive production schema, ownership registries, private storage, and Worker
public-media route are deployed. Parish export, storage guards, automatic closure,
and strict backup expiry remain **disabled in production**.
Policy: 2026-08-28-active-storage-v2.

Dedicated remote staging resources have now been provisioned and tested. The
full-schema local rehearsal, private hosted export/closure/restore drill, and
separate realistic-volume hosted export gate pass.
Confirmation is split into consent, book-freeze, and authorization phases; the
largest hosted phase used 697 of the enforced 800-operation work budget. See
[Staging release review](staging-release-review.md) for current evidence and the
next required engineering work. A green regression suite is not release approval.
For module ownership, state transitions, read-only triage, and the test ladder,
see the [portability debugging guide](debugging-guide.md).

## Available behavior

The parish Settings panel provides separate ordinary exports and final closure.
Both require current administrator authorization and fresh MFA. Closure additionally
requires cancelled billing, verification of the administrator's saved ZIP, typed
confirmation, and a fresh source comparison under database/storage write barriers.
Downloading alone never authorizes deletion.

Exports contain JSON, spreadsheet-safe CSV, supported uploaded files, row counts,
and checksum manifests. Credentials and independent donor/Learn accounts are
excluded. Shared people retain their independent identities. Limits remain 24 MB,
10,000 rows per dataset, and 2,000 ZIP entries; larger requests fail explicitly
and require an operator-assisted full export.

## Work completed in this update

| Area | Implemented |
| --- | --- |
| Files | Every current R2 writer supplies parish ownership. Guarded operations are tracked in D1; closure waits for them. Full bucket inventories cover orphaned uploads and variants. Unknown ownership/ETags stop closure. Financial files move to verified private retention copies; eligible active files and all known temporary exports are removed with checkpoints and deletion verification. |
| Legacy data | Explicit KV record/index classification, central app_settings ownership, a D1 registry of acknowledged KV writes, hash/convergence checks, scoped disposal, and closed-parish read/write suppression. Independent donor/Learn records survive. |
| Accounting retention | Dedicated books are identity-checked and frozen with added triggers. Existing immutable journal/closing rules are preserved. Accounting schedulers skip closed parishes. Financial/legal dependencies remain, with a minimal registration stub where a retained foreign key requires it. |
| Retention tracking | Financial/support copies have restricted-retention records and review dates. Defaults follow existing product policy: seven years for financial/legal evidence, three for support; longer accounting settings are honoured. Review dates do not authorize deletion or override holds. |
| Backup expiry | Strict expiry removes the newest-backup exception only when ACCOUNTING_BACKUP_STRICT_EXPIRY_ENABLED is explicitly true. The default preserves the deployed policy. Strict sweeps check deletion with HEAD and record evidence; confirmation requires the gate and matching evidence no more than 48 hours old. |
| Restore safeguards | Independent private R2 closure authority, request/scheduler safety checks, quarantine, suppression replay, and restored-data sanitization. An older DB cannot pass the runtime gate while missing an independent closure authorization. |
| Recovery | Checkpoints support retry after partial cleanup. Ambiguous uploads retain a durable fence. Operator-only reconciliation handles file ownership, interrupted file operations, and abandoned unconfirmed preparation. Confirmed closure cannot be undone by cancellation. |
| Real provider restore | A hash-locked operator exported the live central and St. Fiacre accounting D1 databases into fixed unbound scratch databases, restored all 26 production file objects (24,828,438 bytes) into private scratch R2, and restored all 35 current legacy KV keys. Central validation, exact accounting schema/ledger fingerprints, every file/KV body hash, and a second source-stability inventory passed. All scratch resources and local SQL copies were deleted with provider readback; production was read-only. |
| Public media | The registry-owned Worker route is deployed and returns `no-store`. Three historical D1/KV URLs were rewritten with guarded hash/readback checks. All three r2.dev origins are disabled, with zero custom domains, and the disabled-origin attestation is configured. |
| Browser safety gate | A repeatable local Playwright gate exercises the real parish portability and privileged-MFA clients. It proves a 428 step-up opens the MFA flow and resumes the original request, active billing rejects the final-export request, and an ordinary ZIP download never calls closure confirmation. A post-deployment, read-only production walkthrough then opened the St. Fiacre panel with a fresh authenticated session, returned the intended release-disabled state with zero jobs and disabled actions, and produced no browser warnings or errors. No production export, billing change, or purge was attempted. |
| Realistic volume | A native local workerd gate and a separate private hosted Worker both exported 21,008 synthetic rows: 12,003 central parish/control rows and 9,005 accounting rows, including 4,000 offerings, 3,000 journal entries, and 6,000 journal lines. The hosted archive was 11,350,769 bytes. Row counts, archive hash, secret exclusion, and tenant scope passed. A separate 10,001-row dataset returned 413, preserved every source row, and published no partial archive. The route-less test Worker was removed after the run; its private archive bucket has one-day expiry. |

The accounting books and retained financial/legal rows are **not physically erased**
by this flow. They are disclosed retention exceptions. Active legal holds block
self-service closure for review. At a retention deadline the item becomes
review_due; disposal of immutable history still requires an authorized retention
review. The application does not claim an all-copies-deleted status.

A separate independent completion marker also rejects intermediate backups taken
after authorization but before the central purge. A crash or uncertain provider
outcome does not produce a successful receipt.
Obsolete file/KV ownership indexes are removed only after successful cleanup,
because source keys can contain personal information.

## Production prerequisites still outstanding

The code now has the storage/disposal adapters. Production migrations 0108, 0109,
and 0110 are applied. The generated 441-trigger closure barrier set is installed,
with zero closure/job rows. A metadata-only inventory reconciled all 26 physical
R2 objects and all 18 parish-scoped KV keys; their complete readback hashes match.
All production release flags remain false.

A fixed-scope production audit found all three release flags false and all 31
legacy accounting tables empty. The two configuration gaps it found have been
reconciled. The existing St. Fiacre book now has an independently evidenced
`parish_id`, and the production backup bucket now has a verified 365-day object-
expiration lifecycle rule. The pre-change inventory found 59 objects, none past
the retention threshold. These scoped corrections are not overall release approval.

The public-media migration is complete. The deployed Worker served all three
inventoried objects before and after the guarded reference rewrite; the post-cutover
audit found three disabled r2.dev origins, zero enabled origins, zero custom domains,
and three successful no-store Worker HEAD responses.

1. Retire old unguarded Worker versions and any direct-upload credentials. Keep
   independently evidenced identity metadata on every accounting database; the
   current St. Fiacre production book and current R2/KV ownership are reconciled.
2. The production backup bucket's 365-day lifecycle and 59 current objects are verified.
   A read-only recovery inventory found 29 recent successful scheduled backup runs,
   no database backup among 297 current GitHub Actions artifacts, and D1 Time Travel
   available at 7 and 29 days but unavailable at 31 days. The newest paired private
   production D1 SQL/checksum artifact was subsequently restored into a fixed,
   unbound scratch D1: its stored checksum and migration history matched, current
   migrations and all 441 barriers were applied, the complete read-only validator
   passed, and the scratch database plus local copies were deleted with readback.
   The isolated hosted drill separately verified closure suppression and repeated
   quarantined sanitization with synthetic data. A subsequent real provider
   multi-store qualification restored the live central and St. Fiacre accounting
   databases, all 26 production file objects, and all 35 current KV keys into fixed
   private scratch resources. Database validation, exact schema/ledger comparisons,
   body hashes, source-stability readback, and scratch/local cleanup all passed;
   production was never a write target. Complete the off-provider/manual-copy
   attestation before release. Natural one-day lifecycle observation is awaiting
   its threshold and provider deletion.
3. Approve/version the public retention disclosure, including minimal closure and
   receipt metadata. No automatic disposal of legally held/immutable records is
   enabled by a review date.
4. Keep the bounded confirmation budget, hosted closure/restore drill, and
   realistic-volume export gate in the release process. Re-run the volume profile
   when row schemas or self-service limits change. The independent ledger currently
   caps at 1,000 closures and object/key inventories at 10,000 entries.

Cloudflare Stream video still requires an operator-assisted complete export and
provider disposition; it blocks self-service export/closure rather than being
silently omitted.

All three portability feature switches remain false in wrangler.toml:
PARISH_PORTABILITY_ENABLED, PARISH_STORAGE_GUARDS_ENABLED, and
PARISH_AUTOMATIC_CLOSURE_ENABLED. Once closures are enabled, storage guards must
remain enabled even if export UI is disabled. The r2.dev-disabled attestation is now
set from provider readback; other operational attestations must not be used to bypass
their remaining deployment prerequisites.

The separate ACCOUNTING_BACKUP_STRICT_EXPIRY_ENABLED gate is also false in both
production and shared accounting staging. The existing daily cron does not depend
on the portability switches. With strict expiry disabled, it preserves the newest
backup when all copies are expired and cannot issue strict-expiry evidence.

## Local runtime release drill

The next validation layer now passes using native local D1, R2, and KV bindings
inside workerd, rather than only Node mocks. Run
`npm run test:parish-portability-runtime`; it is also part of `npm run check`
through `check:release-gates`.

The six checkpoints cover initialization, a pre-closure snapshot into separate
restore stores, ordinary/aborted downloads, archive checksums and write barriers,
active-data deletion with private financial retention, and quarantined restore
replay/sanitization. The independent ledger is never rolled back. Other-parish
records and shared donor identities survive; repeated sanitization is tested.

The separate `npm run test:portability-volume` gate uses the complete reviewed
central and accounting schemas inside workerd. It exports 21,008 synthetic rows
into an 11.35 MB ZIP, verifies every manifest checksum and secret exclusion, and
proves a 10,001-row dataset fails without publishing an archive or changing source
data. The same profile passed in an isolated, route-less hosted Worker invocation.

This caught and fixed handling of D1's protected `_cf_METADATA` table in both
central and accounting inventories. Only specific provider tables are excluded;
unrecognized application tables still block exports.

The local test uses synthetic fixtures and an isolated local-only entrypoint, with
application network egress blocked, no credentials, and ephemeral storage. A
separate private, route-less staging Worker completed the same bounded phases; it
did not send email or change subscriptions. See
[Local runtime drill](local-runtime-drill.md) for scope and remaining remote gates.

See [Storage and restore runbook](storage-and-restore-runbook.md) for bindings,
retention boundaries, maintenance functions, and the restore sequence.

## Verification

Local synthetic SQLite/D1 and R2/KV tests cover tenant isolation, credential
filtering, source/ZIP hashes, ordinary and aborted downloads, stale or invalid
confirmation, missing triggers, transaction rollback, durable retries, shared
people, orphaned uploads, uncertain provider outcomes, stale KV list/value
behavior, retained file copies, minimal retained registrations, immutable
accounting freezes, expired backup evidence, and quarantined restore replay.

The following checks passed in this update:

- npm run check (complete suite, including the local workerd drill)
- npm run test:parish-portability-runtime (six checkpoints)
- npm run test:parish-portability
- npm run check:core
- npm run check:accounting
- npm run check:directory
- Wrangler deployment dry run (bundle only; no deployment)
- Syntax checks and git diff --check

The repeatable synthetic browser gate covers opening the panel, completing fresh
MFA, rejecting a final export while billing is active, queueing an ordinary export,
and downloading it without invoking closure confirmation. It also guards the
client-side checksum and explicit-confirmation wiring in CI's static release checks.
The production panel exposed and now has a regression fix for duplicate parish rows
being selected differently by the dashboard and portability authentication paths.
After deployment, a fresh production login opened the panel successfully; the old
Unauthorized response was gone, the fresh MFA-backed session was accepted, all
release-blocked actions remained disabled, and the browser console stayed clean.
This update did not run a production or browser-driven purge.
The production Worker was deployed with the inactive portability code and active
public-media route. No subscription was changed and all portability/closure flags
remain false.
Reviewed production changes now comprise one accounting identity control row, one
backup-bucket lifecycle rule, migrations 0108-0110, 26 R2 ownership rows, 18 KV
ownership rows, three inventory reviews, 441 inert closure barrier triggers, and
three private portability buckets. Temporary exports have a seven-day provider
lifecycle; the independent authority/closure/completion prefixes are indefinitely
locked. The application bindings and public-media delivery configuration are deployed.
The authentic central-D1 restore qualification created only a temporary unbound
scratch database; it was deleted after validation, and both local backup files were
removed. It did not write to production.

The private hosted staging drill passed export, verified download, consent, book
freeze, authorization, purge, restore denial, suppression replay, and repeatable
sanitization. Its largest invocation used 697 of the enforced 800-operation work
budget. A real R2 lifecycle probe remains pending after its one-day threshold;
crossing that threshold alone does not prove provider deletion.

A read-only remote staging metadata check found no migration-history entries
for 0108/0109/0110 and no portability control tables. All queries reported zero
rows written and changed_db=false. Shared staging was not changed. A separate
dedicated environment now has reviewed zero-row baselines and its own resources;
no migrations were applied to the shared environment during this check.
