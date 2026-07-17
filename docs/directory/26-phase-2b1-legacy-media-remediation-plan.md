# Parish Directory Phase 2B.1 — Legacy Media Remediation Plan

## 1. How Legacy Assets Are Identified

`auditDirectoryMediaLegacyAssets(env, { parishId })` (`src/directory/media.js`) enumerates every `directory_media_assets` row for a parish and classifies each via `classifyMediaAssetRow`, into one of:

| Classification | Meaning |
|---|---|
| `securely_transformed_by_new_pipeline` | `processing_status = 'securely_transformed'`, `pipeline_version` is accepted, and every required variant has `ready=1`, `secure_transform_status='securely_transformed'`, an accepted pipeline version, a real output hash, and exact expected dimensions |
| `legacy_unverified` | Everything else that isn't one of the categories below — the default, fail-closed bucket |
| `reprocessing_required` | Already explicitly marked (by this audit or a prior run) as needing reprocessing |
| `source_unavailable` | `source_retained = 0` and no `original_object_key` |
| `processing_failed` | `processing_status = 'failed'` |
| `deleted` | `lifecycle_status = 'deleted'` |
| `safe_to_ignore` | `lifecycle_status IN ('replaced', 'rejected')` — never the active/candidate photo, no remediation value |

**No classification ever infers "secure" from Phase 2B's old `ready`/`processing_status='ready'` flags.** The `0028_directory_media_secure_transformation.sql` migration itself already reclassifies every pre-existing `processing_status = 'ready'` row to `reprocessing_required` at migration time (a one-time backfill), and force-resets every existing variant's `ready` column to `0` alongside `secure_transform_status = 'unverified'` — so even without ever running the audit function, no pre-2B.1 asset can pass the approval or delivery gate. The audit function's job is the *ongoing*, idempotent classification pass (Part 13), not the one-time backfill (which the migration itself already performs).

## 2. Report Shape (Part 13)

`auditDirectoryMediaLegacyAssets` returns:
```
{
  totalAssets,
  countsByParishOwnerClassificationStatus: { "<parishId>:<ownerType>:<classification>:<lifecycleStatus>": count, ... },
  actionable: [{ mediaAssetId, parishId, classification }, ...],
  classifications: [ ...the seven values above ]
}
```
No private user data (names, emails, image content) appears anywhere in this report — only IDs, counts, and status strings, consistent with "do not expose private user data in logs." The route exposing this (`GET .../directory/admin/media/legacy-audit`) requires `directory.media.reprocess`, `directory.publication.review`, or `directory.manage` and is hard-scoped to the caller's own parish (`context.parishId`) — there is no platform-wide variant reachable from any route.

## 3. Reprocessing Behavior (Part 14)

`reprocessDirectoryMediaAsset(env, { context, mediaAssetId })`:
1. Loads the asset scoped to `context.parishId` (cross-parish access structurally impossible — the `WHERE parish_id = ?2` clause is part of the lookup itself, not a post-hoc check).
2. Refuses if `lifecycle_status = 'deleted'`.
3. If no retained source (`source_retained = 0` or no `original_object_key`): marks `reupload_required = 1`, audits `directory.media.reupload_required`, returns `{ reuploadRequired: true }` — **never fabricates a transformation from nothing.**
4. Otherwise: marks `processing_status = 'processing'`, audits `legacy_reprocessing_started`, fetches the real original object from R2, re-validates and re-decodes it through the exact same `decodeAndNormalizeSource`/`transformVariant` pipeline used for new uploads (no separate "legacy" code path to drift out of sync).
5. On any transformation failure: marks `processing_status = 'failed'` with the controlled error code, audits `legacy_reprocessing_failed`, re-throws — the asset's prior state (including any previously-approved lifecycle status) is otherwise untouched.
6. On success: writes new variant objects at **versioned keys** (`{variantType}_{pipelineVersion}_{timestamp}`, distinct from the original upload's keys — Part 16), updates each variant row's dimensions/hash/attestation fields in one atomic D1 batch, updates the asset's `processing_status = 'securely_transformed'` and `pipeline_version`, and only *after* that batch commits, deletes the old (unverified) variant objects from R2 — cleanup never races ahead of the new variants being committed and referenced.

## 4. Approval Continuity for Previously-Approved Photos

**Policy chosen: conservative, not silently-preserved.** Phase 2B never persisted the crop rectangle a household/person applied at upload time (`directory_media_assets` has no crop-coordinate columns) — only the final (uncropped, since Phase 2B never really cropped anything) byte copy exists. This means reprocessing cannot prove the visible output of a legacy approved photo is unchanged from what a reviewer actually approved.

Per the brief's own fallback ("if crop or visible output materially changes, require reviewer confirmation"), `reprocessDirectoryMediaAsset` **returns any previously-`approved` asset to `pending_approval`** rather than silently keeping it `approved` — the safe default when equivalence can't be proven, not an assumption that it's fine. This is recorded explicitly: a `directory.review_item.reprocessing_returned_to_review` audit event is written alongside the reprocessing-completed event, with `reason: "legacy_reprocessing_crop_not_provable"`, so a reviewer (and a future auditor of the audit log) can see exactly why a previously-approved photo reappeared in the queue.

**Assets that were not yet approved** (`ready`, `pending_approval`, `rejected`) keep their existing `lifecycle_status` after reprocessing — only their technical `processing_status` changes; they still need to go through ordinary review exactly as before.

## 5. Reupload-Required Behavior

An asset marked `reupload_required = 1` (via either the audit sweep or a reprocessing attempt with no retained source) is:
- excluded from the approval gate (a `source_unavailable`-classified asset was never `securely_transformed` and cannot pass `assertMediaAssetSecurelyTransformed`);
- excluded from ordinary delivery (no variant of it ever reaches `secure_transform_status = 'securely_transformed'`);
- surfaced in `mediaAssetDto`'s `reuploadRequired` field for any future UI that wants to prompt the owner. **No owner-notification mechanism was built in this package** (out of scope — this package builds the data model and the audit trail, not a notification workflow; `directory_notification_events` already exists from Phase 3A and would be the natural mechanism for a future package to use).

## 6. Cleanup

`cleanupDirectoryMediaObjects` (Phase 2B, unchanged in this package) removes R2 objects belonging only to assets whose `lifecycle_status IN ('deleted', 'replaced', 'failed')` — structurally incapable of touching an active/candidate/approved asset's variants, since those lifecycle states are never assigned to the currently-referenced photo. `reprocessDirectoryMediaAsset`'s own old-object cleanup (Section 3, step 6) is sequenced strictly after the new variants are committed, per Part 16's "schedule old derivative cleanup only after the new secure variants are committed and referenced."

## 7. Explicitly Deferred

- **Scheduling the audit/reprocessing sweep automatically** (cron or queue-driven) — Phase 0.75 selected Cloudflare Queues/Cron as the eventual background-processing primitive for this kind of work but never built one; this package makes `auditDirectoryMediaLegacyAssets`/`reprocessDirectoryMediaAsset` safely callable on demand (via the new admin routes) rather than inventing scheduling infrastructure that doesn't exist elsewhere in this codebase yet.
- **Bulk/batch reprocessing across many assets in one call** — each reprocessing call is single-asset, parish-scoped, and capability-checked; a future package building real queue-driven fan-out can call this same function per message without needing to change it.
- **Owner-facing reupload-required notification UI** — see Section 5.
