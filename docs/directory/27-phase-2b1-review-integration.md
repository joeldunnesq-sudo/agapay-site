# Parish Directory Phase 2B.1 — Phase 3A Media Review Integration

This package patches the **actual** Phase 3A review/approval services (`src/directory/admin.js`, `src/handlers/directory-admin.js`) — no separate media-review system was created, per the brief's explicit instruction.

## 1. Queue Technical Status

`queueDto`/`mediaAssetDto` (unchanged shape, Phase 3A's existing queue projection) already surfaces `protectedRecord`/`childRelated` warnings for any review item, media included. This package's `mediaAssetDto` (`src/directory/media.js`) adds, per variant:

```
{ type, width, height, ready, secureTransformStatus, transformerVersion, pipelineVersion }
```

— safe technical status only. **Never exposed**: the raw R2 object key (`r2_object_key` is deliberately excluded from every DTO returned to any caller, admin or otherwise — confirmed by the pre-existing Phase 2B test `"r2ObjectKey" in asset.variants[0]` asserting `false`, still passing), source EXIF/GPS content (never persisted anywhere after transformation, so there is nothing to expose), processing stack traces (only the controlled `processing_error_code` string is ever stored/returned), or credentials.

## 2. Reviewer Actions

**Unchanged, already correct**: reviewers may reject (`decision: "deny"`), return for correction (`decision: "return"`), or cancel — all handled by `closeReviewItem`, which this package did not modify.

**New, capability-gated (`directory.media.reprocess` or `directory.manage`)**: request reprocessing, via `requestDirectoryMediaReprocessing` (`src/directory/admin.js`) → `POST .../directory/admin/media/:assetId/reprocess`. This calls the exact same `reprocessDirectoryMediaAsset` function documented in `26-phase-2b1-legacy-media-remediation-plan.md`, then records an additional `directory.media.reviewer_requested_reprocessing` audit event distinguishing a reviewer-initiated reprocess from a routine legacy-audit-triggered one.

**Approve/activate/publish/bypass-transformation**: structurally impossible when secure transformation is incomplete — see Section 3.

## 3. Approval Prerequisites (the Hard Gate, Part 11)

`approveReviewItem`'s `media_asset` branch (`src/directory/admin.js`):

```js
if (row.source_type === "media_asset") {
  await assertMediaAssetSecurelyTransformed(env, { mediaAssetId: row.source_id, parishId: context.parishId });
  // ... only then does the UPDATE to lifecycle_status = 'approved' run
}
```

`assertMediaAssetSecurelyTransformed` (`src/directory/media.js`) requires, server-side, unconditionally:
- the asset exists, is scoped to the caller's parish, and is not `deleted`;
- `processing_status = 'securely_transformed'` **and** `pipeline_version` is in the centrally-defined accepted set;
- every variant required for the asset's owner type (person: `avatar_small`, `avatar_medium`, `avatar_large`, `review_preview`; household: `household_card`, `review_preview`) exists, has `ready = 1` and `secure_transform_status = 'securely_transformed'`, has non-empty transformer name/version and an accepted pipeline version, has a 64-character output content hash, has dimensions exactly matching its declared variant size, and has `metadata_stripped = 1`.

Any single failed condition throws `MEDIA_SECURE_TRANSFORMATION_REQUIRED` (HTTP 409, via `DirectoryServiceError`), which propagates through `decideDirectoryReviewItem` unchanged — the review-decision call simply fails, the asset's `lifecycle_status` is untouched, and no `markApproved` bookkeeping runs.

**No bypass exists** — verified by test, not merely by code inspection: `scripts/directory-media-transform-tests.mjs`'s `"an asset with a missing/corrupted variant cannot be approved"` test explicitly constructs a context with `capabilities: ["directory.manage"]` (the platform's own broadest directory capability) and confirms it hits the identical `MEDIA_SECURE_TRANSFORMATION_REQUIRED` rejection as an ordinary reviewer — there is no separate, more-permissive code path for a higher-privileged actor to fall through to.

## 4. Protected / Child / Privacy / Publication Warnings

Unchanged. This package does not touch `evaluateFieldPolicy`, `getPersonPrivacyFlags`, `getPublicationProfile`, or any privacy/publication-eligibility logic — `resolveOwnerAuthority` (`src/directory/media.js`) still gates person-photo uploads behind `child_photo_denied` for children and behind the same visibility-policy checks Phase 2B established, and the review queue's existing `protectedRecord`/`childRelated` flags are untouched. Secure transformation runs identically regardless of protected/child status; it is a technical prerequisite layered *underneath* the existing privacy/publication policy layer, not a replacement for it.

## 5. No-Bypass Policy Statement

There is no reviewer override, staff override, super-admin bypass, feature flag, or "temporary approval" mechanism anywhere in this package's code, by design. The only way a media asset's `lifecycle_status` becomes `'approved'` is through `approveReviewItem`'s `media_asset` branch, and that branch's very first statement is the unconditional gate call. Grep confirmation: `grep -n "lifecycle_status = 'approved'" src/directory/*.js` matches exactly one `UPDATE` statement in the entire codebase, and it is the one immediately following the gate.
