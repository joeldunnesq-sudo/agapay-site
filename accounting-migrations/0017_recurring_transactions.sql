-- Scheduled recurring expenses and idempotent posting history.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS accounting_recurring_transactions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  payee TEXT NOT NULL,
  description TEXT,
  register_account_id TEXT NOT NULL,
  expense_account_id TEXT NOT NULL,
  fund_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0),
  frequency TEXT NOT NULL CHECK(frequency IN('weekly','biweekly','monthly','quarterly','annual')),
  next_posting_date TEXT NOT NULL,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','paused','completed')),
  last_posted_date TEXT,
  last_error TEXT,
  created_by_actor_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  FOREIGN KEY(register_account_id) REFERENCES accounting_accounts(id),
  FOREIGN KEY(expense_account_id) REFERENCES accounting_accounts(id),
  FOREIGN KEY(fund_id) REFERENCES accounting_funds(id)
);

CREATE TABLE IF NOT EXISTS accounting_recurring_executions (
  id TEXT PRIMARY KEY,
  recurring_transaction_id TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,
  journal_entry_id TEXT,
  status TEXT NOT NULL CHECK(status IN('posted','failed')),
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  FOREIGN KEY(recurring_transaction_id) REFERENCES accounting_recurring_transactions(id),
  FOREIGN KEY(journal_entry_id) REFERENCES accounting_journal_entries(id),
  UNIQUE(recurring_transaction_id,scheduled_date)
);

CREATE INDEX IF NOT EXISTS idx_accounting_recurring_due
  ON accounting_recurring_transactions(status,next_posting_date);
