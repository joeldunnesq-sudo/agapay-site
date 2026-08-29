# Parish data portability and closure

Status: policy direction approved, August 28, 2026. An initial implementation now
exists locally behind disabled release flags. It is not ready for production
parish-wide erasure. See [implementation status](implementation-status.md) for the
implemented paths, tested boundaries, and remaining adapters. The workflow below
describes the production requirements, not a claim that every gate is complete.

## Requested outcome

A parish can cancel its service, take a usable copy of its data, and have AGAPAY
automatically remove the parish's data after the copy has been received.

Cancellation must remain available independently of export success. Export access
must not require buying or renewing a subscription. An ordinary backup download
must not silently close a parish. Offer two clearly separate actions:

- **Download parish data:** export without deletion.
- **Export and close parish:** explicitly authorize closure, prepare the final
  export, confirm receipt, and automatically execute the approved deletion scope.

## Approved policy direction

The user approved immediate removal from active AGAPAY systems after receipt
confirmation, with a disclosed backup-expiration period and narrowly defined
retention exceptions. Ordinary exports remain non-destructive.

Erasure of every historical copy at the moment of download cannot be promised with
the current storage design. Exact retained categories and enforceable backup expiry
still require implementation and policy review before public launch.
Do not assume that a parish's recordkeeping responsibilities automatically require
AGAPAY to keep its own copy for the same period.

Repository findings that need resolution:

| Finding | Evidence | Consequence |
| --- | --- | --- |
| Cancellation opens Stripe's subscription cancellation portal | `src/handlers/parish.js`, `handleParishSubscriptionPortal` | A return URL is not proof of cancellation. Verify billing state independently; cancellation is not deletion authorization. |
| Published policy states financial records are retained for at least seven years and organization data for the relationship plus seven years | `public/privacy.html`, section 08 | Review and version the policy before offering a conflicting erasure promise. These are current product statements, not a determination that those periods are legally necessary. |
| Legal acceptance evidence cannot be deleted or updated through normal SQL | `migrations/0088_legal_acceptances.sql` | Resolve retention and the authorized disposal mechanism; do not disable audit triggers in an ordinary web request. |
| Accounting has active legal holds, configurable retention classifications, and immutable ledger/close records | `src/accounting/close/service.js`, `accounting-migrations/0002_core_ledger.sql`, `accounting-migrations/0011_phase3d_closing_and_audit.sql` | Evaluate holds and approved retention before each destructive phase. Existing archival is not an erasure implementation. |
| Central D1 backups contain multiple parishes | `.github/workflows/production-d1-backup.yml` | A parish cannot receive the platform SQL dump. Deleting a shared backup indiscriminately affects recovery for other parishes. |
| Backup retention is configured for 365 days; the sweep preserves the newest object if all objects are expired | `wrangler.toml`, `src/accounting/backup-retention.js` | This is not a guaranteed final deletion deadline. Closure requires an explicit backup policy and verification, including when new backups stop. |
| Some identities and household/person relationships span parishes | `migrations/0020_platform_identity.sql`, `migrations/0022_directory_canonical_foundation.sql` | Export only authorized parish data; do not delete another parish's data or a donor's independent account. |

Cloudflare D1 Time Travel is always on for production-backend databases and retains
history for up to 30 days on Workers Paid or seven days on Free. Deleting live rows
therefore does not establish that their historical copies have been removed. The
actual account configuration and provider disposal behavior still need verification.
See [Cloudflare Time Travel documentation](https://developers.cloudflare.com/d1/reference/time-travel/).

## Storage inventory to cover

This is a storage/domain inventory, not a completed table-by-table ownership map.
Every table, JSON field, object prefix, and background writer must be classified
before automatic purge can be enabled. Unknown ownership blocks the operation.

| Store or domain | Export requirement | Closure requirement |
| --- | --- | --- |
| Shared `AGAPAY_DB` | Explicit parish selectors for registrations, giving, stewardship, commerce, sacraments, directory, ministries, communications, and other parish-owned records; child tables require ownership joins | Delete only classified parish rows in foreign-key order; sanitize shared JSON records by explicit field ownership, never by a broad text match |
| Directory imports | Include imported contact data and useful import results; exclude claim secrets and authentication material | Remove batch payloads and rows, suspend processing and pending invitations, and remove orphaned parish-owned records without deleting shared identities |
| Separate accounting databases | Resolve the authorized parish through the accounting gateway and control plane; include books, transaction detail, configuration, supporting documents, and audit exports permitted for the recipient | Validate database-to-parish binding; apply holds/retention policy; no arbitrary database identifiers accepted from the browser |
| `AGAPAY_REGISTRATIONS` KV | Classify legacy copies and indexes using their actual key formats and payload ownership | Remove stale copies and indexes; prevent KV fallback from restoring deleted records |
| `CAMPAIGN_ASSETS`, `ANNOUNCEMENT_ASSETS`, `TEACHING_ASSETS` | Include original parish files and metadata, not just URLs | Delete classified objects and derived variants; invalidate cached public copies where applicable |
| `GROUP_MESSAGE_ASSETS`, `PARISH_LIBRARY_ASSETS` | Include authorized attachments and library files | These bindings share a bucket. Use exact owned keys/prefixes, never delete the whole bucket |
| `DIRECTORY_MEDIA` | Include photos and permitted source files with manifest references | Cover originals and transformed variants, not just the visible photo |
| `TAX_EXEMPTION_DOCS`, `NONPROFIT_PRICING_DOCS`, `GIVING_STATEMENTS` | Include parish-authorized documents; do not expose another donor's independent records | Apply the approved retention classification to each category |
| `ACCOUNTING_ATTACHMENTS`, `ACCOUNTING_BACKUPS` | Include parish supporting documents; never include mixed-parish platform backups | Handle parish backups and shared platform backups separately; maintain explicit expiry evidence |
| Cloudflare Stream and external content | Inventory uploaded video and identify linked external material; export owned media where supported | Revoke AGAPAY access and remove AGAPAY-owned media through the correct provider API; external links do not grant deletion authority |
| Stripe and email providers | Provide relevant parish transaction references and delivery metadata where authorized; do not export credentials | Do not promise erasure of independently retained processor records or previously delivered email; document provider responsibilities |
| Logs, caches, offline/browser copies, support records | Classify by ownership, recipient authorization, and retention | Purge controllable caches and access; disclose systems and recipients outside AGAPAY's deletion control |

No passwords, password hashes, sessions, passkey credentials, reset/claim tokens,
API secrets, or third-party OAuth credentials belong in the portability package.
Personal donor accounts and parent-owned Learn records are not automatically parish
property. A link to a parish alone is insufficient authority to export or erase them.

## Export package

Produce a private ZIP containing UTF-8 CSV files for tabular data, JSON for structured
records, original attachments, a README/data dictionary, and a versioned manifest.
Use stable identifiers to preserve relationships and record UTC timestamps, currency
codes, and amounts in documented units. Preserve exact raw values in JSON and make
spreadsheet-facing CSV safe against formula execution.

The manifest must contain the parish identifier, schema/export version, snapshot
boundary, included domains, file byte lengths, SHA-256 checksums, row counts, and
explicit omissions/retained categories with reasons. A missing module, failed page,
missing attachment, or unknown selector must not be reported as an empty dataset.

Build large archives through durable, resumable jobs into private storage. Enforce
bounded memory and pagination. Do not assemble all parish data in one Worker request
or rely on browser polling to keep the job alive. Protect download and status routes
with tenant authorization and `Cache-Control: private, no-store`; expire download
authorization and temporary export objects according to an approved policy.

## Receipt and automatic deletion

A download click, HTTP 200, completed server stream, or browser Blob does not prove
the parish saved a usable file. The interface must say this plainly.

Recommended flow:

1. An authorized parish owner reauthenticates with MFA, reviews the export/deletion
   scope and retention exceptions, and explicitly selects **Export and close**.
2. Establish a write barrier for that parish and drain in-flight work. Account for
   imports, webhooks, scheduled jobs, accounting queues, and external changes that
   can arrive after the snapshot. Final financial activity must be settled or
   explicitly handled before claiming the final export is complete.
3. Build and validate the export. Failure leaves the source data intact. Allow
   cancellation of the closure before receipt/deletion, with a deliberate release
   of the write barrier.
4. Let the parish download and open the package. Offer a local file verification
   step that checks the downloaded archive hash against the server manifest without
   uploading its contents. The owner then confirms **I saved my export. Close this
   parish and delete the listed data.** A GET/download route must never delete data.
5. Bind that confirmation to the exact parish, owner, export ID, manifest hash,
   policy version, and closure request. Reject stale, expired, duplicate-in-flight,
   cross-parish, or changed-scope requests. Check active holds again.
6. Queue deletion automatically after this confirmation. The job runs independently
   of the browser, with persisted checkpoints, scoped leases, idempotent operations,
   retries, and explicit intervention for unresolved failures.
7. Verify deletion across every adapter, remove the temporary export and derivative
   files, revoke parish access/invitations, and issue a receipt identifying completed
   deletion, retained categories, and any backup expiry still pending.

There is no unrequested recovery delay in this proposal after the final confirmation.
Before confirmation, the parish still has its source data. After deletion begins,
do not offer a misleading cancel/undo button.

## Job state and operational safeguards

Proposed sequence:

`requested -> preparing -> ready -> receipt_confirmed -> deleting -> active_data_deleted -> completed`

Use explicit failure/hold states such as `export_failed`, `blocked`, and
`deletion_failed`. A restart resumes from persisted verified steps. An adapter error
must not be swallowed, converted into success, or treated as proof that no data exists.
`completed` is allowed only when the approved scope and any promised backup expiry
are verified; `active_data_deleted` must clearly disclose retained copies.

Keep only the minimum approved closure receipt and suppression record. Define its
retention explicitly; it is still retained data. Store enough durable closure state
to stop stale webhooks, KV fallback, retries, or disaster recovery from resurrecting
the parish. Restore procedures must replay the current deletion/suppression record
before restored systems serve traffic. That record must not be rolled back with
the same backup it is meant to constrain.

KV is eventually consistent, so it cannot be the only authoritative closure barrier.
See [Cloudflare KV consistency documentation](https://developers.cloudflare.com/kv/concepts/how-kv-works/).

Never disable foreign keys or immutable-history triggers globally to make a purge
pass. Any approved disposal of immutable or retained records needs its own narrow,
audited mechanism. Do not destroy a shared database, namespace, bucket, or backup to
remove one parish.

## Implementation and release gates

1. Approve the active-data versus all-copies meaning, retained categories, backup
   expiry, export expiry, and receipt retention. Reconcile and version public policy.
2. Complete the table/JSON/object ownership registry, including orphan handling and
   shared-person redaction. Add coverage checks so new schema/storage cannot silently
   bypass export or purge.
3. Implement and test non-destructive export first, including authenticated access
   after subscription cancellation. Verify round-trip imports in an isolated fixture.
4. Add durable closure state, MFA authorization, write barriers, receipt confirmation,
   and scoped purge adapters behind a disabled release flag.
5. Test two parishes sharing a donor/person: the selected parish export must exclude
   the other's private fields; deletion must preserve the other's data and login.
6. Test dropped downloads, invalid checksums, failed attachments, schema drift,
   missing bindings, revoked owner access, changed holds, and wrong-parish requests.
   Each must prevent destructive progress.
7. Test restart mid-purge, concurrent workers, repeat confirmation, late Stripe
   events, resumed imports, stale KV, duplicate object listings, and interrupted
   provider calls. Verify no deleted data is recreated and no step is skipped.
8. Run a backup restore drill that reapplies closure suppression before access.
   Verify actual backup expiry and the final receipt; do not infer it from a timer.
9. Enable only after a staging end-to-end export, verified receipt, purge, and
   cross-parish isolation check. No production parish data should be used in tests.

This audit did not access production databases, cancel any subscription, change
retention settings, or delete any data. The directory-import work already in the
working tree is unchanged.
