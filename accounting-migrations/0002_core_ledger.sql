-- Phase 1C: nonprofit double-entry ledger foundation (parish database only).
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounting_account_types (
 id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, category TEXT NOT NULL UNIQUE,
 normal_balance TEXT NOT NULL, statement_type TEXT NOT NULL, sort_order INTEGER NOT NULL, is_system INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 CHECK(category IN ('asset','liability','net_asset','revenue','expense')),
 CHECK(normal_balance IN ('debit','credit')), CHECK(statement_type IN ('balance_sheet','activity_statement')), CHECK(is_system IN (0,1))
);

CREATE TABLE IF NOT EXISTS accounting_accounts (
 id TEXT PRIMARY KEY, account_number TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT,
 account_type_id TEXT NOT NULL, parent_account_id TEXT, normal_balance TEXT NOT NULL,
 is_posting_account INTEGER NOT NULL DEFAULT 1, is_system INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1,
 requires_fund INTEGER NOT NULL DEFAULT 1, cash_flow_classification TEXT, restricted_usage TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), archived_at TEXT, version INTEGER NOT NULL DEFAULT 1,
 FOREIGN KEY(account_type_id) REFERENCES accounting_account_types(id), FOREIGN KEY(parent_account_id) REFERENCES accounting_accounts(id),
 CHECK(parent_account_id IS NULL OR parent_account_id <> id), CHECK(normal_balance IN ('debit','credit')),
 CHECK(is_posting_account IN (0,1)), CHECK(is_system IN (0,1)), CHECK(is_active IN (0,1)), CHECK(requires_fund IN (0,1))
);
CREATE INDEX IF NOT EXISTS idx_accounting_accounts_type ON accounting_accounts(account_type_id);
CREATE INDEX IF NOT EXISTS idx_accounting_accounts_parent ON accounting_accounts(parent_account_id);

CREATE TABLE IF NOT EXISTS accounting_funds (
 id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT,
 restriction_type TEXT NOT NULL, purpose TEXT, start_date TEXT, end_date TEXT,
 is_default INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1, is_system INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), archived_at TEXT, version INTEGER NOT NULL DEFAULT 1,
 CHECK(restriction_type IN ('unrestricted','board_designated','donor_restricted_temporary','donor_restricted_permanent')),
 CHECK(is_default IN (0,1)), CHECK(is_active IN (0,1)), CHECK(is_system IN (0,1)), CHECK(end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_funds_one_default ON accounting_funds(is_default) WHERE is_default = 1;

CREATE TABLE IF NOT EXISTS accounting_fiscal_years (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, status TEXT NOT NULL,
 is_current INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 closed_at TEXT, version INTEGER NOT NULL DEFAULT 1,
 CHECK(end_date >= start_date), CHECK(status IN ('planned','open','closing','closed','archived')), CHECK(is_current IN (0,1))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_fiscal_year_current ON accounting_fiscal_years(is_current) WHERE is_current = 1;

CREATE TABLE IF NOT EXISTS accounting_periods (
 id TEXT PRIMARY KEY, fiscal_year_id TEXT NOT NULL, period_number INTEGER NOT NULL, name TEXT NOT NULL,
 start_date TEXT NOT NULL, end_date TEXT NOT NULL, status TEXT NOT NULL,
 opened_at TEXT, closed_at TEXT, locked_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), version INTEGER NOT NULL DEFAULT 1,
 FOREIGN KEY(fiscal_year_id) REFERENCES accounting_fiscal_years(id), UNIQUE(fiscal_year_id, period_number),
 CHECK(end_date >= start_date), CHECK(status IN ('future','open','soft_closed','closed','locked'))
);
CREATE INDEX IF NOT EXISTS idx_accounting_period_dates ON accounting_periods(start_date,end_date,status);

CREATE TABLE IF NOT EXISTS accounting_journal_entries (
 id TEXT PRIMARY KEY, entry_number TEXT UNIQUE, entry_date TEXT NOT NULL, posting_date TEXT, description TEXT NOT NULL, memo TEXT,
 status TEXT NOT NULL DEFAULT 'draft', source_type TEXT NOT NULL DEFAULT 'manual', source_id TEXT, source_event_id TEXT, external_reference TEXT,
 fiscal_year_id TEXT, accounting_period_id TEXT, currency TEXT NOT NULL DEFAULT 'USD', total_debits INTEGER NOT NULL DEFAULT 0, total_credits INTEGER NOT NULL DEFAULT 0,
 created_by_actor_type TEXT NOT NULL, created_by_actor_id TEXT NOT NULL, posted_by_actor_type TEXT, posted_by_actor_id TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), posted_at TEXT, reversed_at TEXT, voided_at TEXT,
 void_reason TEXT, version INTEGER NOT NULL DEFAULT 1, correlation_id TEXT,
 FOREIGN KEY(fiscal_year_id) REFERENCES accounting_fiscal_years(id), FOREIGN KEY(accounting_period_id) REFERENCES accounting_periods(id),
 CHECK(status IN ('draft','pending','posted','reversed','voided')), CHECK(total_debits >= 0), CHECK(total_credits >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_entry_source ON accounting_journal_entries(source_type,source_id) WHERE source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS accounting_journal_lines (
 id TEXT PRIMARY KEY, journal_entry_id TEXT NOT NULL, line_number INTEGER NOT NULL, account_id TEXT NOT NULL, fund_id TEXT NOT NULL,
 description TEXT, debit_amount INTEGER NOT NULL DEFAULT 0, credit_amount INTEGER NOT NULL DEFAULT 0, source_detail_type TEXT, source_detail_id TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 FOREIGN KEY(journal_entry_id) REFERENCES accounting_journal_entries(id), FOREIGN KEY(account_id) REFERENCES accounting_accounts(id), FOREIGN KEY(fund_id) REFERENCES accounting_funds(id),
 UNIQUE(journal_entry_id,line_number), CHECK(debit_amount >= 0), CHECK(credit_amount >= 0),
 CHECK((debit_amount > 0 AND credit_amount = 0) OR (credit_amount > 0 AND debit_amount = 0))
);
CREATE INDEX IF NOT EXISTS idx_accounting_lines_account ON accounting_journal_lines(account_id,journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_accounting_lines_fund ON accounting_journal_lines(fund_id,journal_entry_id);

CREATE TABLE IF NOT EXISTS accounting_entry_links (
 id TEXT PRIMARY KEY, journal_entry_id TEXT NOT NULL, source_type TEXT NOT NULL, source_id TEXT NOT NULL, relationship_type TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(journal_entry_id) REFERENCES accounting_journal_entries(id),
 UNIQUE(source_type,source_id,relationship_type)
);

CREATE TABLE IF NOT EXISTS accounting_posting_idempotency (
 id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE, operation_type TEXT NOT NULL, source_type TEXT, source_id TEXT,
 request_hash TEXT NOT NULL, journal_entry_id TEXT, result_status TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), completed_at TEXT, expires_at TEXT,
 FOREIGN KEY(journal_entry_id) REFERENCES accounting_journal_entries(id), UNIQUE(source_type,source_id,operation_type)
);

CREATE TABLE IF NOT EXISTS accounting_opening_balance_batches (
 id TEXT PRIMARY KEY, effective_date TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', source_system TEXT,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), posted_at TEXT, journal_entry_id TEXT UNIQUE, version INTEGER NOT NULL DEFAULT 1,
 FOREIGN KEY(journal_entry_id) REFERENCES accounting_journal_entries(id), CHECK(status IN ('draft','posted','voided'))
);
CREATE TABLE IF NOT EXISTS accounting_opening_balance_lines (
 id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, account_id TEXT NOT NULL, fund_id TEXT NOT NULL, debit_amount INTEGER NOT NULL DEFAULT 0,
 credit_amount INTEGER NOT NULL DEFAULT 0, description TEXT, FOREIGN KEY(batch_id) REFERENCES accounting_opening_balance_batches(id),
 FOREIGN KEY(account_id) REFERENCES accounting_accounts(id), FOREIGN KEY(fund_id) REFERENCES accounting_funds(id),
 CHECK(debit_amount >= 0), CHECK(credit_amount >= 0), CHECK((debit_amount > 0 AND credit_amount = 0) OR (credit_amount > 0 AND debit_amount = 0))
);

CREATE TABLE IF NOT EXISTS accounting_period_locks (
 id TEXT PRIMARY KEY, accounting_period_id TEXT NOT NULL, lock_type TEXT NOT NULL, locked_by_actor_type TEXT NOT NULL, locked_by_actor_id TEXT NOT NULL,
 reason TEXT NOT NULL, locked_at TEXT NOT NULL DEFAULT (datetime('now')), unlocked_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
 FOREIGN KEY(accounting_period_id) REFERENCES accounting_periods(id), CHECK(lock_type IN ('soft_close','hard_close','audit_lock','system_lock'))
);

CREATE TABLE IF NOT EXISTS accounting_ledger_events (
 id TEXT PRIMARY KEY, event_type TEXT NOT NULL, journal_entry_id TEXT, related_entry_id TEXT, actor_type TEXT NOT NULL, actor_id TEXT,
 reason_code TEXT, correlation_id TEXT, metadata_json TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
 FOREIGN KEY(journal_entry_id) REFERENCES accounting_journal_entries(id), FOREIGN KEY(related_entry_id) REFERENCES accounting_journal_entries(id)
);
CREATE INDEX IF NOT EXISTS idx_accounting_ledger_events_entry ON accounting_ledger_events(journal_entry_id,created_at);

CREATE TRIGGER IF NOT EXISTS accounting_posted_entry_immutable BEFORE UPDATE ON accounting_journal_entries
WHEN OLD.status IN ('posted','reversed') AND (NEW.entry_date<>OLD.entry_date OR COALESCE(NEW.posting_date,'')<>COALESCE(OLD.posting_date,'') OR NEW.description<>OLD.description OR NEW.source_type<>OLD.source_type OR COALESCE(NEW.source_id,'')<>COALESCE(OLD.source_id,'') OR NEW.total_debits<>OLD.total_debits OR NEW.total_credits<>OLD.total_credits)
BEGIN SELECT RAISE(ABORT,'posted journal entry is immutable'); END;
CREATE TRIGGER IF NOT EXISTS accounting_posted_lines_no_insert BEFORE INSERT ON accounting_journal_lines
WHEN (SELECT status FROM accounting_journal_entries WHERE id=NEW.journal_entry_id) IN ('posted','reversed')
BEGIN SELECT RAISE(ABORT,'posted journal lines are immutable'); END;
CREATE TRIGGER IF NOT EXISTS accounting_posted_lines_no_update BEFORE UPDATE ON accounting_journal_lines
WHEN (SELECT status FROM accounting_journal_entries WHERE id=OLD.journal_entry_id) IN ('posted','reversed')
BEGIN SELECT RAISE(ABORT,'posted journal lines are immutable'); END;
CREATE TRIGGER IF NOT EXISTS accounting_posted_lines_no_delete BEFORE DELETE ON accounting_journal_lines
WHEN (SELECT status FROM accounting_journal_entries WHERE id=OLD.journal_entry_id) IN ('posted','reversed')
BEGIN SELECT RAISE(ABORT,'posted journal lines are immutable'); END;
