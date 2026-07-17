-- Migration 0028: Parish Directory Phase 2B.1 -- secure image transformation
-- attestation and hardened technical-status model.
--
-- Phase 2B (migration 0026) validated uploads and stored bytes under
-- "variant" object keys, but never actually decoded, resized, re-encoded,
-- or stripped metadata from them -- every "variant" was a byte-identical
-- copy of the original upload. This migration adds the schema needed to
-- distinguish "a variant object exists" from "a variant was produced by a
-- trusted transformation pipeline," per docs/directory/23-phase-2b1-secure-media-transformation-architecture.md.
--
-- `directory_media_assets.processing_status` needs new status values
-- ('source_validated', 'securely_transformed', 'reprocessing_required')
-- that its original CHECK constraint (pending/processing/ready/failed)
-- does not allow. SQLite cannot ALTER a CHECK constraint in place, so this
-- table is rebuilt (create new -> copy -> drop old -> rename), the standard
-- safe SQLite migration pattern. All existing rows are copied with NO data
-- loss; every existing row's old `processing_status = 'ready'` is
-- deliberately NOT copied forward as `securely_transformed` -- it is
-- reclassified as `reprocessing_required`, because Phase 2B's 'ready'
-- never meant real transformation occurred (Part 13: "do not infer secure
-- status from old ready or processed flags").

CREATE TABLE directory_media_assets_v2 (
  id                        TEXT    PRIMARY KEY,
  parish_id                 TEXT    NOT NULL,
  owner_type                TEXT    NOT NULL CHECK (owner_type IN ('person', 'household')),
  owner_id                  TEXT    NOT NULL,
  media_purpose             TEXT    NOT NULL CHECK (media_purpose IN ('person_profile_photo', 'household_profile_photo')),
  lifecycle_status          TEXT    NOT NULL CHECK (lifecycle_status IN (
                                'uploading', 'ready', 'pending_approval', 'approved',
                                'rejected', 'replaced', 'deleted', 'failed'
                              )),
  -- Technical processing status -- separate from lifecycle_status (editorial/
  -- publication state, Part 2's "do not collapse technical security and
  -- editorial approval"). 'ready' is deliberately removed from this set: a
  -- generic "ready" flag is exactly what Part 1 prohibits relying on.
  processing_status         TEXT    NOT NULL DEFAULT 'pending' CHECK (processing_status IN (
                                'pending', 'source_validated', 'processing',
                                'securely_transformed', 'reprocessing_required', 'failed'
                              )),
  visibility                TEXT    NOT NULL DEFAULT 'private'
                                CHECK (visibility IN ('private', 'household', 'clergy', 'staff', 'leadership', 'directory_members')),
  publication_eligible      INTEGER NOT NULL DEFAULT 0 CHECK (publication_eligible IN (0, 1)),
  source_filename           TEXT,
  detected_mime_type        TEXT    NOT NULL,
  original_byte_size        INTEGER NOT NULL,
  original_width            INTEGER NOT NULL,
  original_height           INTEGER NOT NULL,
  decoded_pixel_count       INTEGER NOT NULL,
  content_hash              TEXT    NOT NULL,
  original_object_key       TEXT,
  -- Part 15: whether the original private source object is still available
  -- to serve as a reprocessing input. Existing Phase 2B rows retain their
  -- original object (source retention was never disabled), so this
  -- defaults to 1 for the backfill below; a future cleanup that removes an
  -- original must set this to 0 first.
  source_retained           INTEGER NOT NULL DEFAULT 1 CHECK (source_retained IN (0, 1)),
  reupload_required         INTEGER NOT NULL DEFAULT 0 CHECK (reupload_required IN (0, 1)),
  uploaded_by_user_id       TEXT    NOT NULL,
  active_assignment_id      TEXT,
  processing_error_code     TEXT,
  processing_attempt_count  INTEGER NOT NULL DEFAULT 0,
  -- Centralized pipeline-version policy (Part 18) -- which pipeline version
  -- last attempted processing on this asset, if any.
  pipeline_version           TEXT,
  correlation_id             TEXT,
  created_at                 INTEGER NOT NULL,
  updated_at                 INTEGER NOT NULL,
  deleted_at                 INTEGER
);

INSERT INTO directory_media_assets_v2 (
  id, parish_id, owner_type, owner_id, media_purpose, lifecycle_status, processing_status,
  visibility, publication_eligible, source_filename, detected_mime_type, original_byte_size,
  original_width, original_height, decoded_pixel_count, content_hash, original_object_key,
  source_retained, reupload_required, uploaded_by_user_id, active_assignment_id,
  processing_error_code, processing_attempt_count, pipeline_version, correlation_id,
  created_at, updated_at, deleted_at
)
SELECT
  id, parish_id, owner_type, owner_id, media_purpose, lifecycle_status,
  -- Reclassify: legacy 'ready' -> 'reprocessing_required' (Part 13 -- never
  -- presume secure status from the old flag). Legacy 'pending'/'processing'
  -- carry forward unchanged (they were never claimed complete). Legacy
  -- 'failed' carries forward unchanged.
  CASE WHEN processing_status = 'ready' THEN 'reprocessing_required' ELSE processing_status END,
  visibility, publication_eligible, source_filename, detected_mime_type, original_byte_size,
  original_width, original_height, decoded_pixel_count, content_hash, original_object_key,
  1, 0, uploaded_by_user_id, active_assignment_id,
  processing_error_code, 0, NULL, correlation_id,
  created_at, updated_at, deleted_at
FROM directory_media_assets;

DROP TABLE directory_media_assets;
ALTER TABLE directory_media_assets_v2 RENAME TO directory_media_assets;

CREATE INDEX IF NOT EXISTS idx_directory_media_assets_owner
  ON directory_media_assets(parish_id, owner_type, owner_id, media_purpose, lifecycle_status);

CREATE INDEX IF NOT EXISTS idx_directory_media_assets_review
  ON directory_media_assets(parish_id, lifecycle_status, created_at);

CREATE INDEX IF NOT EXISTS idx_directory_media_assets_hash
  ON directory_media_assets(content_hash);

CREATE INDEX IF NOT EXISTS idx_directory_media_assets_processing_status
  ON directory_media_assets(processing_status, updated_at);

-- Variant table: additive columns only (no CHECK constraint on the new
-- columns needing a rebuild) recording the secure-transformation
-- attestation Part 1 requires. `ready` is retained for backward
-- compatibility with existing callers of streamDirectoryMediaVariant, but
-- Phase 2B.1's delivery gate (src/directory/media.js) now additionally
-- requires secure_transform_status = 'securely_transformed' -- `ready`
-- alone no longer authorizes delivery.
ALTER TABLE directory_media_variants ADD COLUMN secure_transform_status TEXT NOT NULL DEFAULT 'unverified';
ALTER TABLE directory_media_variants ADD COLUMN transformer_name TEXT;
ALTER TABLE directory_media_variants ADD COLUMN transformer_version TEXT;
ALTER TABLE directory_media_variants ADD COLUMN pipeline_version TEXT;
ALTER TABLE directory_media_variants ADD COLUMN secure_transformed_at INTEGER;
ALTER TABLE directory_media_variants ADD COLUMN orientation_normalized INTEGER NOT NULL DEFAULT 0;
ALTER TABLE directory_media_variants ADD COLUMN crop_applied INTEGER NOT NULL DEFAULT 0;
ALTER TABLE directory_media_variants ADD COLUMN metadata_stripped INTEGER NOT NULL DEFAULT 0;
ALTER TABLE directory_media_variants ADD COLUMN output_content_hash TEXT;
ALTER TABLE directory_media_variants ADD COLUMN verified_at INTEGER;

-- Existing Phase 2B variant rows (byte-identical copies of the original)
-- are explicitly NOT marked ready for delivery under the new gate --
-- `ready` is force-reset to 0 so nothing already stored is served or
-- approved as if it were a trusted derivative merely because the row
-- already existed (Part 11: "do not describe an object as secure merely
-- because it was copied, renamed, validated, or stored under a derivative
-- key").
UPDATE directory_media_variants SET ready = 0, secure_transform_status = 'unverified' WHERE secure_transform_status = 'unverified';

CREATE INDEX IF NOT EXISTS idx_directory_media_variants_secure_status
  ON directory_media_variants(secure_transform_status, pipeline_version);
