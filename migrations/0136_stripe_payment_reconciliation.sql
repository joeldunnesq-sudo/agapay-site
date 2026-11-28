-- Provider observations are platform records, separate from signed webhook deliveries.
CREATE TABLE IF NOT EXISTS stripe_payment_reconciliation_findings (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  stripe_account_id TEXT NOT NULL,
  parish_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  discovered_at TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT '',
  next_action TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_by TEXT,
  updated_at TEXT,
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_stripe_payment_reconciliation_open
  ON stripe_payment_reconciliation_findings(discovered_at, event_id) WHERE reviewed_at IS NULL;

CREATE TABLE IF NOT EXISTS stripe_payment_reconciliation_scans (
  stripe_account_id TEXT PRIMARY KEY,
  covered_through INTEGER NOT NULL CHECK (covered_through >= 0)
);
