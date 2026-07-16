-- Migration 0026: Parish Directory Phase 2B -- private media foundation.
--
-- Stores only media metadata and private R2 object references. Image bytes
-- remain in R2, never in D1. Directory media is intentionally scoped to one
-- profile photo candidate/current assignment per person or household.

CREATE TABLE IF NOT EXISTS directory_media_assets (
  id                    TEXT    PRIMARY KEY,
  parish_id             TEXT    NOT NULL,
  owner_type            TEXT    NOT NULL CHECK (owner_type IN ('person', 'household')),
  owner_id              TEXT    NOT NULL,
  media_purpose         TEXT    NOT NULL CHECK (media_purpose IN ('person_profile_photo', 'household_profile_photo')),
  lifecycle_status      TEXT    NOT NULL CHECK (lifecycle_status IN (
                            'uploading', 'ready', 'pending_approval', 'approved',
                            'rejected', 'replaced', 'deleted', 'failed'
                          )),
  processing_status     TEXT    NOT NULL CHECK (processing_status IN ('pending', 'processing', 'ready', 'failed')),
  visibility            TEXT    NOT NULL DEFAULT 'private'
                              CHECK (visibility IN ('private', 'household', 'clergy', 'staff', 'leadership', 'directory_members')),
  publication_eligible  INTEGER NOT NULL DEFAULT 0 CHECK (publication_eligible IN (0, 1)),
  source_filename       TEXT,
  detected_mime_type    TEXT    NOT NULL,
  original_byte_size    INTEGER NOT NULL,
  original_width        INTEGER NOT NULL,
  original_height       INTEGER NOT NULL,
  decoded_pixel_count   INTEGER NOT NULL,
  content_hash          TEXT    NOT NULL,
  original_object_key   TEXT,
  uploaded_by_user_id   TEXT    NOT NULL,
  active_assignment_id  TEXT,
  processing_error_code TEXT,
  correlation_id        TEXT,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  deleted_at            INTEGER
);

CREATE INDEX IF NOT EXISTS idx_directory_media_assets_owner
  ON directory_media_assets(parish_id, owner_type, owner_id, media_purpose, lifecycle_status);

CREATE INDEX IF NOT EXISTS idx_directory_media_assets_review
  ON directory_media_assets(parish_id, lifecycle_status, created_at);

CREATE INDEX IF NOT EXISTS idx_directory_media_assets_hash
  ON directory_media_assets(content_hash);

CREATE TABLE IF NOT EXISTS directory_media_variants (
  id             TEXT    PRIMARY KEY,
  media_asset_id TEXT    NOT NULL REFERENCES directory_media_assets(id) ON DELETE CASCADE,
  variant_type   TEXT    NOT NULL CHECK (variant_type IN ('avatar_small', 'avatar_medium', 'avatar_large', 'household_card', 'review_preview')),
  width          INTEGER NOT NULL,
  height         INTEGER NOT NULL,
  mime_type      TEXT    NOT NULL,
  byte_size      INTEGER NOT NULL,
  r2_object_key  TEXT    NOT NULL,
  content_hash   TEXT    NOT NULL,
  ready          INTEGER NOT NULL DEFAULT 1 CHECK (ready IN (0, 1)),
  created_at     INTEGER NOT NULL,
  UNIQUE (media_asset_id, variant_type)
);

CREATE INDEX IF NOT EXISTS idx_directory_media_variants_asset
  ON directory_media_variants(media_asset_id, ready);

CREATE TABLE IF NOT EXISTS directory_media_upload_sessions (
  id                  TEXT    PRIMARY KEY,
  parish_id           TEXT    NOT NULL,
  owner_type          TEXT    NOT NULL CHECK (owner_type IN ('person', 'household')),
  owner_id            TEXT    NOT NULL,
  media_purpose       TEXT    NOT NULL CHECK (media_purpose IN ('person_profile_photo', 'household_profile_photo')),
  requested_visibility TEXT   NOT NULL DEFAULT 'private',
  created_by_user_id  TEXT    NOT NULL,
  status              TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired', 'cancelled', 'failed')),
  expires_at          INTEGER NOT NULL,
  completed_at        INTEGER,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_directory_media_upload_sessions_user
  ON directory_media_upload_sessions(created_by_user_id, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_directory_media_upload_sessions_expiry
  ON directory_media_upload_sessions(status, expires_at);

CREATE TABLE IF NOT EXISTS directory_media_assignments (
  id                  TEXT    PRIMARY KEY,
  parish_id           TEXT    NOT NULL,
  owner_type          TEXT    NOT NULL CHECK (owner_type IN ('person', 'household')),
  owner_id            TEXT    NOT NULL,
  media_purpose       TEXT    NOT NULL CHECK (media_purpose IN ('person_profile_photo', 'household_profile_photo')),
  media_asset_id      TEXT    NOT NULL REFERENCES directory_media_assets(id) ON DELETE RESTRICT,
  assignment_status   TEXT    NOT NULL CHECK (assignment_status IN ('candidate', 'active', 'replaced', 'deleted')),
  assigned_by_user_id TEXT    NOT NULL,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  replaced_at         INTEGER,
  deleted_at          INTEGER
);

CREATE INDEX IF NOT EXISTS idx_directory_media_assignments_owner
  ON directory_media_assignments(parish_id, owner_type, owner_id, media_purpose, assignment_status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_media_assignments_one_active
  ON directory_media_assignments(parish_id, owner_type, owner_id, media_purpose)
  WHERE assignment_status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_media_assignments_one_candidate
  ON directory_media_assignments(parish_id, owner_type, owner_id, media_purpose)
  WHERE assignment_status = 'candidate';
