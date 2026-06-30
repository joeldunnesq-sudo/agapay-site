-- Migration: 0005_stewardship_annual_meetings
--
-- The Annual Meeting Packet Builder (src/handlers/stewardship.js) has shipped
-- complete handler logic against these tables for some time, but the tables
-- themselves were never migrated into production D1 — migration 0003 only
-- covered the household_pledges primary-key fix, despite its filename. Every
-- packet-builder route has therefore been failing or returning the
-- "Stewardship database tables are not installed yet" 503 fallback.
--
-- This migration creates the full schema the handler code already queries
-- against, verified column-by-column from every INSERT/UPDATE/SELECT in
-- src/handlers/stewardship.js.

-- ── Core meeting record ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stewardship_annual_meetings (
  id                    TEXT    PRIMARY KEY,
  parish_id             TEXT    NOT NULL,
  title                 TEXT    NOT NULL DEFAULT 'Annual Meeting',
  fiscal_year           INTEGER NOT NULL,
  meeting_date          TEXT,
  meeting_time          TEXT,
  location              TEXT,
  parish_name_override  TEXT,
  jurisdiction          TEXT,
  address               TEXT,
  status                TEXT    NOT NULL DEFAULT 'draft',  -- draft | ready | generated
  created_by            TEXT,
  created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stewardship_meetings_parish
  ON stewardship_annual_meetings(parish_id, fiscal_year DESC, created_at DESC);

-- ── Agenda items ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stewardship_agenda_items (
  id                TEXT    PRIMARY KEY,
  annual_meeting_id TEXT    NOT NULL REFERENCES stewardship_annual_meetings(id) ON DELETE CASCADE,
  title             TEXT    NOT NULL,
  description       TEXT,
  duration_minutes  INTEGER,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stewardship_agenda_meeting
  ON stewardship_agenda_items(annual_meeting_id, sort_order);

-- ── Reports (rector's report, council report, ministry reports, etc.) ───────
CREATE TABLE IF NOT EXISTS stewardship_reports (
  id                TEXT    PRIMARY KEY,
  annual_meeting_id TEXT    NOT NULL REFERENCES stewardship_annual_meetings(id) ON DELETE CASCADE,
  report_type       TEXT    NOT NULL DEFAULT 'custom',  -- rector | council | treasurer | ministry | custom
  title             TEXT    NOT NULL,
  body              TEXT,
  created_by        TEXT,  -- signature line shown under the report in the printed packet
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stewardship_reports_meeting
  ON stewardship_reports(annual_meeting_id, sort_order);

-- ── Financial summary (one row per meeting) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS stewardship_financial_summaries (
  id                  TEXT    PRIMARY KEY,
  annual_meeting_id   TEXT    NOT NULL REFERENCES stewardship_annual_meetings(id) ON DELETE CASCADE,
  total_income_cents  INTEGER NOT NULL DEFAULT 0,
  total_expense_cents INTEGER NOT NULL DEFAULT 0,
  net_cents           INTEGER NOT NULL DEFAULT 0,
  notes               TEXT,
  snapshot_taken_at   TEXT,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stewardship_financial_meeting
  ON stewardship_financial_summaries(annual_meeting_id);

-- ── Restricted fund snapshots (many rows per meeting, one per fund) ─────────
CREATE TABLE IF NOT EXISTS stewardship_restricted_fund_snapshots (
  id                       TEXT    PRIMARY KEY,
  annual_meeting_id        TEXT    NOT NULL REFERENCES stewardship_annual_meetings(id) ON DELETE CASCADE,
  fund_name                TEXT    NOT NULL,
  beginning_balance_cents  INTEGER NOT NULL DEFAULT 0,
  total_received_cents     INTEGER NOT NULL DEFAULT 0,
  total_disbursed_cents    INTEGER NOT NULL DEFAULT 0,
  ending_balance_cents     INTEGER NOT NULL DEFAULT 0,
  notes                    TEXT,
  sort_order               INTEGER NOT NULL DEFAULT 0,
  created_at               TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stewardship_restricted_meeting
  ON stewardship_restricted_fund_snapshots(annual_meeting_id, sort_order);

-- ── Nominees (parish council / officer slate) ───────────────────────────────
CREATE TABLE IF NOT EXISTS stewardship_nominees (
  id                TEXT    PRIMARY KEY,
  annual_meeting_id TEXT    NOT NULL REFERENCES stewardship_annual_meetings(id) ON DELETE CASCADE,
  full_name         TEXT    NOT NULL,
  position          TEXT,
  bio               TEXT,
  nominated_by      TEXT,  -- shown as "Nominated by ___" under the nominee in the printed packet
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stewardship_nominees_meeting
  ON stewardship_nominees(annual_meeting_id, sort_order);

-- ── Resolutions (items to be voted on) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS stewardship_resolutions (
  id                TEXT    PRIMARY KEY,
  annual_meeting_id TEXT    NOT NULL REFERENCES stewardship_annual_meetings(id) ON DELETE CASCADE,
  title             TEXT    NOT NULL,
  body              TEXT,
  resolved_text     TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stewardship_resolutions_meeting
  ON stewardship_resolutions(annual_meeting_id, sort_order);

-- ── Generated packet log (audit trail for "Download PDF" / "Mark generated") ─
CREATE TABLE IF NOT EXISTS stewardship_generated_packets (
  id                TEXT NOT NULL PRIMARY KEY,
  annual_meeting_id TEXT NOT NULL REFERENCES stewardship_annual_meetings(id) ON DELETE CASCADE,
  generated_by      TEXT,
  generated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stewardship_packets_meeting
  ON stewardship_generated_packets(annual_meeting_id, generated_at DESC);
