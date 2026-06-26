-- Migration: 0003_stewardship
-- Adds tables for the AGAPAY Stewardship module.
-- All records are scoped to parish_id (the KV registration key).

-- Annual meeting packets
CREATE TABLE IF NOT EXISTS stewardship_annual_meetings (
  id                TEXT PRIMARY KEY,
  parish_id         TEXT NOT NULL,
  title             TEXT NOT NULL,
  fiscal_year       INTEGER NOT NULL,
  meeting_date      TEXT,
  meeting_time      TEXT,
  location          TEXT,
  parish_name_override TEXT,
  jurisdiction      TEXT,
  address           TEXT,
  status            TEXT NOT NULL DEFAULT 'draft',
  created_by        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stewardship_annual_meetings_parish
  ON stewardship_annual_meetings(parish_id, fiscal_year DESC);

CREATE TABLE IF NOT EXISTS stewardship_agenda_items (
  id               TEXT PRIMARY KEY,
  annual_meeting_id TEXT NOT NULL REFERENCES stewardship_annual_meetings(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  duration_minutes INTEGER,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stewardship_reports (
  id               TEXT PRIMARY KEY,
  annual_meeting_id TEXT NOT NULL REFERENCES stewardship_annual_meetings(id) ON DELETE CASCADE,
  report_type      TEXT NOT NULL,
  title            TEXT NOT NULL,
  body             TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stewardship_financial_summaries (
  id               TEXT PRIMARY KEY,
  annual_meeting_id TEXT NOT NULL UNIQUE REFERENCES stewardship_annual_meetings(id) ON DELETE CASCADE,
  total_income_cents     INTEGER NOT NULL DEFAULT 0,
  total_expense_cents    INTEGER NOT NULL DEFAULT 0,
  net_cents              INTEGER NOT NULL DEFAULT 0,
  notes                  TEXT,
  snapshot_taken_at      TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stewardship_restricted_fund_snapshots (
  id               TEXT PRIMARY KEY,
  annual_meeting_id TEXT NOT NULL REFERENCES stewardship_annual_meetings(id) ON DELETE CASCADE,
  fund_name        TEXT NOT NULL,
  beginning_balance_cents  INTEGER NOT NULL DEFAULT 0,
  total_received_cents     INTEGER NOT NULL DEFAULT 0,
  total_disbursed_cents    INTEGER NOT NULL DEFAULT 0,
  ending_balance_cents     INTEGER NOT NULL DEFAULT 0,
  notes            TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stewardship_nominees (
  id               TEXT PRIMARY KEY,
  annual_meeting_id TEXT NOT NULL REFERENCES stewardship_annual_meetings(id) ON DELETE CASCADE,
  full_name        TEXT NOT NULL,
  position         TEXT,
  bio              TEXT,
  nominated_by     TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stewardship_resolutions (
  id               TEXT PRIMARY KEY,
  annual_meeting_id TEXT NOT NULL REFERENCES stewardship_annual_meetings(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  body             TEXT,
  resolved_text    TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stewardship_generated_packets (
  id               TEXT PRIMARY KEY,
  annual_meeting_id TEXT NOT NULL REFERENCES stewardship_annual_meetings(id) ON DELETE CASCADE,
  generated_by     TEXT,
  storage_key      TEXT,
  generated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Stewardship settings/activation
CREATE TABLE IF NOT EXISTS parish_stewardship_settings (
  parish_id TEXT PRIMARY KEY,
  has_stewardship_suite INTEGER NOT NULL DEFAULT 0,
  stripe_subscription_item_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Giving funds for parish stewardship
CREATE TABLE IF NOT EXISTS giving_funds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parish_id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(parish_id, code)
);

CREATE INDEX IF NOT EXISTS idx_giving_funds_parish ON giving_funds(parish_id);

-- Household pledges synced from donor settings
CREATE TABLE IF NOT EXISTS household_pledges (
  donor_email TEXT NOT NULL,
  parish_id TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  target_amount_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (donor_email, fiscal_year)
);

CREATE INDEX IF NOT EXISTS idx_household_pledges_parish_year ON household_pledges(parish_id, fiscal_year);
