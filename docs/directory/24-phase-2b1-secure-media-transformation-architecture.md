# Parish Directory Phase 2B.1 — Secure Media Transformation Architecture

## 1. The Problem This Package Closes

Phase 2B (`migrations/0026_directory_media_phase2b.sql`, `src/directory/media.js`) validated uploaded images (real byte-content sniffing, MIME-spoof detection, dimension/pixel-count limits) and built a correct schema and authorization model around media assets, variants, upload sessions, and assignments. But `completeDirectoryMediaUpload` never actually transformed anything: `await putObject(env, originalKey, arrayBuffer, ...); for (const variant of variantRows) await putObject(env, variant.key, arrayBuffer, ...);` copied the **same original bytes** to every "variant" object key, and `processing_status`/`ready` were hardcoded to `'ready'`/`1` unconditionally. Every declared variant (`avatar_small` 96×96, `avatar_medium` 256×256, etc.) was, byte-for-byte, the untouched original — no resizing, no re-encoding, no EXIF/GPS stripping, no crop application. This document describes what replaced that.

## 2. Architectural Decision: Option B (`@cf-wasm/photon`)

**Option A (Cloudflare-native Image Resizing) was not selected.** It requires either a paid-plan zone-level image proxy or `fetch()`'s `cf.image` subrequest option against a *reachable URL* — neither cleanly composes with this codebase's private-R2, server-side-only media model without introducing a public or semi-public URL surface for source images, which Part 15/17's "originals must be inaccessible to ordinary viewers" requirement argues against. This deployment's actual Cloudflare plan entitlements were not verifiable from within this repository (no live account access), and the brief is explicit: "do not assume... verify actual runtime compatibility." Given that uncertainty, and given Option B was independently verifiable and worked, Option A was not pursued further.

**Option C was evaluated and found not to exist**: no repository code anywhere already performed real pixel decode/resize/encode. Phase 2B's `media.js` was the closest candidate and is exactly the code this package replaces.

**Option B — `@cf-wasm/photon` (npm, WASM build of the Rust `photon` image library) — was selected**, verified as follows:

- `package.json`'s conditional exports map declares distinct entry points for `"workerd"` (`dist/workerd.js`, importing its WASM module directly via `import photonWasmModule from "./lib/photon_rs_bg.wasm"` — Wrangler's esbuild-based bundler natively resolves `.wasm` imports for ES-module Workers, the format this repository already uses (`main = "src/worker.js"`, `import`/`export` syntax throughout)) and `"node"` (`dist/node.js`, which inlines the WASM binary and calls `initPhoton.sync(...)` synchronously at import time — no async warm-up step, no network fetch). This means the **same source module** (`import { PhotonImage, resize, crop, rotate, fliph, flipv, SamplingFilter } from "@cf-wasm/photon"`, used verbatim in `src/directory/media-transform.js`) resolves to a Workers-appropriate build when Wrangler bundles this Worker for deployment, and to a Node-appropriate build when this repository's own test runner (`node scripts/*.mjs`) executes it locally — one import, two correct runtimes, confirmed by actually running it in this session (see Section 5).
- No native binary, no `.node` addon, no platform-specific prebuild — pure WASM plus JS glue. This directly avoids the brief's explicit "Sharp Warning": `sharp` (present in this repository's `node_modules` only as a *transitive* dependency of `miniflare`, itself a dev-only dependency of `wrangler`, used to emulate Cloudflare's own Image Resizing locally — confirmed via `package-lock.json`, `sharp` is never a direct or Worker-reachable dependency of this project) requires `libvips` native bindings that cannot load inside a `workerd` V8 isolate. `@cf-wasm/photon` was added as a direct `dependencies` entry in `package.json` specifically because it has no such requirement.
- Verified live in this session: `PhotonImage.new_from_byteslice()` correctly decoded a real PNG, `resize()` produced genuinely different pixel dimensions, `get_bytes_jpeg()` produced valid JPEG output (confirmed via the JPEG SOI/APP0 magic bytes `0xFFD8FFE0`) — before any test-suite code was written, as a standalone smoke check, and again fully integrated in `scripts/directory-media-transform-tests.mjs`'s 17 passing tests.

## 3. Pipeline Stages (as implemented, `src/directory/media-transform.js`)

```
authorized source upload (existing Phase 2B auth/validation, unchanged)
        ↓
decodeAndNormalizeSource()
  - byte-size / mime-type guard (re-checked independently of upload-time validation)
  - PhotonImage.new_from_byteslice() -- real decode, throws MEDIA_DECODE_FAILED on failure
  - decoded-dimension / decoded-pixel-count guard (MEDIA_DIMENSIONS_TOO_LARGE / MEDIA_PIXEL_LIMIT_EXCEEDED)
  - readJpegOrientation() -- hand-written EXIF IFD0 Orientation-tag reader (JPEG only)
  - normalizeOrientation() -- rotate()/fliph()/flipv() per the 8 EXIF orientation values
        ↓
transformVariant() (called once per declared variant: avatar_small/medium/large,
household_card, review_preview)
  - crop re-validated against the ACTUAL decoded (post-orientation) dimensions,
    never the client-declared source size -- photonCrop(x, y, x+width, y+height)
  - resize() to the variant's exact declared width/height (Lanczos3 filter)
  - output dimension re-verified against the target (fails closed if mismatched)
  - get_bytes_jpeg(88) or get_bytes_webp() -- real re-encode from decoded pixels
  - SHA-256 of the output bytes computed
        ↓
variant object stored privately in R2 (src/directory/media.js's putObject,
unchanged storage mechanism, now receiving real transformed bytes)
        ↓
variant metadata + secure-processing attestation recorded in one atomic
D1 batch (transformer_name, transformer_version, pipeline_version,
secure_transformed_at, orientation_normalized, crop_applied,
metadata_stripped, output_content_hash)
        ↓
asset becomes technically eligible for review (lifecycle_status = 'ready',
processing_status = 'securely_transformed')
```

Every stage throws a `DirectoryServiceError` with a controlled code (`MEDIA_FILE_TOO_LARGE`, `MEDIA_DIMENSIONS_TOO_LARGE`, `MEDIA_PIXEL_LIMIT_EXCEEDED`, `MEDIA_UNSUPPORTED_FORMAT`, `MEDIA_DECODE_FAILED`, `MEDIA_TRANSFORMATION_FAILED`) on any failure. `completeDirectoryMediaUpload` (`src/directory/media.js`) runs the full per-variant transform loop **before** any `putObject`/D1 write — a thrown error at any stage means nothing is written to R2 or D1 for that upload attempt at all, satisfying "do not mark the media ready if any required stage fails."

## 4. Metadata Removal — Why It's Structural, Not a Filter

Photon's in-memory `PhotonImage` representation is a raw RGBA pixel buffer with no EXIF/ICC/XMP/IPTC segments attached at all. `get_bytes_jpeg()`/`get_bytes_webp()` re-encode **from that pixel buffer**, not from the source file's byte stream — there is no code path in this pipeline that could copy a metadata segment into the output even by accident, because the decoded representation never held one. This is the "clean decoding and re-encoding from pixel data" approach Part 8 identifies as the safest implementation. Verified directly: `scripts/directory-media-transform-tests.mjs`'s EXIF test constructs a real JPEG with a hand-built, byte-accurate EXIF/GPS segment (Make "Canon", Model "EOS R5", GPS latitude 37°46'30"N, Orientation 6), confirms the source genuinely contains those byte sequences, transforms it, and confirms none of them — nor the literal string `"Exif"` — appear anywhere in the output bytes.

**Orientation is the one exception, deliberately**: it is read from the source (never copied to the output) specifically so the pipeline can apply the equivalent pixel rotation/flip before the tag is discarded — the output image is visually correct without ever depending on EXIF again, satisfying Part 7.

**ICC color profiles** are not currently read, preserved, or re-attached — output is whatever Photon's default JPEG/WebP encoder produces (effectively sRGB-equivalent for the vast majority of consumer photos). No color-profile-based denial-of-service vector exists because no ICC profile is ever parsed from the source at all (Part 9's "avoid retaining oversized or malformed ICC profiles" is satisfied by never touching them, not by size-limiting them).

## 5. Runtime Compatibility Verification Performed

- Standalone smoke check (`node`, ad hoc, deleted after use): confirmed decode → resize → encode round-trip.
- `scripts/directory-media-transform-tests.mjs` (17 assertions, part of `npm run check`): confirmed full pipeline integration, real EXIF/GPS stripping, orientation normalization across all 8 EXIF orientation values, crop validation/application, format rejection, dimension limits.
- **Not performed in this session** (no live Cloudflare account access available): an actual `wrangler deploy`/`wrangler dev` exercise of the `workerd` build path. The `workerd` conditional export's `.wasm` import is expected to bundle correctly under Wrangler's standard ES-module WASM support (no `[[rules]]` block was added to `wrangler.toml`, none should be needed for this bundler pattern), but this is flagged honestly as **unverified against a live Workers runtime** — see Section 39 (Remaining Limitations) of the implementation report.

## 6. Pipeline Versioning (Part 18)

`PIPELINE_VERSION = "directory-media-v1"` and `ACCEPTED_PIPELINE_VERSIONS = ["directory-media-v1"]` (`src/directory/media-transform.js`) are the single, centralized source of truth every approval-gate and delivery-gate check consults (`isAcceptedPipelineVersion()`). No accepted-version string is hardcoded anywhere else. A future security-relevant pipeline change (decoder, encoder, resize algorithm, metadata handling, output format, variant dimensions, crop semantics, color normalization) bumps `PIPELINE_VERSION` and adds the new string to `ACCEPTED_PIPELINE_VERSIONS`; an old version simply ages out of that array, at which point every variant tagged with it stops passing the approval/delivery gates until reprocessed (see `26-phase-2b1-legacy-media-remediation-plan.md`).
