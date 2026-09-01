-- Repose transition and memorial-service ticklers for pastoral follow-up.

ALTER TABLE directory_people ADD COLUMN reposed_on TEXT
  CHECK (reposed_on IS NULL OR reposed_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');

ALTER TABLE sacrament_pastoral_followups ADD COLUMN closure_outcome TEXT
  CHECK (closure_outcome IS NULL OR closure_outcome IN (
    'recovered', 'care_transferred', 'declined', 'moved', 'reposed', 'other'
  ));

ALTER TABLE sacrament_requests ADD COLUMN person_id TEXT
  REFERENCES directory_people(id) ON DELETE SET NULL;

ALTER TABLE sacrament_requests ADD COLUMN request_source TEXT NOT NULL DEFAULT 'donor'
  CHECK (request_source IN ('donor', 'pastoral_memorial'));

ALTER TABLE sacrament_requests ADD COLUMN source_id TEXT;

CREATE TABLE IF NOT EXISTS sacrament_memorial_cycles (
  id                     TEXT PRIMARY KEY,
  parish_id              TEXT NOT NULL,
  person_id              TEXT NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  followup_id            TEXT REFERENCES sacrament_pastoral_followups(id) ON DELETE SET NULL,
  assigned_priest_name   TEXT NOT NULL,
  assigned_priest_email  TEXT,
  reposed_on             TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  include_six_month      INTEGER NOT NULL DEFAULT 1 CHECK (include_six_month IN (0, 1)),
  annual_enabled         INTEGER NOT NULL DEFAULT 1 CHECK (annual_enabled IN (0, 1)),
  created_by             TEXT NOT NULL,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (parish_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_sacrament_memorial_cycles_parish
  ON sacrament_memorial_cycles(parish_id, status, reposed_on);

CREATE TABLE IF NOT EXISTS sacrament_memorial_markers (
  id                    TEXT PRIMARY KEY,
  cycle_id              TEXT NOT NULL REFERENCES sacrament_memorial_cycles(id) ON DELETE CASCADE,
  marker_key            TEXT NOT NULL,
  marker_type           TEXT NOT NULL CHECK (marker_type IN (
                          'third_day', 'ninth_day', 'fortieth_day',
                          'six_month', 'first_anniversary', 'annual_anniversary'
                        )),
  target_date           TEXT NOT NULL,
  remind_on             TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'arranged', 'scheduled', 'completed', 'skipped')),
  scheduled_for         TEXT,
  service_request_id    TEXT REFERENCES sacrament_requests(id) ON DELETE SET NULL,
  note                  TEXT,
  completed_at          TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (cycle_id, marker_key)
);

CREATE INDEX IF NOT EXISTS idx_sacrament_memorial_markers_due
  ON sacrament_memorial_markers(status, remind_on, target_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sacrament_requests_memorial_source
  ON sacrament_requests(parish_id, request_source, source_id)
  WHERE request_source = 'pastoral_memorial' AND source_id IS NOT NULL;
