-- Koinonia Prayer Requests: moderated parish prayer, private clergy requests,
-- per-member prayer acknowledgements, reporting, and parish-level settings.

CREATE TABLE IF NOT EXISTS koinonia_prayer_settings (
  parish_id            TEXT    PRIMARY KEY,
  approval_required    INTEGER NOT NULL DEFAULT 1 CHECK (approval_required IN (0, 1)),
  allow_anonymous      INTEGER NOT NULL DEFAULT 1 CHECK (allow_anonymous IN (0, 1)),
  auto_archive_days    INTEGER NOT NULL DEFAULT 30 CHECK (auto_archive_days BETWEEN 7 AND 365),
  notification_mode    TEXT    NOT NULL DEFAULT 'immediate'
                              CHECK (notification_mode IN ('immediate', 'daily_digest', 'off')),
  pastoral_notice      TEXT,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS koinonia_prayer_requests (
  id                       TEXT    PRIMARY KEY,
  parish_id                TEXT    NOT NULL,
  household_id             TEXT,
  submitted_by_person_id   TEXT    NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  body                     TEXT    NOT NULL,
  visibility               TEXT    NOT NULL DEFAULT 'parish_members'
                                  CHECK (visibility IN ('parish_members', 'clergy_only')),
  anonymous_to_parish      INTEGER NOT NULL DEFAULT 0 CHECK (anonymous_to_parish IN (0, 1)),
  status                   TEXT    NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'active', 'answered', 'flagged', 'declined', 'archived')),
  moderation_note          TEXT,
  decline_reason           TEXT,
  created_at               INTEGER NOT NULL,
  updated_at               INTEGER NOT NULL,
  published_at             INTEGER,
  expires_at               INTEGER,
  answered_at              INTEGER,
  archived_at              INTEGER,
  revision                 INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_koinonia_prayer_requests_parish_status
  ON koinonia_prayer_requests(parish_id, status, visibility, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_koinonia_prayer_requests_submitter
  ON koinonia_prayer_requests(parish_id, submitted_by_person_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_koinonia_prayer_requests_expiry
  ON koinonia_prayer_requests(parish_id, status, expires_at);

CREATE TABLE IF NOT EXISTS koinonia_prayer_acknowledgements (
  request_id       TEXT    NOT NULL REFERENCES koinonia_prayer_requests(id) ON DELETE CASCADE,
  parish_id        TEXT    NOT NULL,
  person_id        TEXT    NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  created_at       INTEGER NOT NULL,
  PRIMARY KEY (request_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_koinonia_prayer_acknowledgements_request
  ON koinonia_prayer_acknowledgements(parish_id, request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS koinonia_prayer_reports (
  id                 TEXT    PRIMARY KEY,
  request_id         TEXT    NOT NULL REFERENCES koinonia_prayer_requests(id) ON DELETE CASCADE,
  parish_id          TEXT    NOT NULL,
  reporter_person_id TEXT    NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  reason             TEXT,
  created_at         INTEGER NOT NULL,
  resolved_at        INTEGER,
  UNIQUE (request_id, reporter_person_id)
);

CREATE INDEX IF NOT EXISTS idx_koinonia_prayer_reports_queue
  ON koinonia_prayer_reports(parish_id, resolved_at, created_at DESC);

CREATE TABLE IF NOT EXISTS koinonia_prayer_activity (
  id               TEXT    PRIMARY KEY,
  parish_id        TEXT    NOT NULL,
  request_id       TEXT    NOT NULL REFERENCES koinonia_prayer_requests(id) ON DELETE CASCADE,
  actor_type       TEXT    NOT NULL CHECK (actor_type IN ('member', 'parish_dashboard', 'system')),
  actor_person_id  TEXT,
  action           TEXT    NOT NULL,
  detail           TEXT,
  created_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_koinonia_prayer_activity_request
  ON koinonia_prayer_activity(parish_id, request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS koinonia_prayer_views (
  parish_id      TEXT    NOT NULL,
  person_id      TEXT    NOT NULL,
  last_opened_at INTEGER NOT NULL,
  PRIMARY KEY (parish_id, person_id)
);
