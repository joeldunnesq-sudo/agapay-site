-- Migration 0031: Parish Directory Phase 5A -- ministries and participation.
--
-- Adds parish-scoped ministry/service-group records, leadership display
-- assignments, adult participation, and member interest requests. This is
-- directory-domain data only: no donor, giving, accounting, Learn,
-- Commerce, Marketplace, messaging, scheduling, attendance, exports, or
-- public ministry pages are introduced.

CREATE TABLE directory_review_metadata_phase5a (
  id                    TEXT    PRIMARY KEY,
  parish_id             TEXT    NOT NULL,
  source_type           TEXT    NOT NULL CHECK (source_type IN (
                            'change_request', 'publication_profile', 'media_asset',
                            'duplicate_candidate', 'child_publication', 'ministry_interest'
                          )),
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

INSERT OR IGNORE INTO directory_review_metadata_phase5a
  (id, parish_id, source_type, source_id, queue_status, priority,
   assigned_to_user_id, assigned_by_user_id, assigned_at, review_started_at,
   returned_at, completed_at, created_at, updated_at)
SELECT id, parish_id, source_type, source_id, queue_status, priority,
       assigned_to_user_id, assigned_by_user_id, assigned_at, review_started_at,
       returned_at, completed_at, created_at, updated_at
  FROM directory_review_metadata;

DROP TABLE directory_review_metadata;

ALTER TABLE directory_review_metadata_phase5a RENAME TO directory_review_metadata;

CREATE INDEX IF NOT EXISTS idx_directory_review_metadata_parish
  ON directory_review_metadata(parish_id, queue_status, priority, updated_at);

CREATE INDEX IF NOT EXISTS idx_directory_review_metadata_assignee
  ON directory_review_metadata(parish_id, assigned_to_user_id, queue_status);

CREATE TABLE IF NOT EXISTS directory_ministries (
  id                              TEXT    PRIMARY KEY,
  parish_id                       TEXT    NOT NULL,
  canonical_name                  TEXT    NOT NULL,
  display_name                    TEXT    NOT NULL,
  slug                            TEXT    NOT NULL,
  short_description               TEXT,
  detailed_description            TEXT,
  category                        TEXT    NOT NULL DEFAULT 'other'
                                      CHECK (category IN (
                                        'liturgical', 'educational', 'charitable',
                                        'hospitality', 'administrative', 'maintenance',
                                        'youth', 'fellowship', 'outreach',
                                        'bookstore', 'committee', 'other'
                                      )),
  status                          TEXT    NOT NULL DEFAULT 'draft'
                                      CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  visibility                      TEXT    NOT NULL DEFAULT 'parish_members'
                                      CHECK (visibility IN ('staff_only', 'parish_members', 'participants_only', 'hidden')),
  request_policy                  TEXT    NOT NULL DEFAULT 'closed'
                                      CHECK (request_policy IN ('closed', 'request_interest', 'administrator_assignment_only')),
  participant_publication_policy  TEXT    NOT NULL DEFAULT 'opt_in_reviewed'
                                      CHECK (participant_publication_policy IN ('hidden', 'opt_in_reviewed', 'leaders_only')),
  leader_publication_policy       TEXT    NOT NULL DEFAULT 'reviewed'
                                      CHECK (leader_publication_policy IN ('hidden', 'reviewed')),
  child_participation_policy      TEXT    NOT NULL DEFAULT 'excluded'
                                      CHECK (child_participation_policy = 'excluded'),
  display_order                   INTEGER NOT NULL DEFAULT 100,
  created_by_user_id              TEXT    NOT NULL,
  updated_by_user_id              TEXT    NOT NULL,
  created_at                      INTEGER NOT NULL,
  updated_at                      INTEGER NOT NULL,
  archived_at                     INTEGER,
  revision                        INTEGER NOT NULL DEFAULT 1,
  UNIQUE (parish_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_directory_ministries_parish_status
  ON directory_ministries(parish_id, status, visibility, display_order, display_name);

CREATE TABLE IF NOT EXISTS directory_ministry_leaders (
  id                  TEXT    PRIMARY KEY,
  parish_id           TEXT    NOT NULL,
  ministry_id         TEXT    NOT NULL REFERENCES directory_ministries(id) ON DELETE CASCADE,
  person_id           TEXT    NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  assignment_type     TEXT    NOT NULL DEFAULT 'leader'
                            CHECK (assignment_type IN ('leader', 'assistant_leader', 'clergy_liaison', 'coordinator', 'administrator')),
  publication_state   TEXT    NOT NULL DEFAULT 'hidden'
                            CHECK (publication_state IN ('hidden', 'published')),
  active              INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  effective_at        INTEGER,
  ended_at            INTEGER,
  assigned_by_user_id TEXT    NOT NULL,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  revision            INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_ministry_active_leader
  ON directory_ministry_leaders(parish_id, ministry_id, person_id, assignment_type)
  WHERE active = 1;

CREATE INDEX IF NOT EXISTS idx_directory_ministry_leaders_person
  ON directory_ministry_leaders(parish_id, person_id, active);

CREATE TABLE IF NOT EXISTS directory_ministry_participants (
  id                     TEXT    PRIMARY KEY,
  parish_id              TEXT    NOT NULL,
  ministry_id            TEXT    NOT NULL REFERENCES directory_ministries(id) ON DELETE CASCADE,
  person_id              TEXT    NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  source                 TEXT    NOT NULL DEFAULT 'administrator_assigned'
                               CHECK (source IN ('administrator_assigned', 'member_requested', 'restored')),
  status                 TEXT    NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'paused', 'removed', 'withdrawn', 'ended')),
  participation_type     TEXT    NOT NULL DEFAULT 'participant'
                               CHECK (participation_type IN ('participant', 'volunteer', 'member', 'helper', 'advisor')),
  publication_preference TEXT    NOT NULL DEFAULT 'hidden'
                               CHECK (publication_preference IN ('hidden', 'directory')),
  approved_publication   INTEGER NOT NULL DEFAULT 0 CHECK (approved_publication IN (0, 1)),
  start_at               INTEGER,
  end_at                 INTEGER,
  assigned_by_user_id    TEXT    NOT NULL,
  request_id             TEXT,
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL,
  revision               INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_ministry_active_participant
  ON directory_ministry_participants(parish_id, ministry_id, person_id)
  WHERE status IN ('active', 'paused');

CREATE INDEX IF NOT EXISTS idx_directory_ministry_participants_person
  ON directory_ministry_participants(parish_id, person_id, status);

CREATE INDEX IF NOT EXISTS idx_directory_ministry_participants_ministry
  ON directory_ministry_participants(parish_id, ministry_id, status, approved_publication);

CREATE TABLE IF NOT EXISTS directory_ministry_interest_requests (
  id                         TEXT    PRIMARY KEY,
  parish_id                  TEXT    NOT NULL,
  ministry_id                TEXT    NOT NULL REFERENCES directory_ministries(id) ON DELETE CASCADE,
  person_id                  TEXT    NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  requester_user_id           TEXT    NOT NULL,
  requester_person_id         TEXT    NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  interest_type              TEXT    NOT NULL DEFAULT 'participant'
                                  CHECK (interest_type IN ('participant', 'volunteer', 'member', 'helper', 'advisor')),
  member_note                TEXT,
  reviewer_note              TEXT,
  status                     TEXT    NOT NULL DEFAULT 'submitted'
                                  CHECK (status IN ('submitted', 'under_review', 'returned', 'approved', 'rejected', 'withdrawn', 'cancelled')),
  reviewed_by_user_id         TEXT,
  submitted_at               INTEGER,
  resolved_at                INTEGER,
  withdrawn_at               INTEGER,
  review_item_id             TEXT,
  created_at                 INTEGER NOT NULL,
  updated_at                 INTEGER NOT NULL,
  revision                   INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_ministry_interest_unresolved
  ON directory_ministry_interest_requests(parish_id, ministry_id, person_id)
  WHERE status IN ('submitted', 'under_review', 'returned');

CREATE INDEX IF NOT EXISTS idx_directory_ministry_interest_queue
  ON directory_ministry_interest_requests(parish_id, status, submitted_at);

CREATE INDEX IF NOT EXISTS idx_directory_ministry_interest_person
  ON directory_ministry_interest_requests(parish_id, person_id, status);
