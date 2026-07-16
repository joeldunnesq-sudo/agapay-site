-- Migration 0025: Parish Directory Phase 2A -- household self-service.
--
-- Adds the smallest review/notification schema needed for self-service
-- changes that must not directly mutate canonical household structure or
-- parish-controlled fields. No donor, giving, Learn, accounting, media,
-- browse, or search tables are introduced.

CREATE TABLE IF NOT EXISTS directory_change_requests (
  id                    TEXT    PRIMARY KEY,
  parish_id             TEXT    NOT NULL,
  requester_user_id      TEXT    NOT NULL,
  requester_person_id    TEXT    NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  target_type            TEXT    NOT NULL CHECK (target_type IN ('person', 'household')),
  target_id              TEXT    NOT NULL,
  household_id           TEXT,
  request_type           TEXT    NOT NULL CHECK (request_type IN (
                            'person_profile_review',
                            'household_membership_add',
                            'household_membership_remove',
                            'household_relationship_change',
                            'household_move_request',
                            'household_merge_review'
                          )),
  status                 TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN (
                            'pending', 'approved', 'denied', 'cancelled', 'completed'
                          )),
  summary                TEXT    NOT NULL,
  requested_payload_json TEXT    NOT NULL,
  decision_reason_code   TEXT,
  reviewed_by_user_id    TEXT,
  reviewed_at            INTEGER,
  cancelled_at           INTEGER,
  completed_at           INTEGER,
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_directory_change_requests_parish_status
  ON directory_change_requests(parish_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_directory_change_requests_requester
  ON directory_change_requests(requester_person_id, status);

CREATE INDEX IF NOT EXISTS idx_directory_change_requests_target
  ON directory_change_requests(parish_id, target_type, target_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_change_requests_active_duplicate
  ON directory_change_requests(parish_id, requester_person_id, target_type, target_id, request_type, summary)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS directory_notification_events (
  id             TEXT    PRIMARY KEY,
  parish_id      TEXT    NOT NULL,
  recipient_user_id TEXT,
  actor_user_id  TEXT,
  event_type     TEXT    NOT NULL,
  target_type    TEXT    NOT NULL,
  target_id      TEXT    NOT NULL,
  household_id   TEXT,
  safe_message   TEXT    NOT NULL,
  metadata_json  TEXT,
  read_at        INTEGER,
  created_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_directory_notification_events_recipient
  ON directory_notification_events(recipient_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_directory_notification_events_parish
  ON directory_notification_events(parish_id, event_type, created_at);
