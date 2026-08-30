# Storage disposal and restore safeguards

Status: implemented and tested locally and in isolated hosted staging on
August 28, 2026. Production schema, ownership controls, private portability
storage, and Worker public-media delivery are deployed. Export, storage guards,
automatic closure, and strict backup expiry remain disabled.
Policy identifier: `2026-08-28-active-storage-v2`.

## Release boundary

Do not enable automatic closure just by changing a flag. The production resources,
historical ownership reconciliation, public asset domains, and restore drill below
must be verified first. No real parish was closed during implementation.

The application still separates an ordinary export from final closure. Final
closure requires fresh administrator MFA, cancelled billing, a saved archive whose
SHA-256 matches, typed confirmation, unchanged data under write barriers, and an
independent suppression marker written before the first deletion.

## Storage and configuration

Apply migrations 0109 and 0110 after the preceding migrations. Provision three
separate private R2 buckets; do not reuse public assets or mixed-parish backups:

| Binding | Contents | Disposal policy |
| --- | --- | --- |
| PARISH_EXPORTS | Temporary ZIPs | Seven-day application expiry; configure matching R2 lifecycle expiry as a safety net |
| PARISH_RETAINED_DATA | Financial supporting documents and support correspondence | Restricted access; review dates in D1; no blanket lifecycle deletion that could override a hold |
| PARISH_CLOSURE_LEDGER | Independent closure markers, authority identity, latest backup sweep evidence | Must survive application DB restores; no blanket lifecycle expiry |

Create `authority.json` in the closure bucket with an independently generated `id`
and the exact `policyVersion` above. Set PARISH_SUPPRESSION_AUTHORITY to that ID.
Protect `authority.json`, `closures/`, and `completions/` from accidental deletion and overwrite
using reviewed bucket locks/access controls. Restrict operator credentials and
keep this bucket out of application restore/replacement procedures. Do not apply
its protection rule to the replaceable `backup-expiry/latest.json` report.

The production buckets `agapay-parish-exports`, `agapay-parish-retained-data`, and
`agapay-parish-closure-ledger` were provisioned and verified on August 29. All have
r2.dev disabled and no custom domains. The export bucket has a seven-day rule scoped
to `parish-exports/`; retained data has no blanket expiry. The closure ledger's
`authority.json`, `closures/`, and `completions/` prefixes have indefinite locks,
and the authority object matches the configured PARISH_SUPPRESSION_AUTHORITY.

PARISH_STORAGE_GUARDS_ENABLED controls the storage/restore safety boundary and is
separate from PARISH_PORTABILITY_ENABLED, which controls export UI/jobs. Once any
parish is closed, hiding the UI is **not** a reason to turn the guards off. Set
PARISH_RESTORE_QUARANTINE=true before any restore or operator reconciliation.

ACCOUNTING_BACKUP_STRICT_EXPIRY_ENABLED is a separate cron release gate. It stays
false until backup creation, retention expiry, provider recovery windows, and
restore suppression have passed review. False/unset preserves the deployed
newest-copy exception. Only true permits strict sweep evidence, and closure
rejects evidence generated without this explicit gate. Turning the gate off after
closure does not undo deletion or disable storage guards; it pauses closure
processing and invalidates the strict-expiry readiness claim.

Install the current generated D1 triggers in
`docs/data-portability/install-write-barriers.sql`. The backend verifies their SQL,
not just their names. Reconcile all actual schemas against the reviewed catalogs.

## File ownership and uploads

All current file writers now supply a server-derived parish ID. The Worker wraps
the R2 bindings when storage guards are enabled. It records ownership before an
upload and tracks the entire provider operation in D1. Closure inserts its barrier
atomically relative to acquisition of new storage operations, then requires every
existing operation to finish. Unknown multipart upload paths are rejected.

The operation table deliberately has **no automatic timeout deletion**. A failed
network request does not prove that the provider stopped writing. A successful
operation releases its row; an uncertain outcome requires operator recovery.

Inventory covers whole physical buckets, including unreferenced uploads and old
variants. GROUP_MESSAGE_ASSETS and PARISH_LIBRARY_ASSETS are treated as one physical
bucket. Every object needs an owner and a verified ETag. Random legacy keys cannot
be assigned from a parish name guess. Unknown objects, changed versions, and
conflicting ownership stop export/closure when guards are active.

Use the operator-only functions in `src/portability/maintenance.js` in a reviewed
maintenance runner with target bindings, quarantine, and all writers stopped:

- `reconcileObjectOwnership`: explicit parish/key/ETag assignment with the hash of
  the reviewed ownership evidence. Reassignment to a different parish is rejected.
- `reconcileFileOperation`: confirm the actual outcome of an interrupted R2 write,
  update its inventory state, and release that operation's fence.
- `releaseAbandonedPreparation`: release a crashed *unconfirmed* preparation only.
  Confirmed jobs or independent closure markers cannot be undone this way.

These functions are intentionally not public HTTP endpoints. The evidence hash
records the operator's review; it is not an automated proof that external writers
are stopped. Retire old Worker versions and direct-upload credentials before
enabling closure. Test metadata on every real upload route.

Nonfinancial objects are deleted and checked with HEAD. Financial objects are
first copied into private restricted storage and read back to verify their hash,
then removed from the active bucket. Every completed file step is checkpointed.
Failures resume without treating a partial cleanup as success. Old export ZIPs,
including orphaned ZIPs identified through object metadata, are removed too.
Obsolete ownership indexes are removed after successful cleanup because source
keys can themselves contain personal information.

### Public media caches

Production asset URLs now use the registry-owned Worker delivery route at
`/api/public/parish-assets/{campaign|announcement|teaching}/...`; it verifies the
ownership row and ETag, observes closure fences, supports audio ranges, and always
returns `no-store`.

The completed deployment followed this strict order: deploy the inactive route and ownership registry; then
enable Worker delivery and set new-upload bases while leaving the separate r2.dev-
disabled attestation unset. Verify Worker delivery, rewrite all central/KV historical
references, and verify every rewritten URL. Disable all three r2.dev origins and read
back their disabled status. Only then set the r2.dev-disabled attestation. Worker
delivery alone never satisfies the closure/cache-disposal gate.

The August 29 cutover rewrote exactly three references under fresh hash evidence:
one central registration JSON value, one legacy KV value, and one teaching-post URL.
Post-write ownership still reconciled 26 physical objects to 26 references. All
three r2.dev origins then read back disabled, zero custom domains remained, and all
three objects continued returning 200/no-store through the Worker. The matching
`PARISH_R2_DEV_PUBLIC_ACCESS_DISABLED` attestation is configured for deployment.

The adapter needs PARISH_ASSET_CACHE_ZONE_ID, a least-privilege
PARISH_ASSET_CACHE_PURGE_TOKEN secret, and
PARISH_PUBLIC_CACHE_POLICY_VERIFIED equal to the policy identifier. Each affected
URL is purged and provider success is required before completion. New guarded
uploads use no-store. Verify aliases, query-string cache rules, transformations,
and old r2.dev access; the per-URL adapter must not be attested as covering caches
it cannot purge. Previously downloaded browser/recipient copies cannot be recalled.

Cloudflare Stream video still requires an operator-assisted complete export and
provider disposition. Such a parish cannot pass the self-service export/closure
flow. No partial video export is labelled complete.

## Legacy records

The classifier covers registrations, commemoration/offering records and indexes,
parish calendar credentials, feature requests, reconciliation records, support
tickets, and legal acceptance evidence. Independent donor and Learn accounts are
not deleted. Unknown keys and dangling/cross-parish indexes require review.

Parish values in central app_settings are now scoped, exported, and covered by D1
barriers as well. Financial reconciliation and support data are copied into
restricted storage before their active key/value rows are deleted.

The KV wrapper records parish keys and content hashes in D1. Export combines KV
listing with that registry so a stale list cannot omit a newly acknowledged write.
Hash mismatches and pending writes stop confirmation. Closed-parish reads are
suppressed even if KV still returns an old value after deletion. Deletion remains
pending until the observed values disappear; the worker retries. KV convergence
is not represented as a transaction or as immediate deletion at every location.

Reconcile a complete historical KV inventory with old writers stopped, including
unknown key types and interrupted operations. Only then set
PARISH_LEGACY_INVENTORY_VERIFIED to the policy identifier. This is an operational
attestation, not an ownership bypass. No automatic KV-operation recovery by age
is implemented; unresolved provider outcomes need a reviewed convergence check.

## Accounting and other retained evidence

Each separate accounting database must have an independently verified parish_id
in accounting_database_metadata. New provisioning writes it only for a newly
created database. Existing databases are never relabelled to satisfy the exporter.
The August 28 production reconciliation established the existing St. Fiacre book
identity from its immutable Cloudflare UUID/creation time, the contemporaneous Git
binding commit, and 12 internal `st-fiacre:` journal source keys; the central
registry was corroboration, not the sole source. A guarded insert added the one
metadata row and a fresh readback verified it. Apply the same independent-evidence
standard to every future existing book rather than copying its central mapping.

Preparation freezes all reviewed accounting tables with additional triggers.
Existing journal, audit, and closing immutability triggers stay intact. A stale or
failed *unconfirmed* preparation releases its freeze. After confirmation, books
remain frozen in their dedicated original database as a disclosed retention
exception; operational credentials/memberships are removed and accounting
schedulers skip the closed parish. This is not a physical deletion of the books.
Classified credential keys in technical accounting metadata are removed only
after confirmation, inside an atomic, narrowly scoped cleanup. Journal and audit
immutability rules remain active throughout.

Central financial/legal rows and their actual parent dependencies are preserved.
Where a retained foreign key requires a registration, only a closed stub remains:
reference/parish ID, existing financial identifiers and timestamps, with credentials,
names, community settings, and the old JSON payload removed.

Retention entries record category, location evidence, and a review date. Defaults
follow the existing product policy: seven years from closure for financial/legal
evidence, three for support. Longer configured accounting periods are honoured.
These are product-policy defaults, not a claim about every jurisdiction's legal
minimum. Active accounting legal holds block self-service closure for review.

When a review date arrives, status changes to review_due. There is no automatic
physical disposal of immutable books or legal evidence. An authorized retention
review must check current holds and dependencies and approve disposal separately.
Minimal closure/receipt metadata also needs its final published retention policy:
do not erase the suppression ledger while any eligible recovery source can revive
the parish. Legal/retention policy approval remains a production release gate.

## Backup expiry

The daily R2 sweep uses upload age and defaults to 365 days. Only when
ACCOUNTING_BACKUP_STRICT_EXPIRY_ENABLED is explicitly true does it remove the
expired-newest-object exception; the disabled default preserves that recovery copy
and cannot issue strict-expiry evidence. It verifies deletion and reports failures. Configure a
matching lifecycle rule and monitor successful *new* backup creation independently.
With daily execution, removal may occur up to a day after the age threshold.
Do not copy/re-upload old backups to restart their age; track any exceptional copy
with its original capture date and approved final disposal deadline.

A successful sweep writes verification evidence to the independent ledger. Final
confirmation and initial disposal require a matching report no more than 48 hours
old. PARISH_BACKUP_EXPIRY_VERIFIED must also match the policy version only after
provider recovery history, R2 lifecycle rules, manual copies, and restore suppression
have been checked. The report verifies the application sweep, not those other stores.

The August 28 production lifecycle inventory found 59 objects, from July 21 through
August 28, and none already older than 365 days. A named 365-day object-expiration
rule was then added and verified by provider readback. The strict application sweep
remains disabled; lifecycle configuration alone does not certify manual copies,
D1 Time Travel expiry, successful restores, or production expiry behavior. The
separate isolated staging R2 probe was present before its one-day threshold and
absent on a read-only HEAD at 2026-08-30 14:35:03 UTC; no application sweep ran.

The August 29 read-only recovery inventory found 29 recent successful executions
of the production D1 backup workflow. None of the 297 then-current GitHub Actions
artifacts was named as a database/D1/SQL backup; those artifacts are not a hidden
database retention tier based on repository-visible evidence. D1 Time Travel was
available for both production databases at 7 and 29 days and unavailable at 31
days, consistent with an approximately 30-day provider window. The audit did not
perform a restore and cannot discover personal downloads, manually copied exports,
support attachments, or copies in accounts outside the repository/provider view.
An accountable operator must inventory and attest those locations and their final
disposal dates before setting PARISH_BACKUP_EXPIRY_VERIFIED.

The August 30 refresh found 30 successful recent backup runs and 323 current
GitHub Actions artifacts. Four broad name matches were the recovery drill's
explicitly metadata-only JSON evidence artifacts, not database payloads; the
inventory now classifies those separately. D1 Time Travel retained the same
7/29-day available and 31-day unavailable result. The isolated R2 natural-lifecycle
probe also passed. Manual and off-provider copy attestation remains outstanding.

An August 29 authentic central-D1 restore qualification selected the newest paired
private production SQL/checksum artifact under a fresh metadata evidence hash. The
stored checksum and migration history were verified before creating a fixed unbound
scratch D1. Because the backup predated portability migrations 0108–0110, the first
read-only validation correctly failed migration currency and barrier checks. The
corrected restore procedure applied current migrations and regenerated all 441
reviewed barriers before validation; every check then passed. The scratch database
was deleted with provider readback and both local backup files were removed. This
qualifies the central D1 backup path; it does not attest undiscoverable manual copies.

A separate August 29 real provider multi-store qualification used fresh, hash-locked
metadata and fixed unbound targets. It restored live central and St. Fiacre
accounting D1 exports, all 26 production file objects (24,828,438 bytes), and all 35
current KV keys. The central validator, exact accounting schema and ledger
fingerprints, every restored file/KV body hash, and a second source-stability
inventory passed. The accounting export's exact current schema was compared rather
than replaying its historical bootstrap migrations. All scratch databases,
namespace, private buckets, and local SQL files were deleted with provider readback.
Production bindings were read-only. The operator is
`scripts/portability-provider-multistore-restore.mjs`; it defaults to a plan and
requires a fresh evidence hash for apply.

D1 Time Travel history has its own provider retention window. SQL DELETE does not
erase that history. Shared backups cannot be destroyed solely for one parish if
other parishes still need recovery. A restore must suppress closed parishes instead.
Retained financial rows can appear in later backups until their approved disposal;
do not promise that every copy expires a fixed number of days after closure.

## Restore drill and activation

1. Quarantine the destination, disable all external access to restored public media,
   stop writers, and use isolated target databases/buckets. Never restore over live
   production. Keep the original independent ledger bound and safety guards enabled.
2. Restore the data and apply current migrations. Compare hashes and schema.
   Reconcile all file ownership and uncertain operations with actual evidence.
3. In an operator-only runner, call replayClosureSuppressions with the quarantined
   environment and maintenance evidence hash. This installs/verifies barriers and
   replays original authorizations. Replay alone does **not** reopen traffic.
4. Call sanitizeRestoredParish for every returned parish. It freezes restored books,
   disposes restored files/KV data, purges eligible central records, and removes
   restored temporary exports. Old cleanup checkpoints are not used as proof that
   independently restored file/KV copies are gone.
5. Run scripts/validate-restore.mjs against the isolated DB. Verify the original
   independent ledger through assertRestoreSafe with quarantine removed only in a
   test invocation. Check other parishes remain intact and closed identities cannot
   sign in, upload, receive imports, or reappear through fallback stores.
6. Exercise missing ledger, wrong authority, stale backup evidence, interrupted
   upload, interrupted purge, and rollback cases. Verify caches/provider recovery
   settings and perform a real load test before approving traffic.
7. Only after review remove quarantine and enable automatic closure. Keep storage
   guards on through UI rollback and future restores, including Time Travel.

Separate immutable completion markers also reject an intermediate backup taken
after authorization but before the atomic purge. The runtime checks current ledger
metadata, local closure state, and the central purge checkpoint before HTTP
traffic or scheduled work. Missing/mismatched authority or missing replay returns
503 and prevents scheduled work. There is no cached negative suppression decision.
The initial implementation caps the ledger at 1,000 closures and inventories at
10,000 objects/keys; exceeding a bound fails closed and requires capacity work.
Self-service archives remain limited to 24 MB, 10,000 rows per dataset, and 2,000
ZIP entries. Test real-volume and actual Cloudflare restore behavior in staging;
local synthetic tests do not certify those production properties.

## Provider references

- [R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/)
- [R2 Worker API and conditional operations](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/)
- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
