-- Migration 0030: Parish Directory Phase 4B -- child publication requests.
--
-- Child publication is explicit, narrow, revocable, household-authorized,
-- and parish-reviewed (docs/directory/37-phase-4b-child-publication-policy.md).
-- This table is the ONLY source of truth for whether a specific child's
-- specific fields may appear in the private member directory -- it is
-- deliberately separate from `directory_publication_profiles` (the generic
-- adult/household publication toggle), which has no field-level
-- granularity and is not used for children at all in Phase 4B.
--
-- No existing child record is marked published by this migration -- every
-- child remains hidden until a row here reaches `approved` status, and
-- effective visibility is always re-derived live (see
-- src/directory/member-directory.js), never trusted from this table's
-- status alone.

-- Phase 4B adds a new review source type. SQLite cannot alter the CHECK
-- constraint in place, so rebuild the metadata table with the expanded
-- source-type allowlist and copy existing review metadata forward.
CREATE TABLE IF NOT EXISTS directory_review_metadata_phase4b (
  id                    TEXT    PRIMARY KEY,
  parish_id             TEXT    NOT NULL,
  source_type           TEXT    NOT NULL CHECK (source_type IN ('change_request', 'publication_profile', 'media_asset', 'duplicate_candidate', 'child_publication')),
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

INSERT OR IGNORE INTO directory_review_metadata_phase4b
  (id, parish_id, source_type, source_id, queue_status, priority,
   assigned_to_user_id, assigned_by_user_id, assigned_at, review_started_at,
   returned_at, completed_at, created_at, updated_at)
SELECT id, parish_id, source_type, source_id, queue_status, priority,
       assigned_to_user_id, assigned_by_user_id, assigned_at, review_started_at,
       returned_at, completed_at, created_at, updated_at
  FROM directory_review_metadata;

DROP TABLE directory_review_metadata;

ALTER TABLE directory_review_metadata_phase4b RENAME TO directory_review_metadata;

CREATE INDEX IF NOT EXISTS idx_directory_review_metadata_parish
  ON directory_review_metadata(parish_id, queue_status, priority, updated_at);

CREATE INDEX IF NOT EXISTS idx_directory_review_metadata_assignee
  ON directory_review_metadata(parish_id, assigned_to_user_id, queue_status);

CREATE TABLE IF NOT EXISTS directory_child_publication_requests (
  id                      TEXT    PRIMARY KEY,
  parish_id               TEXT    NOT NULL,
  household_id            TEXT    NOT NULL,
  child_person_id         TEXT    NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  requester_user_id       TEXT    NOT NULL,
  requester_person_id     TEXT,
  status                  TEXT    NOT NULL DEFAULT 'draft'
                              CHECK (status IN (
                                'draft', 'submitted', 'under_review', 'returned',
                                'approved', 'rejected', 'withdrawn', 'revoked', 'stale', 'superseded'
                              )),
  -- Requested/approved fields are stored as a validated JSON array of
  -- controlled field codes drawn from the centralized allowlist in
  -- src/directory/child-publication.js (CHILD_FIELD_CODES) -- never
  -- arbitrary client text (Part 34: "store controlled field codes only").
  requested_fields_json   TEXT    NOT NULL DEFAULT '[]',
  approved_fields_json    TEXT    NOT NULL DEFAULT '[]',
  requested_photo         INTEGER NOT NULL DEFAULT 0 CHECK (requested_photo IN (0, 1)),
  approved_photo          INTEGER NOT NULL DEFAULT 0 CHECK (approved_photo IN (0, 1)),
  -- Revision snapshots captured at submit time, compared against current
  -- values at approval time (Part 24 concurrency/staleness protection).
  request_revision        INTEGER NOT NULL DEFAULT 1,
  child_revision           TEXT,
  household_revision       TEXT,
  policy_revision          TEXT    NOT NULL DEFAULT 'child-publication-v1',
  review_item_id           TEXT,
  reason_code               TEXT,
  parent_note                TEXT,
  reviewer_note               TEXT,
  reviewed_by_user_id          TEXT,
  created_at                    INTEGER NOT NULL,
  updated_at                    INTEGER NOT NULL,
  submitted_at                  INTEGER,
  approved_at                   INTEGER,
  withdrawn_at                  INTEGER,
  revoked_at                    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_directory_child_pub_requests_child
  ON directory_child_publication_requests(parish_id, child_person_id, status);

CREATE INDEX IF NOT EXISTS idx_directory_child_pub_requests_household
  ON directory_child_publication_requests(parish_id, household_id, status);

CREATE INDEX IF NOT EXISTS idx_directory_child_pub_requests_review
  ON directory_child_publication_requests(parish_id, status, created_at);

-- At most one ACTIVE (non-terminal) request per child at a time -- prevents
-- duplicate concurrent requests (Part 24: "duplicate active requests").
-- Terminal states (approved/rejected/withdrawn/revoked/stale/superseded)
-- are excluded so a new request can be drafted after a prior one closes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_child_pub_requests_one_active
  ON directory_child_publication_requests(parish_id, child_person_id)
  WHERE status IN ('draft', 'submitted', 'under_review', 'returned');
