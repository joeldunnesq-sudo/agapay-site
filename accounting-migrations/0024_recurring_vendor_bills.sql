-- Reviewable Accounts Payable bill schedules.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS accounting_recurring_bill_schedules (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  account_id TEXT NOT NULL,
  fund_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0),
  frequency TEXT NOT NULL CHECK(frequency IN('weekly','biweekly','monthly','quarterly','annual')),
  next_bill_date TEXT NOT NULL,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','paused','completed')),
  last_created_date TEXT,
  last_error TEXT,
  created_by_actor_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  FOREIGN KEY(vendor_id) REFERENCES accounting_vendors(id),
  FOREIGN KEY(account_id) REFERENCES accounting_accounts(id),
  FOREIGN KEY(fund_id) REFERENCES accounting_funds(id)
);

CREATE TABLE IF NOT EXISTS accounting_recurring_bill_executions (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,
  bill_id TEXT,
  status TEXT NOT NULL CHECK(status IN('created','failed')),
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  FOREIGN KEY(schedule_id) REFERENCES accounting_recurring_bill_schedules(id),
  FOREIGN KEY(bill_id) REFERENCES accounting_bills(id),
  UNIQUE(schedule_id,scheduled_date)
);

CREATE INDEX IF NOT EXISTS idx_accounting_recurring_bills_due
  ON accounting_recurring_bill_schedules(status,next_bill_date);

