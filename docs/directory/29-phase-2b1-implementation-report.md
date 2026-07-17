# Parish Directory Phase 2B.1 — Implementation Report

## 1. Executive Summary

Phase 2B's media pipeline validated uploads and built a correct schema/authorization model, but never actually transformed images: every "variant" object was a byte-identical copy of the original upload, with `processing_status`/`ready` hardcoded to signal success unconditionally. This package replaces that with a real, verified, Worker-compatible transformation pipeline (`@cf-wasm/photon`) that decodes, orientation-normalizes, crops, resizes, and re-encodes every declared variant from actual pixel data — structurally stripping all EXIF/GPS/device metadata in the process — and hardens the existing Phase 3A approval/delivery paths so that no untransformed, copied, or attestation-less media can ever be approved or served, with no bypass of any kind.

## 2. Completion Verdict

**Complete for the core security objective this package exists to close.** All 12 primary objectives, the approval hard gate, the secure delivery patch, and the legacy audit/reprocessing mechanism are implemented and verified by 17 new automated tests plus the full pre-existing regression suite (259 total assertions across the repository, exit code 0). Two items are honestly flagged as unverified rather than claimed complete: an actual live-`workerd` deployment exercise, and measured CPU-time behavior under worst-case load (Section 39).

## 3. Known Limitation Resolved

Phase 2B's `completeDirectoryMediaUpload` copied the original upload's bytes to every declared variant's R2 key (`src/directory/media.js`, pre-existing code: `for (const variant of variantRows) await putObject(env, variant.key, arrayBuffer, validation.mimeType);`) and hardcoded `processing_status`/`ready` to success values regardless of what actually happened. No EXIF/GPS stripping, no real resizing, no crop application ever occurred. This is now replaced end-to-end (Section 7).

## 4. Repository Findings (Required Inspection, Summary)

- **Media schema**: `migrations/0026_directory_media_phase2b.sql` — `directory_media_assets`, `directory_media_variants`, `directory_media_upload_sessions`, `directory_media_assignments`. Fully normalized, R2-key-referencing, no image bytes in D1 — a solid foundation to build attestation columns onto.
- **Processing status**: existed (`pending`/`processing`/`ready`/`failed`) but was never anything but a label — `ready` meant "the upload request completed," not "was securely transformed."
- **Delivery**: `streamDirectoryMediaVariant` already had correct ownership/visibility authorization and correct security headers (private cache-control, CSP, nosniff) — the gap was purely "which variant rows are eligible," not the authorization/header discipline around them.
- **Phase 3A review/approval**: `src/directory/admin.js`'s `approveReviewItem` already had a `media_asset` branch (added by the concurrent Phase 3A package, itself uncommitted at the time this package began) that flipped `lifecycle_status` to `'approved'` with **zero technical precondition** — exactly the gap Part 11 requires closing.
- **Deployment environment**: `wrangler.toml` (`compatibility_flags = ["nodejs_compat"]`, ES-module Worker, `main = "src/worker.js"`), no existing image-processing dependency, no Cloudflare Images/Image Resizing binding or reference anywhere in the repository. `sharp` present only as a `miniflare` (wrangler devDependency) transitive dependency — confirmed never imported by any Worker-reachable source file.

## 5. Transformer Selected

`@cf-wasm/photon` (npm, pinned `^0.3.7`, actual resolved version `0.3.7`) — a WASM build of the Rust `photon` image library, published with explicit `workerd`/`node`/`edge-light` conditional exports.

## 6. Why It Is Worker-Compatible

No native binary/addon; the WASM module is either inlined (Node build, synchronous init at import time) or imported as a genuine `.wasm` module (`workerd` build, resolved automatically by Wrangler's ES-module bundler). Verified in this session by direct execution (standalone smoke check, then full test-suite integration) using the `node` conditional export — the same import statement Wrangler will resolve to the `workerd` export at deploy time. Full detail: `24-phase-2b1-secure-media-transformation-architecture.md`.

## 7. Package and Deployment Changes

- `package.json`: `@cf-wasm/photon` added to `dependencies`; `directory-media-transform-tests.mjs` appended to the `check` script.
- `wrangler.toml`: **no changes** — no new binding required (photon is a pure npm/WASM dependency, not a Cloudflare service); no `[[rules]]` block needed for the standard ES-module `.wasm` import pattern.
- No new Cloudflare resource of any kind was created or requested.

## 8. Migration Summary

One new migration: `migrations/0028_directory_media_secure_transformation.sql`.
- `directory_media_assets` rebuilt (SQLite CHECK-constraint change requires create/copy/drop/rename, not `ALTER`) to widen `processing_status` to `pending | source_validated | processing | securely_transformed | reprocessing_required | failed` (removing `ready` as a valid value entirely) and add `source_retained`, `reupload_required`, `processing_attempt_count`, `pipeline_version`. Every pre-existing row is copied with **zero data loss**; every pre-existing `processing_status = 'ready'` row is explicitly reclassified to `reprocessing_required` (never silently trusted as secure).
- `directory_media_variants` gains nine additive columns (`secure_transform_status`, `transformer_name`, `transformer_version`, `pipeline_version`, `secure_transformed_at`, `orientation_normalized`, `crop_applied`, `metadata_stripped`, `output_content_hash`, `verified_at`) via `ALTER TABLE ... ADD COLUMN` (no rebuild needed — no CHECK constraint change on these). Every pre-existing variant row's `ready` is force-reset to `0` and `secure_transform_status` to `'unverified'`.
- No raw metadata, GPS coordinates, EXIF payloads, image bytes, base64 images, credentials, or signed URLs are stored anywhere in this schema — only hashes, dimensions, boolean attestation flags, and version strings.

## 9. Technical Status Model

`processing_status` (technical) is fully separate from `lifecycle_status` (editorial/publication — unchanged Phase 2B column). An asset can be, simultaneously and independently: technically `securely_transformed` but editorially `pending_approval`; editorially `approved` but (after a pipeline-version deprecation) no longer passing the delivery gate; `rejected` regardless of technical status. No code path collapses the two.

## 10. Pipeline Version

`PIPELINE_VERSION = "directory-media-v1"`, `ACCEPTED_PIPELINE_VERSIONS = ["directory-media-v1"]` — single source of truth in `src/directory/media-transform.js`, consulted by every approval-gate and delivery-gate check via `isAcceptedPipelineVersion()`.

## 11. Input Formats

JPEG, PNG, WebP. HEIC/HEIF rejected (`MEDIA_UNSUPPORTED_FORMAT`) — not reliably decodable by the selected transformer in this evaluation. SVG/PDF/executables/archives/malformed images rejected (pre-existing Phase 2B detection, independently re-verified at the transform layer). Animated GIF was never an accepted input type in this codebase and remains so.

## 12. Output Formats

WebP (default), JPEG (implemented fallback path, `get_bytes_jpeg(88)`, not currently selected by any caller). PNG not used as an output format (no variant needs transparency).

## 13. Size and Dimension Limits

10 MB max source (re-enforced independently at the transform layer, not merely inherited from upload-time validation); 4096px max requested output dimension per axis; see `25-phase-2b1-media-security-policy.md` Section 3 for the full table.

## 14. Decoded-Pixel Limit

36,000,000 pixels, checked against the **actual decoded** `PhotonImage` dimensions (not header-declared size), immediately post-decode, before crop/resize.

## 15. Resize Behavior

Real `resize()` call (Lanczos3 filter) to the variant's exact declared target dimensions; output width/height re-verified against the target post-resize, failing closed on any mismatch. Verified by test that output is never byte-identical to the (larger) source and that a real, different hash is produced per variant.

## 16. Crop Behavior

Crop coordinates re-validated against the actual decoded (post-orientation-normalization) source dimensions — never trusted from the client. Out-of-bounds, negative, or non-finite crop values are rejected (`MEDIA_TRANSFORMATION_FAILED`) before any pixel operation runs.

## 17. Orientation Behavior

JPEG EXIF Orientation tag (values 1–8) read by a hand-written, minimal IFD0 parser (reads only that one tag — no other EXIF field is ever parsed) and applied as the equivalent `rotate()`/`fliph()`/`flipv()` sequence **before** crop/resize. Output never depends on the EXIF tag again. Verified for all 8 orientation values by test.

## 18. Metadata-Removal Behavior

Structural, not filtered: Photon's decode/re-encode never carries any source metadata segment into the output (Section 4 of the architecture doc). Verified against a real, hand-constructed EXIF segment containing GPS coordinates (37°46'30"N), device Make ("Canon") and Model ("EOS R5"), and Orientation (6) — none of these byte sequences, nor the literal string "Exif", appear anywhere in the transformed output.

## 19. Verification Behavior

Every transformation stage fails closed (throws a controlled `DirectoryServiceError` code) rather than returning a partial result; `completeDirectoryMediaUpload` performs all per-variant transformation **before** any R2/D1 write, so a failure anywhere leaves zero trace of that upload attempt.

## 20. Secure Attestation

Per variant: `transformer_name` ("@cf-wasm/photon"), `transformer_version` ("0.3.7"), `pipeline_version` ("directory-media-v1"), `secure_transformed_at`, `orientation_normalized`, `crop_applied`, `metadata_stripped`, `output_content_hash` (SHA-256 of the actual output bytes). All server-computed; no client input reaches any of these fields under any code path (confirmed: `completeDirectoryMediaUpload`'s only client-influenced inputs are the raw file bytes and optional crop rectangle — everything in the attestation set is derived server-side from the transformation's own output).

## 21. Approval Hard Gate

`assertMediaAssetSecurelyTransformed` (`src/directory/media.js`), called unconditionally as the first statement of `approveReviewItem`'s `media_asset` branch (`src/directory/admin.js`). Throws `MEDIA_SECURE_TRANSFORMATION_REQUIRED` (409) unless every required variant has full, valid attestation. No reviewer, staff, or platform-admin override exists — verified by test using a `directory.manage`-capability context.

## 22. Phase 3A Integration

Patched the actual Phase 3A services (`src/directory/admin.js`, `src/handlers/directory-admin.js`) — no separate media-review system created. Two new admin functions (`getDirectoryMediaLegacyAudit`, `requestDirectoryMediaReprocessing`) and two new routes (`GET .../directory/admin/media/legacy-audit`, `POST .../directory/admin/media/:assetId/reprocess`) added to the existing admin route dispatcher. Full detail: `27-phase-2b1-review-integration.md`.

## 23. Existing-Media Audit

`auditDirectoryMediaLegacyAssets` — idempotent, parish-scoped classification into 7 categories, zero private data in its report (Section 2 of the remediation plan). The `0028` migration itself also performs a one-time backfill reclassification independent of this function ever running.

## 24. Legacy Reprocessing

`reprocessDirectoryMediaAsset` — loads the retained private original, re-validates, re-runs the identical transformation pipeline used for new uploads, writes versioned variant keys, updates attestation transactionally, cleans up old objects only after the new ones are committed. Previously-approved assets are conservatively returned to `pending_approval` (crop equivalence cannot be proven — see remediation plan Section 4) rather than silently kept approved.

## 25. Reupload-Required Behavior

Assets with no retained source are marked `reupload_required = 1` and structurally excluded from both approval and delivery — never given fabricated attestation.

## 26. Original Retention Decision

Retained (Phase 2B's existing behavior, now made explicit via `source_retained`), private, never delivered by any route, used exclusively as the reprocessing source.

## 27. Delivery Changes

`streamDirectoryMediaVariant` now additionally requires `secure_transform_status = 'securely_transformed'` and an accepted `pipeline_version`, in addition to Phase 2B's existing ownership/visibility/`ready` checks. Verified by test that an unverified or deprecated-pipeline-version variant returns `not_found`.

## 28. Cleanup Changes

None to `cleanupDirectoryMediaObjects` itself (already correctly scoped to terminal-lifecycle-status assets). `reprocessDirectoryMediaAsset` adds its own strictly-sequenced old-object cleanup (after new variants commit).

## 29. Capabilities Added or Reused

New: `directory.media.reprocess` (`src/directory/shared.js`'s `DIRECTORY_CAPABILITIES`), narrow and operational, distinct from `directory.publication.review` (editorial decisions). Reused: `directory.publication.review`, `directory.manage` (both already authorize the legacy-audit read path as alternatives). No capability, including `directory.manage`, bypasses the approval gate — the gate is not a capability check at all, it's a technical-precondition check that runs regardless of who's calling.

## 30. Entitlement Behavior

No tier gate anywhere in the transformation, approval, or delivery path — confirmed by direct test and by the structural absence of any tier/plan parameter in the relevant function signatures.

## 31. Routes Added or Modified

Added: `GET /api/parish/dashboard/:parishId/directory/admin/media/legacy-audit`, `POST /api/parish/dashboard/:parishId/directory/admin/media/:assetId/reprocess` (rate-limited, 20/hour). Modified (behavior only, same URL): `POST .../directory/admin/reviews/media_asset/:id/decision` (via the shared `decideDirectoryReviewItem`/`approveReviewItem` path — no route signature change, only the underlying approval logic hardened). Delivery route (`GET /api/directory/media/:id/variants/:type`) unchanged URL, hardened underlying query.

## 32. UI Changes

**None.** No HTML/frontend file was modified by this package — consistent with this being a backend security-hardening package, and with `public/myagapay/directory.html` (Phase 2B's existing UI) not needing any change to benefit from the hardening (it already only ever renders what the API returns, and the API now returns fewer, safer things).

## 33. Audit Events

New action strings, all routed through the existing central `audit_log` (no new audit mechanism): `directory.media.secure_transformation_completed` (renamed from Phase 2B's `processing_completed`, since it now means something real), `directory.media.legacy_asset_classified`, `directory.media.legacy_asset_marked_reprocessing_required`, `directory.media.reupload_required`, `directory.media.legacy_reprocessing_started`, `directory.media.legacy_reprocessing_completed`, `directory.media.legacy_reprocessing_failed`, `directory.media.reviewer_requested_reprocessing`, `directory.review_item.reprocessing_returned_to_review`.

## 34. Observability

Not built as a separate metrics system in this package (no existing metrics/observability infrastructure was found in the directory module to extend) — the audit-log events above are the closest thing this codebase has to an observability signal for this domain, and they carry every field (`ownerType`, `pipelineVersion`, `errorCode`, counts) a future dashboard would need to derive processing success/failure rates without needing new instrumentation. Flagged as a real limitation, not silently omitted: Part 26's explicit metrics (processing success/failure counts, duration, backlog size) are all *derivable* from the audit log via a query, but no dedicated aggregation was built.

## 35. Files Added

`migrations/0028_directory_media_secure_transformation.sql`, `src/directory/media-transform.js`, `scripts/directory-media-transform-tests.mjs`, and this document plus `24`–`28` in `docs/directory/`.

## 36. Files Modified

`src/directory/media.js` (transformation integration, approval gate, delivery gate, legacy audit/reprocessing), `src/directory/admin.js` (approval-gate call site, two new admin functions — file was itself uncommitted Phase 3A work at the time this package began, patched in place per the brief's "patch the actual Phase 3A services" instruction), `src/handlers/directory-admin.js` (two new routes, same uncommitted-at-the-time status), `src/directory/shared.js` (`directory.media.reprocess` capability), `scripts/directory-phase2b-tests.mjs` and `scripts/directory-phase3a-tests.mjs` (migration wiring + one renamed audit-action assertion), `package.json` (dependency + check script).

## 37. Tests Added

`scripts/directory-media-transform-tests.mjs` — 17 assertions: runtime compatibility, real resizing, real EXIF/GPS/device metadata removal (hand-built fixture), orientation normalization (all 8 values), crop validation/application, format rejection, dimension limits, end-to-end upload attestation, anti-forgery (object existence ≠ secure), approval-gate success and three distinct denial scenarios (missing/corrupted variant, legacy pre-2B.1 asset, no-bypass-via-`directory.manage`), secure delivery gate (unverified variant, deprecated pipeline version), legacy audit classification and idempotency, reprocessing (success, approval-continuity policy, idempotent re-run, no-retained-source case), Mission/Parish entitlement parity.

## 38. Test Results

`node scripts/directory-media-transform-tests.mjs`: **17/17 passed.**
`npm run check` (full repository suite, run after every substantive change in this session): **exit code 0, 259 total assertions, zero failures** — including every prior package's tests (accounting Phase 0.75/1A, identity/authorization, directory Phase 1A/1B/1C/2A/2B/3A) unmodified in behavior except the two files noted in Section 36.

## 39. Manual Cloudflare Configuration / Remaining Limitations

- **No manual Cloudflare console configuration is required** — no new binding, no Image Resizing/Cloudflare Images setup, no `wrangler.toml` change.
- **Not verified in this session**: an actual deployment (`wrangler deploy`) or `wrangler dev` exercise of the `workerd` build path — no live Cloudflare account access was available. This is the highest-priority item to confirm before real traffic depends on this pipeline (Section 1 of the security review).
- **Not measured**: real Worker CPU-time/memory consumption for worst-case (10 MB, near-pixel-limit) transformations under actual `workerd` resource constraints.
- **Not built**: automated scheduling of the audit/reprocessing sweep (remains callable on-demand only); owner-facing reupload-required notification; dedicated metrics/observability aggregation beyond the audit log; orphan-R2-object reconciliation sweep (Section 13 of the security review).
- **Legacy crop data**: Phase 2B never persisted applied crop coordinates, which is why reprocessing conservatively returns previously-approved photos to review rather than assuming visual equivalence — this is a policy choice this package made explicitly, not a gap to silently work around.

## 40. Confirmation: Untransformed Media Cannot Be Approved or Served

Confirmed by code path analysis (Sections 21, 27) and by direct, passing tests: a legacy Phase-2B-shaped asset, a partially-corrupted attestation, and a hand-inserted "copied object" row are each independently rejected by both the approval gate and the delivery gate, with no code path — including a `directory.manage`-capability actor — able to bypass either.

## 41. Confirmation: No Phase 3B Functionality Was Introduced

No gallery, browse, search, import, duplicate-detection, or merge-engine code was added anywhere in this package. `git diff`/new-file scope is limited to: one migration, one new transformation module, one new test file, patches to the existing Phase 2B media service and Phase 3A admin/review services (approval gate, two new operational routes), one shared capability addition, and documentation. Confirmed by review of every file listed in Sections 35–36 — none implement browsing, searching, importing, or comparing/merging records.

## 42. Readiness Verdict for Phase 3B (Duplicate Detection, Record Comparison, and Controlled Merge Review)

**Ready to proceed, with one explicit pre-flight item carried forward (not a Phase 3B blocker, but a pre-production one): verify the `workerd` build path with a real deployment before this pipeline serves real member-facing traffic** (Section 39). Phase 3B's own scope (duplicate detection, record comparison, merge review) operates on canonical person/household records and does not depend on media processing internals at all — nothing in this package's remaining limitations blocks that work from starting. The media-security foundation Phase 3B's own future photo-merge-conflict handling (if any) would need is now real: secure, attested, versioned, gate-enforced — not the copied-bytes placeholder it replaced.
