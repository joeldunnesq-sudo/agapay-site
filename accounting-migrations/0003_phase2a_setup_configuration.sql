-- Phase 2A normalized setup/configuration state (parish database only).
CREATE TABLE IF NOT EXISTS accounting_settings (
  id TEXT PRIMARY KEY CHECK(id = 'primary'),
  base_currency TEXT NOT NULL DEFAULT 'USD',
  fiscal_year_start_month INTEGER NOT NULL DEFAULT 1,
  default_fund_id TEXT,
  opening_balances_required INTEGER NOT NULL DEFAULT 0,
  opening_balances_disposition TEXT NOT NULL DEFAULT 'pending',
  account_numbers_required INTEGER NOT NULL DEFAULT 1,
  allow_custom_account_numbers INTEGER NOT NULL DEFAULT 1,
  soft_close_override_enabled INTEGER NOT NULL DEFAULT 0,
  setup_completed_at TEXT,
  setup_completed_by_actor_type TEXT,
  setup_completed_by_actor_id TEXT,
  settings_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(default_fund_id) REFERENCES accounting_funds(id),
  CHECK(length(base_currency) = 3),
  CHECK(fiscal_year_start_month BETWEEN 1 AND 12),
  CHECK(opening_balances_required IN (0,1)),
  CHECK(opening_balances_disposition IN ('pending','required','deferred','not_applicable','posted')),
  CHECK(account_numbers_required IN (0,1)),
  CHECK(allow_custom_account_numbers IN (0,1)),
  CHECK(soft_close_override_enabled IN (0,1))
);

INSERT OR IGNORE INTO accounting_settings(id, default_fund_id)
SELECT 'primary', id FROM accounting_funds WHERE is_default = 1 LIMIT 1;
