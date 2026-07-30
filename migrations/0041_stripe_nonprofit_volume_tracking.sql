CREATE TABLE IF NOT EXISTS stripe_payment_volume_records (
  stripe_account_id TEXT NOT NULL,
  stripe_charge_id TEXT NOT NULL,
  parish_id TEXT NOT NULL,
  payment_class TEXT NOT NULL,
  classification_source TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  gross_cents INTEGER NOT NULL DEFAULT 0,
  refunded_cents INTEGER NOT NULL DEFAULT 0,
  net_cents INTEGER NOT NULL DEFAULT 0,
  charge_status TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (stripe_account_id, stripe_charge_id)
);

CREATE INDEX IF NOT EXISTS idx_stripe_volume_parish_occurred
  ON stripe_payment_volume_records (parish_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_stripe_volume_parish_class
  ON stripe_payment_volume_records (parish_id, payment_class, occurred_at);

CREATE TABLE IF NOT EXISTS stripe_payment_volume_scans (
  parish_id TEXT NOT NULL,
  stripe_account_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  starting_after TEXT NOT NULL DEFAULT '',
  scanned_count INTEGER NOT NULL DEFAULT 0,
  pass_started_at TEXT NOT NULL,
  last_completed_at TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (parish_id, period_start)
);
-- Original filename retained because D1 identifies applied migrations by filename.
