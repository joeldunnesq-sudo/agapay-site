# Parish Directory Phase 2B -- Directory Media Architecture

Phase 2B adds private person and household profile-photo support to the Parish Directory. It reuses the Phase 2A self-service context resolver and does not create a parallel ownership model.

## Domain Model

Migration `0026_directory_media_phase2b.sql` adds:

- `directory_media_assets`
- `directory_media_variants`
- `directory_media_upload_sessions`
- `directory_media_assignments`

Only metadata and private R2 object keys are stored in D1. Image bytes are never stored in D1 and base64 image strings are not accepted.

## Ownership

Person photos can be managed only by the linked platform user for that canonical person. Household photos can be managed only by an active household administrator resolved by Phase 2A context.

A household administrator cannot manage another adult's person profile photo simply because they share a household.

## Upload Flow

1. User requests an upload session.
2. Server resolves Phase 2A context.
3. Server fixes owner, parish, purpose, visibility, and uploader.
4. User submits a multipart upload to the session completion route.
5. Server validates image content and dimensions.
6. Server writes private R2 objects.
7. Server creates media asset, variant, and candidate assignment rows transactionally.
8. Upload is audited.

Upload completion is one-time. Expired or reused sessions fail.

## Variants

Person variants:

- `avatar_small` 96 x 96
- `avatar_medium` 256 x 256
- `avatar_large` 512 x 512
- `review_preview` 512 x 512

Household variants:

- `household_card` 640 x 480
- `review_preview` 640 x 480

The current Worker implementation validates image bytes and stores private derivative objects using the same validated source bytes. The schema and object-key model are ready for a later in-runtime image transformer without changing API contracts.

## Replacement and Deletion

Each owner/purpose can have one active assignment and one candidate assignment. A new upload replaces any prior candidate without deleting active approved media. Deletion marks the asset and assignment deleted immediately, so delivery fails closed.

## Cleanup

`cleanupDirectoryMediaObjects` is idempotent and targets only deleted, replaced, or failed media variants. Active media is excluded.
