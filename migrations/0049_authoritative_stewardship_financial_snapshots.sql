-- One authoritative fiscal-year snapshot per parish. Annual-meeting packet
-- financial summaries remain historical packet content and are not aggregated
-- into this operational snapshot.
CREATE TABLE IF NOT EXISTS stewardship_authoritative_financial_snapshots (
  id                            TEXT PRIMARY KEY,
  parish_id                     TEXT NOT NULL,
  fiscal_year                   INTEGER NOT NULL,
  title                         TEXT NOT NULL,
  agapay_contributions_cents    INTEGER NOT NULL DEFAULT 0,
  outside_contributions_cents   INTEGER NOT NULL DEFAULT 0,
  other_revenue_cents           INTEGER NOT NULL DEFAULT 0,
  total_income_cents            INTEGER NOT NULL DEFAULT 0,
  total_expense_cents           INTEGER NOT NULL DEFAULT 0,
  net_cents                     INTEGER NOT NULL DEFAULT 0,
  restricted_funds_json         TEXT NOT NULL DEFAULT '[]',
  notes                         TEXT,
  version                       INTEGER NOT NULL DEFAULT 1,
  created_by                    TEXT,
  updated_by                    TEXT,
  created_at                    TEXT NOT NULL,
  updated_at                    TEXT NOT NULL,
  UNIQUE (parish_id, fiscal_year)
);

CREATE INDEX IF NOT EXISTS idx_stewardship_authoritative_snapshot_year
  ON stewardship_authoritative_financial_snapshots(parish_id, fiscal_year DESC);

CREATE TABLE IF NOT EXISTS stewardship_financial_snapshot_revisions (
  id                            TEXT PRIMARY KEY,
  snapshot_id                   TEXT NOT NULL REFERENCES stewardship_authoritative_financial_snapshots(id) ON DELETE CASCADE,
  parish_id                     TEXT NOT NULL,
  fiscal_year                   INTEGER NOT NULL,
  version                       INTEGER NOT NULL,
  title                         TEXT NOT NULL,
  agapay_contributions_cents    INTEGER NOT NULL DEFAULT 0,
  outside_contributions_cents   INTEGER NOT NULL DEFAULT 0,
  other_revenue_cents           INTEGER NOT NULL DEFAULT 0,
  total_income_cents            INTEGER NOT NULL DEFAULT 0,
  total_expense_cents           INTEGER NOT NULL DEFAULT 0,
  net_cents                     INTEGER NOT NULL DEFAULT 0,
  restricted_funds_json         TEXT NOT NULL DEFAULT '[]',
  notes                         TEXT,
  changed_by                    TEXT,
  created_at                    TEXT NOT NULL,
  UNIQUE (snapshot_id, version)
);

CREATE INDEX IF NOT EXISTS idx_stewardship_snapshot_revisions
  ON stewardship_financial_snapshot_revisions(snapshot_id, version DESC);

-- Outside-AGAPAY giving is contribution intake, not a catch-all revenue form.
-- Existing free-form "other" rows remain in history but fail closed and no
-- longer contribute to stewardship-giving calculations.
ALTER TABLE manual_income_entries
  ADD COLUMN contribution_eligible INTEGER NOT NULL DEFAULT 0;

ALTER TABLE manual_income_entries
  ADD COLUMN batch_reference TEXT;

UPDATE manual_income_entries
   SET contribution_eligible = 1
 WHERE source IN ('cash_and_checks', 'tithely', 'paypal');

CREATE INDEX IF NOT EXISTS idx_manual_income_eligible_date
  ON manual_income_entries(parish_id, contribution_eligible, entry_date);
-- Original filename retained because D1 identifies applied migrations by filename.
