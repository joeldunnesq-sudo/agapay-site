# Parish Directory Phase 2B.1 — Security Review

## 1. Local-vs-Production Runtime Mismatch

**Risk**: a transformer that works in the test harness but fails (or silently behaves differently) when actually bundled/deployed to `workerd`.
**Mitigation**: `@cf-wasm/photon` declares distinct `"workerd"`/`"node"` conditional exports resolving to purpose-built entry points for each runtime (Section 2 of `24-phase-2b1-secure-media-transformation-architecture.md`), not a single build assumed to work everywhere.
**Residual risk, honestly flagged**: no live `wrangler deploy`/`wrangler dev` exercise of the `workerd` build path was performed in this session (no live Cloudflare account access available). This is the single most important item to verify before this package is considered production-ready — see the Implementation Report's Remaining Limitations.

## 2. Unsupported Native Dependencies

**Risk**: accidentally depending on `sharp` (or any native-binding library) because it happened to already be present in `node_modules`.
**Mitigation**: confirmed `sharp` is present only as a transitive dependency of `miniflare` (itself a `wrangler` devDependency, used for Cloudflare's own local Image-Resizing emulation) — never imported by any file this package or any prior package added. `@cf-wasm/photon` was deliberately chosen and added as a direct dependency specifically because it has zero native-binding requirements.

## 3. Metadata Leakage / GPS Leakage

**Risk**: EXIF/GPS surviving transformation, or leaking into logs/audit records.
**Mitigation**: structural (Section 4 of the architecture doc) — Photon's decode/re-encode never carries source metadata through, verified by a real hand-built EXIF/GPS fixture test. Audit events (`directory.media.secure_transformation_completed`, `legacy_asset_classified`, etc.) record only IDs, capability-shaped status strings, and dimension/pipeline-version metadata — never raw EXIF fields, coordinates, or object keys where avoidable (`metadata_json` payloads were reviewed field-by-field against the "do not audit" list in Part 25; none of raw image bytes, EXIF contents, GPS values, full R2 keys, signed URLs, credentials, or stack traces appear in any audit call this package added).

## 4. Fake Derivatives / Copied Originals

**Risk**: exactly Phase 2B's actual defect — an object existing under a "variant" key being treated as proof of safe processing.
**Mitigation**: `assertMediaAssetSecurelyTransformed` never checks object existence in R2 at all — it checks D1-recorded attestation fields (`transformer_name`, `transformer_version`, `pipeline_version`, `output_content_hash`, exact dimensions, `metadata_stripped`). A copied-object row with `ready = 1` but `secure_transform_status = 'unverified'` (the migration's own backfill default for every pre-existing Phase 2B variant) fails the gate — verified directly by test (`"client-supplied attestation-shaped fields cannot forge secure status"`).

## 5. CSS-Only Resizing

**Risk**: N/A to this codebase's architecture — there is no client-side resizing anywhere in the directory media flow; `PERSON_VARIANTS`/`HOUSEHOLD_VARIANTS` were always server-declared target dimensions, and this package's `transformVariant` re-verifies `resized.get_width()/get_height()` against the declared target after every resize call, failing closed on mismatch.

## 6. Decompression Bombs

**Risk**: a small compressed file that decodes to an enormous pixel buffer.
**Mitigation**: `decodeAndNormalizeSource` checks `PhotonImage.get_width()/get_height()` (the actual decoded dimensions, not the compressed byte size or the header-declared size) against `TRANSFORM_LIMITS.maxDecodedPixels` (36,000,000) and a decoded-dimension sanity ceiling, immediately after decode and before any further processing. Phase 2B's own upload-time validation (`validateDirectoryImageUpload`) already checked header-declared dimensions; this package adds an **independent, post-decode** re-check specifically because a crafted header could in principle misreport size.

## 7. Malformed Images

**Risk**: a crafted file that passes header sniffing but fails or misbehaves during real decode.
**Mitigation**: `PhotonImage.new_from_byteslice()` is wrapped in `try/catch`, throwing the controlled `MEDIA_DECODE_FAILED` on any decode failure — no internal error detail or stack trace is exposed to the caller (`DirectoryServiceError`'s message is a fixed, safe string).

## 8. Stale Jobs

**Risk**: an in-flight reprocessing job overwriting a newer candidate, or a deleted candidate becoming active.
**Mitigation**: `reprocessDirectoryMediaAsset` operates synchronously within a single request (no background-job architecture was introduced by this package — see `26-phase-2b1-legacy-media-remediation-plan.md` Section 7), so there is no concurrent-job race to protect against in the current implementation. It explicitly refuses to reprocess a `deleted` asset. **Residual risk**: if a future package adds queue-driven concurrent reprocessing, it will need its own concurrency guard (an `expectedVersion`-style optimistic-lock check, matching the pattern already used elsewhere in this codebase's admin services) — not built here because no concurrent execution path exists yet to protect against.

## 9. Cache Leakage

**Risk**: a private variant served with a cacheable response reaching a shared cache.
**Mitigation**: unchanged from Phase 2B — `streamDirectoryMediaVariant` sets `Cache-Control: private, no-store` for `visibility: 'private'` assets and `private, max-age=300` otherwise (never a shared/public cache directive), plus `Content-Security-Policy: default-src 'none'` and `X-Content-Type-Options: nosniff`. This package added a stricter WHERE clause to the same response path without touching these headers.

## 10. Legacy Approval / Reviewer Bypass

**Risk**: a previously-approved-under-Phase-2B photo remaining approved and servable despite never having been really transformed.
**Mitigation**: the `0028` migration force-resets every existing variant to `ready = 0`, `secure_transform_status = 'unverified'` at migration time — a previously-approved asset's `lifecycle_status` row itself is untouched (still says `'approved'`), but every one of its variants immediately fails the delivery gate (`ready = 1 AND secure_transform_status = 'securely_transformed'`), so **it stops being servable the moment this migration applies**, before any explicit audit/reprocessing action is taken. This is deliberately fail-closed: a previously-"approved" photo goes dark (not deliverable) rather than continuing to serve untransformed bytes, until it is reprocessed. See Section 10 of the migration report for the explicit tradeoff this represents.

## 11. Cross-Parish Access

**Risk**: a reviewer or reprocessing caller reaching another parish's media.
**Mitigation**: unchanged, pre-existing pattern reused correctly — `assertMediaAssetSecurelyTransformed` and `reprocessDirectoryMediaAsset` both take `parishId`/`context.parishId` as a hard `WHERE` clause parameter in their initial row lookup (not a post-hoc filter), and every new admin route (`legacy-audit`, `:assetId/reprocess`) is scoped through `resolveDirectoryAdminContext(env, { request, parishId })`, which resolves the caller's parish membership server-side from their session — never from a client-supplied parish ID used as authorization.

## 12. Protected-Person / Child Exposure

**Risk**: secure transformation accidentally broadening visibility for a protected or child record.
**Mitigation**: this package never touches `evaluateFieldPolicy`/`getPersonPrivacyFlags`/`getPublicationProfile`. `resolveOwnerAuthority`'s `child_photo_denied` gate (Phase 2B, unchanged) still runs before any upload session can even be created for a child person. Reprocessing operates purely on already-existing assets' pixel data and never re-evaluates or changes `visibility`/`publication_eligible` — confirmed by reading `reprocessDirectoryMediaAsset`'s statements, none of which touch those columns.

## 13. R2 Orphaning

**Risk**: a failed or partial transformation leaving orphaned R2 objects with no D1 record.
**Mitigation**: in `completeDirectoryMediaUpload`, all `transformVariant` calls happen **before** any `putObject` call — a mid-pipeline failure throws before any R2 write occurs for that upload at all. In `reprocessDirectoryMediaAsset`, new variant objects are written, then the D1 batch commits, then (only after commit) old objects are deleted — a failure between "new objects written" and "D1 commit" would leave new objects in R2 not yet referenced by D1, which `cleanupDirectoryMediaObjects`'s existing terminal-lifecycle-status query would not currently catch (it queries by asset lifecycle status, and the asset row itself wouldn't be in a terminal state). **Flagged as a residual, low-probability gap**: a future hardening pass could add an orphan-object reconciliation sweep (comparing R2 listing against D1 `r2_object_key` references) — not built in this package, consistent with Part 26's acknowledgment that full orphan-detection tooling is a further-out concern.

## 14. Denial-of-Service Risk

**Risk**: image processing itself becoming a CPU/memory exhaustion vector.
**Mitigation**: Section 6 (decompression bombs) plus dimension/pixel-count limits bound the work any single transformation can do; variant target sizes are fixed, small constants (max 640×480) controlled by this codebase, never client-supplied; there is no unbounded loop or retry anywhere in the synchronous pipeline. **Not measured in this session**: actual Worker CPU-time consumption for a worst-case (10 MB, near-pixel-limit) image under real `workerd` constraints — flagged as an open verification item for before this ships to real traffic, alongside the runtime-mismatch item in Section 1.

## 15. Entitlement (Mission vs. Parish)

Confirmed by code inspection and by a direct test (`"Mission and Parish tiers receive identical secure-transformation behavior"`): no function in `media-transform.js` or the transformation call path in `media.js` accepts, reads, or branches on a subscription tier, entitlement flag, or plan identifier. There is structurally nothing to tier-gate.
