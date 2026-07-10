-- Migration: 0017_giving_statements
--
-- Annual IRS-compliant giving statements: parish-triggered bulk generation
-- of one PDF per donor summarizing that donor's completed gifts to the
-- parish for a given calendar (fiscal) year, emailed as an attachment and
-- persisted to R2 (GIVING_STATEMENTS bucket, see wrangler.toml) so donors
-- can re-download from MyAGAPAY later.
--
-- Two tables:
--   giving_statement_jobs -- one row per "Generate & Email All" trigger for
--                             a parish/year; polled by the dashboard for
--                             progress and used as an audit trail.
--   giving_statements     -- one row per donor/parish/year statement that
--                             was generated; UNIQUE(parish_id, donor_email,
--                             fiscal_year) so re-triggering a job safely
--                             upserts/overwrites rather than duplicating.

CREATE TABLE IF NOT EXISTS giving_statement_jobs (
  id                TEXT    PRIMARY KEY,
  parish_id         TEXT    NOT NULL,
  fiscal_year       INTEGER NOT NULL,
  -- pending | running | completed | completed_with_errors | failed
  status            TEXT    NOT NULL DEFAULT 'pending',
  total_donors      INTEGER NOT NULL DEFAULT 0,
  processed_donors  INTEGER NOT NULL DEFAULT 0,
  sent_count        INTEGER NOT NULL DEFAULT 0,
  failed_count      INTEGER NOT NULL DEFAULT 0,
  triggered_by      TEXT,
  error             TEXT,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  completed_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_giving_statement_jobs_parish
  ON giving_statement_jobs(parish_id, fiscal_year DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS giving_statements (
  id             TEXT    PRIMARY KEY,
  job_id         TEXT    REFERENCES giving_statement_jobs(id),
  parish_id      TEXT    NOT NULL,
  donor_email    TEXT    NOT NULL,
  fiscal_year    INTEGER NOT NULL,
  total_cents    INTEGER NOT NULL,
  gift_count     INTEGER NOT NULL,
  storage_key    TEXT,                             -- R2 object key in GIVING_STATEMENTS
  -- pending | sent | failed | skipped
  email_status   TEXT    NOT NULL DEFAULT 'pending',
  email_error    TEXT,
  generated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  sent_at        TEXT,
  UNIQUE(parish_id, donor_email, fiscal_year)
);

CREATE INDEX IF NOT EXISTS idx_giving_statements_parish_year
  ON giving_statements(parish_id, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_giving_statements_donor_year
  ON giving_statements(donor_email, fiscal_year);
