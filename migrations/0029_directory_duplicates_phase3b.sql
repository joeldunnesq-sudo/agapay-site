-- Migration 0029: Parish Directory Phase 3B -- duplicate candidates,
-- controlled merge review, aliases, and merge history.

CREATE TABLE directory_review_metadata_v2 (
  id                    TEXT    PRIMARY KEY,
  parish_id             TEXT    NOT NULL,
  source_type           TEXT    NOT NULL CHECK (source_type IN ('change_request', 'publication_profile', 'media_asset', 'duplicate_candidate')),
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

INSERT INTO directory_review_metadata_v2
SELECT * FROM directory_review_metadata;

DROP TABLE directory_review_metadata;
ALTER TABLE directory_review_metadata_v2 RENAME TO directory_review_metadata;

CREATE INDEX IF NOT EXISTS idx_directory_review_metadata_parish
  ON directory_review_metadata(parish_id, queue_status, priority, updated_at);

CREATE INDEX IF NOT EXISTS idx_directory_review_metadata_assignee
  ON directory_review_metadata(parish_id, assigned_to_user_id, queue_status);

CREATE TABLE IF NOT EXISTS directory_duplicate_candidates (
  id                      TEXT    PRIMARY KEY,
  parish_id               TEXT    NOT NULL,
  entity_type             TEXT    NOT NULL CHECK (entity_type IN ('person', 'household')),
  left_entity_id          TEXT    NOT NULL,
  right_entity_id         TEXT    NOT NULL,
  normalized_pair_key     TEXT    NOT NULL,
  candidate_status        TEXT    NOT NULL DEFAULT 'open'
                                      CHECK (candidate_status IN (
                                        'open', 'assigned', 'in_review', 'deferred',
                                        'not_duplicate', 'confirmed_duplicate',
                                        'merge_planned', 'merge_ready', 'merged',
                                        'blocked', 'stale', 'cancelled'
                                      )),
  confidence_band         TEXT    NOT NULL DEFAULT 'low' CHECK (confidence_band IN ('low', 'medium', 'high', 'critical_identity_conflict')),
  score                   INTEGER NOT NULL DEFAULT 0,
  detection_source        TEXT    NOT NULL DEFAULT 'manual_scan',
  signal_summary_json     TEXT    NOT NULL,
  detection_version       TEXT    NOT NULL,
  decision                TEXT,
  decision_reason_code    TEXT,
  decided_by_user_id      TEXT,
  decided_at              INTEGER,
  suppression_until       INTEGER,
  left_revision_at_detection  TEXT,
  right_revision_at_detection TEXT,
  merge_plan_json         TEXT,
  merge_status            TEXT    NOT NULL DEFAULT 'none' CHECK (merge_status IN ('none', 'planned', 'ready', 'executed', 'blocked', 'failed')),
  merged_by_user_id       TEXT,
  merged_at               INTEGER,
  merge_event_id          TEXT,
  first_detected_at       INTEGER NOT NULL,
  last_detected_at        INTEGER NOT NULL,
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL,
  UNIQUE (parish_id, entity_type, normalized_pair_key, detection_version)
);

CREATE INDEX IF NOT EXISTS idx_directory_duplicate_candidates_queue
  ON directory_duplicate_candidates(parish_id, candidate_status, confidence_band, updated_at);

CREATE INDEX IF NOT EXISTS idx_directory_duplicate_candidates_pair
  ON directory_duplicate_candidates(parish_id, entity_type, left_entity_id, right_entity_id);

CREATE TABLE IF NOT EXISTS directory_merge_aliases (
  id                   TEXT    PRIMARY KEY,
  parish_id            TEXT    NOT NULL,
  entity_type          TEXT    NOT NULL CHECK (entity_type IN ('person', 'household')),
  old_entity_id        TEXT    NOT NULL,
  survivor_entity_id   TEXT    NOT NULL,
  merge_event_id       TEXT    NOT NULL,
  active               INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at           INTEGER NOT NULL,
  UNIQUE (parish_id, entity_type, old_entity_id)
);

CREATE INDEX IF NOT EXISTS idx_directory_merge_aliases_survivor
  ON directory_merge_aliases(parish_id, entity_type, survivor_entity_id, active);

CREATE TABLE IF NOT EXISTS directory_merge_events (
  id                    TEXT    PRIMARY KEY,
  parish_id             TEXT    NOT NULL,
  entity_type           TEXT    NOT NULL CHECK (entity_type IN ('person', 'household')),
  candidate_id          TEXT    NOT NULL,
  survivor_entity_id    TEXT    NOT NULL,
  retired_entity_id     TEXT    NOT NULL,
  executed_by_user_id   TEXT    NOT NULL,
  snapshot_json         TEXT    NOT NULL,
  reversible_metadata_json TEXT,
  created_at            INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_directory_merge_events_candidate
  ON directory_merge_events(candidate_id);
