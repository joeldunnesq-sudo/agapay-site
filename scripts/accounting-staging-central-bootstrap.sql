-- Empty-database compatibility preconditions for staging.
--
-- Production originally applied a fuller 0003_stewardship migration. That
-- file was later replaced by the household-pledge primary-key rebuild retained
-- in the migration history, so a new D1 needs the original supporting tables
-- before Wrangler replays the historical migrations. This script is
-- idempotent and is deliberately kept outside migrations/ so it runs only in
-- the isolated staging workflow.

CREATE TABLE IF NOT EXISTS parish_stewardship_settings (
  parish_id TEXT PRIMARY KEY,
  has_stewardship_suite INTEGER NOT NULL DEFAULT 0,
  stripe_subscription_item_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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

CREATE INDEX IF NOT EXISTS idx_giving_funds_parish
  ON giving_funds(parish_id);

CREATE TABLE IF NOT EXISTS household_pledges (
  donor_email TEXT NOT NULL,
  parish_id TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  target_amount_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (donor_email, fiscal_year)
);

CREATE INDEX IF NOT EXISTS idx_household_pledges_parish_year
  ON household_pledges(parish_id, fiscal_year);
