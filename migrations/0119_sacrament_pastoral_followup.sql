-- Pastoral care tickler inside Sacraments & Services.
-- A parish keeps one care plan per person and an append-only contact history.

CREATE TABLE IF NOT EXISTS sacrament_pastoral_followups (
  id                     TEXT PRIMARY KEY,
  parish_id              TEXT NOT NULL,
  person_id              TEXT NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  assigned_priest_name   TEXT NOT NULL,
  assigned_priest_email  TEXT,
  reason                 TEXT NOT NULL DEFAULT 'regular_check_in'
                           CHECK (reason IN (
                             'homebound', 'hospitalized', 'bereavement',
                             'newcomer', 'regular_check_in', 'other'
                           )),
  status                 TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'closed')),
  cadence_days           INTEGER CHECK (cadence_days IS NULL OR cadence_days BETWEEN 1 AND 3650),
  next_due_on            TEXT,
  note                   TEXT,
  created_by             TEXT NOT NULL,
  closed_at              TEXT,
  closed_by              TEXT,
  closure_reason         TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (parish_id, person_id),
  CHECK (
    (status = 'active' AND next_due_on IS NOT NULL AND closed_at IS NULL) OR
    (status = 'closed' AND next_due_on IS NULL AND closed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_sacrament_pastoral_followups_due
  ON sacrament_pastoral_followups(parish_id, status, next_due_on);

CREATE INDEX IF NOT EXISTS idx_sacrament_pastoral_followups_assignee
  ON sacrament_pastoral_followups(parish_id, assigned_priest_email, status, next_due_on);

CREATE TABLE IF NOT EXISTS sacrament_pastoral_contacts (
  id                 TEXT PRIMARY KEY,
  followup_id        TEXT NOT NULL REFERENCES sacrament_pastoral_followups(id) ON DELETE CASCADE,
  contact_type       TEXT NOT NULL CHECK (contact_type IN (
                       'phone', 'home_visit', 'hospital_visit', 'communion',
                       'conversation', 'family_contact', 'other'
                     )),
  contacted_at       TEXT NOT NULL,
  recorded_by        TEXT NOT NULL,
  summary            TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sacrament_pastoral_contacts_followup
  ON sacrament_pastoral_contacts(followup_id, contacted_at DESC);
