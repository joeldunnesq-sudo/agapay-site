CREATE TABLE IF NOT EXISTS accounting_payment_runs(
  id TEXT PRIMARY KEY,
  bank_account_id TEXT NOT NULL,
  run_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  memo TEXT,
  created_by_actor_type TEXT NOT NULL,
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  posted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(bank_account_id) REFERENCES accounting_bank_accounts(id),
  CHECK(status IN('draft','posted','voided'))
);

CREATE TABLE IF NOT EXISTS accounting_payment_run_items(
  id TEXT PRIMARY KEY,
  payment_run_id TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  FOREIGN KEY(payment_run_id) REFERENCES accounting_payment_runs(id),
  FOREIGN KEY(payment_id) REFERENCES accounting_payments(id),
  UNIQUE(payment_run_id, sequence),
  UNIQUE(payment_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_runs_date ON accounting_payment_runs(run_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_run_items_run ON accounting_payment_run_items(payment_run_id, sequence);
