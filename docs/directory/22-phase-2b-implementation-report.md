# Parish Directory Phase 2B -- Implementation Report

## Executive Summary

Phase 2B adds private person and household profile-photo support for the Parish Directory. It includes metadata schema, upload sessions, content validation, R2 storage, variant records, authenticated delivery, replacement/deletion, minimal UI, tests, and documentation.

## Completion Verdict

Complete as a private media foundation. It does not start Phase 3 administration/review workflows.

## Dependency Verification

Phase 2B reuses Phase 2A context resolution, platform-user person links, active household-admin grants, privacy services, publication profiles, audit helpers, and normalized API errors.

## Migration

- `migrations/0026_directory_media_phase2b.sql`

## Files Added

- `src/directory/media.js`
- `src/handlers/directory-media.js`
- `scripts/directory-phase2b-tests.mjs`
- Phase 2B docs `17` through `22`

## Files Modified

- `wrangler.toml`
- `package.json`
- `src/worker.js`
- `src/directory/index.js`
- `src/directory/privacy.js`
- `public/myagapay/directory.html`

## R2

- bucket: `agapay-directory-media`
- binding: `DIRECTORY_MEDIA`
- access: private Worker-mediated delivery
- public URLs: not used

## Upload Limits

- 10 MB max
- 12,000 x 12,000 max dimensions
- 36,000,000 decoded pixels max
- 15 minute upload session TTL

## Supported Formats

- JPEG
- PNG
- WebP

Rejected: SVG, PDF, executables, archives, malformed images, MIME spoofing.

## Routes Added

- `POST /api/directory/media/upload-session`
- `POST /api/directory/media/sessions/:id/complete`
- `GET /api/directory/media/current`
- `POST /api/directory/media/:id/submit`
- `DELETE /api/directory/media/:id`
- `GET /api/directory/media/:id/variants/:variant`

## UI Added

`public/myagapay/directory.html` now includes a profile photo panel with upload, submit-for-review, and remove actions.

## Child Photo Decision

Child person photos are deferred and denied in Phase 2B. Children remain hidden by default.

## Audit Events

- `directory.media.person_upload_initiated`
- `directory.media.household_upload_initiated`
- `directory.media.processing_completed`
- `directory.media.person_photo_replaced`
- `directory.media.household_photo_replaced`
- `directory.media.photo_submitted`
- `directory.media.person_photo_removed`
- `directory.media.household_photo_removed`

## Tests

`scripts/directory-phase2b-tests.mjs` covers schema, content sniffing, dangerous upload rejection, person upload, household upload, spouse overreach denial, child denial, publication separation, authenticated delivery, deletion access cutoff, legacy bearer denial, and replacement concurrency.

## Known Limitations

Native pixel resizing and metadata stripping are not yet backed by a dedicated image-processing runtime library. The private variant architecture is in place for that upgrade.

## Deferred Phase 3 Scope

Phase 3 should implement parish administration and review workflows: media review queue, approve/reject UI, protected warnings, reviewer audit, staff correction tools, and parish-wide directory administration. Do not add browse/search unless separately scoped.
