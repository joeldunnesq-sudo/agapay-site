-- Migration 0027: Parish Directory Phase 3A -- parish administration.
--
-- Keeps authoritative requests in their source tables while adding only
-- review metadata, assignment/priority state, and access-controlled notes.

CREATE TABLE IF NOT EXISTS directory_review_metadata (
  id                    TEXT    PRIMARY KEY,
  parish_id             TEXT    NOT NULL,
  source_type           TEXT    NOT NULL CHECK (source_type IN ('change_request', 'publication_profile', 'media_asset')),
  source_id             TEXT    NOT NULL,
  queue_status          TEXT    NOT NULL DEFAULT 'pending_review'
                                  CHECK (queue_status IN (
                                    'pending_review', 'assigned', 'in_review', 'returned',
                                    'approved', 'denied', 'cancelled', 'completed',
                                    'failed_resolution'
                                  )),
  priority              TEXT    NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'elevated', 'urgent')),
  assigned_to_user_id   TEXT,
  assigned_by_user_id   TEXT,
  assigned_at           INTEGER,
  review_started_at     INTEGER,
  returned_at           INTEGER,
  completed_at          INTEGER,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  UNIQUE (source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_directory_review_metadata_parish
  ON directory_review_metadata(parish_id, queue_status, priority, updated_at);

CREATE INDEX IF NOT EXISTS idx_directory_review_metadata_assignee
  ON directory_review_metadata(parish_id, assigned_to_user_id, queue_status);

CREATE TABLE IF NOT EXISTS directory_internal_notes (
  id                  TEXT    PRIMARY KEY,
  parish_id           TEXT    NOT NULL,
  target_type         TEXT    NOT NULL CHECK (target_type IN ('person', 'household', 'review_item', 'claim_conflict')),
  target_id           TEXT    NOT NULL,
  category            TEXT    NOT NULL DEFAULT 'general'
                                CHECK (category IN (
                                  'general', 'verification', 'household', 'contact',
                                  'publication', 'identity', 'protected', 'follow_up'
                                )),
  visibility_class    TEXT    NOT NULL DEFAULT 'staff' CHECK (visibility_class IN ('staff', 'protected')),
  body                TEXT    NOT NULL,
  created_by_user_id  TEXT    NOT NULL,
  updated_by_user_id  TEXT,
  archived_at         INTEGER,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_directory_internal_notes_target
  ON directory_internal_notes(parish_id, target_type, target_id, archived_at, created_at);
