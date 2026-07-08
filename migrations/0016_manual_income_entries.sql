CREATE TABLE IF NOT EXISTS manual_income_entries (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  entry_date TEXT NOT NULL,        -- date the income was received/deposited (YYYY-MM-DD)
  source TEXT NOT NULL,            -- 'cash_and_checks' | 'tithely' | 'paypal' | 'other'
  source_label TEXT,               -- free-text label, used when source = 'other'
  amount_cents INTEGER NOT NULL,
  fund_code TEXT,                  -- optional: which giving fund this counts toward
  notes TEXT,
  entered_by TEXT,                 -- email of the treasurer/admin who logged it
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_manual_income_parish_date
  ON manual_income_entries(parish_id, entry_date);
