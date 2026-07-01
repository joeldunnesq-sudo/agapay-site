-- Migration: 0008_sacrament_requests
-- Donors request house blessings, baptisms, weddings, funerals, and other
-- sacraments/services directly from My AGAPAY. Parishes review, schedule,
-- and manage these requests from their parish dashboard.

CREATE TABLE IF NOT EXISTS sacrament_requests (
  id                  TEXT    PRIMARY KEY,
  parish_id           TEXT    NOT NULL,
  donor_email         TEXT    NOT NULL,

  -- house_blessing | baptism | chrismation | wedding | funeral |
  -- memorial_service | confession | home_visit | other
  sacrament_type      TEXT    NOT NULL,
  other_type_label     TEXT,   -- free-text label when sacrament_type = 'other'

  -- requested | acknowledged | scheduled | completed | declined | cancelled
  status              TEXT    NOT NULL DEFAULT 'requested',

  -- What the donor is asking for
  requested_date       TEXT,   -- ISO date, donor's preferred date (may be null / flexible)
  requested_time_window TEXT,  -- free text, e.g. "weekday evenings", "any Saturday"
  participant_names     TEXT,  -- who the sacrament is for (names, one per line or comma-sep)
  location_type         TEXT,  -- 'church' | 'home' | 'other'
  location_address       TEXT, -- required for house blessings / home visits
  notes                  TEXT, -- free-text context from the donor
  phone                  TEXT, -- best contact number for scheduling

  -- What the parish sets once they take action
  confirmed_date         TEXT, -- ISO date the parish has actually scheduled
  confirmed_time          TEXT, -- e.g. "10:00 AM"
  clergy_assigned          TEXT, -- name of priest/deacon assigned
  parish_notes              TEXT, -- internal notes, not shown to the donor
  decline_reason              TEXT, -- shown to the donor if status = declined

  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sacrament_requests_parish
  ON sacrament_requests(parish_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sacrament_requests_donor
  ON sacrament_requests(donor_email, created_at DESC);
