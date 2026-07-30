PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS accounting_migration_sessions(
  id TEXT PRIMARY KEY,
  source_system TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  chart_of_accounts_status TEXT NOT NULL DEFAULT 'not_started',
  vendors_status TEXT NOT NULL DEFAULT 'not_started',
  fund_mapping_status TEXT NOT NULL DEFAULT 'not_started',
  opening_balance_status TEXT NOT NULL DEFAULT 'not_started',
  transaction_history_status TEXT NOT NULL DEFAULT 'not_started',
  created_by_actor_type TEXT NOT NULL,
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  completed_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  CHECK(source_system IN('quickbooks','aplos','other')),
  CHECK(status IN('in_progress','completed','abandoned')),
  CHECK(chart_of_accounts_status IN('not_started','in_progress','completed','skipped')),
  CHECK(vendors_status IN('not_started','in_progress','completed','skipped')),
  CHECK(fund_mapping_status IN('not_started','in_progress','completed','skipped')),
  CHECK(opening_balance_status IN('not_started','in_progress','completed','skipped')),
  CHECK(transaction_history_status IN('not_started','in_progress','completed','skipped'))
);

CREATE TABLE IF NOT EXISTS accounting_migration_account_map(
  migration_session_id TEXT NOT NULL,
  source_account_ref TEXT NOT NULL,
  agapay_account_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  PRIMARY KEY(migration_session_id,source_account_ref),
  FOREIGN KEY(migration_session_id) REFERENCES accounting_migration_sessions(id),
  FOREIGN KEY(agapay_account_id) REFERENCES accounting_accounts(id)
);

CREATE TABLE IF NOT EXISTS accounting_migration_fund_map(
  migration_session_id TEXT NOT NULL,
  source_fund_ref TEXT NOT NULL,
  agapay_fund_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  PRIMARY KEY(migration_session_id,source_fund_ref),
  FOREIGN KEY(migration_session_id) REFERENCES accounting_migration_sessions(id),
  FOREIGN KEY(agapay_fund_id) REFERENCES accounting_funds(id)
);
