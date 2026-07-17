# Parish Directory Phase 2B.1 — Media Security Policy

## 1. Supported Input Types

`image/jpeg`, `image/png`, `image/webp` — unchanged from Phase 2B's `DIRECTORY_MEDIA_LIMITS.allowedMimeTypes`. Content is sniffed from real file bytes (`parsePng`/`parseJpeg`/`parseWebp` in `src/directory/media.js`, unchanged), not trusted from the client-declared MIME type; a declared/detected mismatch is rejected as `mime_spoof_denied`.

**HEIC/HEIF: not supported.** `@cf-wasm/photon`'s decoder does not reliably decode HEIC/HEIF in this evaluation, so per the brief's own fallback ("otherwise reject HEIC/HEIF with a clear controlled error"), it is rejected with `MEDIA_UNSUPPORTED_FORMAT` — `decodeAndNormalizeSource` only accepts the three types above.

**SVG, PDF, executables, archives, arbitrary binary, malformed images**: rejected, unchanged from Phase 2B's existing detection (real content sniffing finds no valid PNG/JPEG/WebP signature) plus this package's independent re-validation inside `decodeAndNormalizeSource`.

**Animated GIF**: never accepted as an input type at all (GIF was never in Phase 2B's `allowedMimeTypes`) — the "reject or flatten" question in the brief is moot for this codebase; GIF upload was already impossible before this package and remains impossible.

## 2. Output Types

WebP by default (`transformVariant`'s `outputFormat` parameter defaults to `"webp"`); JPEG available as an explicit fallback path (`get_bytes_jpeg(88)`), not currently selected by any caller but implemented and tested. PNG is not used as an output format for any variant — none of the declared avatar/household-card variants need alpha transparency, and Part 4 explicitly scopes PNG output to "where needed, such as transparency." Output MIME type is always set from the bytes actually produced by the encoder (`transformed.mimeType`), never copied from the source's declared or detected type.

## 3. Size and Dimension Limits

| Limit | Value | Enforced by |
|---|---|---|
| Max source upload bytes | 10 MB | `DIRECTORY_MEDIA_LIMITS.maxFileSizeBytes` (Phase 2B, unchanged) |
| Max source declared dimensions | 12000×12000 | `DIRECTORY_MEDIA_LIMITS.maxWidth/maxHeight` (Phase 2B, unchanged) |
| Max source declared pixel count | 36,000,000 | `DIRECTORY_MEDIA_LIMITS.maxDecodedPixels` (Phase 2B, unchanged) |
| Max source bytes accepted by the transformer itself | 10 MB | `TRANSFORM_LIMITS.maxSourceBytes` (media-transform.js — independently re-enforced, not merely inherited) |
| Max decoded pixel count accepted by the transformer | 36,000,000 | `TRANSFORM_LIMITS.maxDecodedPixels` — re-checked against the *actual* `PhotonImage.get_width()/get_height()` after decode, not the header-declared size alone (Part 10: "do not trust image headers alone where decoder validation is available") |
| Decoded-dimension sanity ceiling | 4× `maxOutputDimension` (16384px) per axis | `decodeAndNormalizeSource` — guards against a decoder reporting implausible dimensions from a crafted header |
| Max requested output dimension (per variant) | 4096px | `TRANSFORM_LIMITS.maxOutputDimension` |
| Declared variant dimensions actually used | avatar_small 96×96, avatar_medium 256×256, avatar_large 512×512, review_preview 512×512 (person) / 640×480 (household); household_card 640×480 | `PERSON_VARIANTS`/`HOUSEHOLD_VARIANTS` (`src/directory/media.js`, unchanged from Phase 2B) — all comfortably under the 4096px ceiling |

## 4. Metadata Policy

**Removed unconditionally** (structural, not field-by-field filtering — see `24-phase-2b1-secure-media-transformation-architecture.md` Section 4): GPS coordinates, device manufacturer/model, camera serial data, capture timestamp, embedded thumbnails, software identifier, user comments, copyright comments, maker notes, XMP data, IPTC data, ICC profile data, arbitrary application metadata, and the EXIF orientation tag itself (consumed to correct pixel orientation, then discarded).

**Nothing is intentionally retained.** No field from the source's metadata is copied into the output by design; Photon's decode/re-encode pipeline structurally cannot carry any of it forward regardless.

## 5. Original Retention Decision (Part 15)

**Originals are retained**, privately, in R2 (`directory_media_assets.original_object_key`, unchanged storage location and access pattern from Phase 2B — `directory/{env}/{parishId}/{ownerType}/{ownerId}/{assetId}/original_private.{ext}`). This package adds `directory_media_assets.source_retained` (default `1`) as an explicit, queryable fact rather than an implicit assumption, and reprocessing (`reprocessDirectoryMediaAsset`) reads from this exact object. Originals:
- are never served by `streamDirectoryMediaVariant` (that function only ever queries `directory_media_variants`, never `original_object_key`);
- are excluded from ordinary member-facing delivery entirely — no route in this codebase streams the original object to anyone;
- remain subject to the same private-bucket, authenticated-access-only discipline as every other directory media object (no public R2 URL, `Content-Security-Policy: default-src 'none'`, `nosniff`).

If a future retention-window policy is adopted (Part 15 flags this as a legal/policy question, not resolved here), it would set `source_retained = 0` and clear `original_object_key` — at which point `reprocessDirectoryMediaAsset` already handles that case correctly: it marks the asset `reupload_required` rather than fabricating a transformation from nothing.

## 6. Delivery Restrictions (Part 17)

`streamDirectoryMediaVariant` (`src/directory/media.js`) requires, in addition to Phase 2B's existing ownership/visibility authorization (unchanged):

```sql
SELECT * FROM directory_media_variants
WHERE media_asset_id = ?1 AND variant_type = ?2
  AND ready = 1 AND secure_transform_status = 'securely_transformed'
```

plus an application-layer check that the returned row's `pipeline_version` is in `ACCEPTED_PIPELINE_VERSIONS`. Any variant failing either condition resolves to `not_found` — identical to the response for a variant that never existed, so a client cannot distinguish "this photo failed processing" from "this photo doesn't exist" (consistent with the existing not-found-shaped error discipline already used throughout this handler for authorization failures). Original source objects, processing-pending variants, failed variants, deleted variants, and variants produced by a since-deprecated pipeline version are all structurally unreachable through this function.

## 7. Approval Gate (Part 11) — Summary

Full detail in `28-phase-2b1-security-review.md` and `27-phase-2b1-review-integration.md`. Summary: `assertMediaAssetSecurelyTransformed` (`src/directory/media.js`) is called unconditionally at the top of `approveReviewItem`'s `media_asset` branch (`src/directory/admin.js`) and throws `MEDIA_SECURE_TRANSFORMATION_REQUIRED` unless every required variant for the asset's owner type has real transformer/pipeline attestation, a valid 64-character output hash, exact expected dimensions, and `metadata_stripped = 1`. No parameter, capability, or code path bypasses this check.
