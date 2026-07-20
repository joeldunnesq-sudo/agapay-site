-- Phase 2E: bank accounts, imports, matching, and reconciliation (parish database only).
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS accounting_bank_accounts (
 id TEXT PRIMARY KEY,name TEXT NOT NULL,account_id TEXT NOT NULL UNIQUE,account_type TEXT NOT NULL,institution_name TEXT,
 masked_last4 TEXT,currency TEXT NOT NULL DEFAULT 'USD',settlement_profile_id TEXT,stripe_external_account_id TEXT,
 is_default INTEGER NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'active',opening_statement_date TEXT,
 created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),archived_at TEXT,version INTEGER NOT NULL DEFAULT 1,
 FOREIGN KEY(account_id) REFERENCES accounting_accounts(id),CHECK(account_type IN('checking','savings','money_market','cash','other')),
 CHECK(status IN('active','inactive','archived','blocked')),CHECK(is_default IN(0,1)),CHECK(is_active IN(0,1)),CHECK(masked_last4 IS NULL OR length(masked_last4)<=4)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_bank_one_default ON accounting_bank_accounts(is_default) WHERE is_default=1 AND is_active=1;
CREATE TABLE IF NOT EXISTS accounting_bank_import_files (
 id TEXT PRIMARY KEY,bank_account_id TEXT NOT NULL,filename TEXT NOT NULL,file_type TEXT NOT NULL DEFAULT 'csv',file_hash TEXT NOT NULL,
 statement_start_date TEXT,statement_end_date TEXT,row_count INTEGER NOT NULL DEFAULT 0,imported_count INTEGER NOT NULL DEFAULT 0,
 duplicate_count INTEGER NOT NULL DEFAULT 0,error_count INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'uploaded',
 created_by_actor_type TEXT NOT NULL,created_by_actor_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now')),completed_at TEXT,version INTEGER NOT NULL DEFAULT 1,
 FOREIGN KEY(bank_account_id) REFERENCES accounting_bank_accounts(id),UNIQUE(bank_account_id,file_hash),CHECK(status IN('uploaded','parsing','preview_ready','importing','completed','failed','canceled'))
);
CREATE TABLE IF NOT EXISTS accounting_bank_transactions (
 id TEXT PRIMARY KEY,bank_account_id TEXT NOT NULL,source_type TEXT NOT NULL,source_file_id TEXT,external_transaction_id TEXT,
 statement_date TEXT,posted_date TEXT NOT NULL,effective_date TEXT,description TEXT NOT NULL,normalized_description TEXT NOT NULL,
 reference_number TEXT,check_number TEXT,amount INTEGER NOT NULL,direction TEXT NOT NULL,currency TEXT NOT NULL DEFAULT 'USD',transaction_type TEXT,
 status TEXT NOT NULL DEFAULT 'imported',match_status TEXT NOT NULL DEFAULT 'unmatched',matched_amount INTEGER NOT NULL DEFAULT 0,
 unmatched_amount INTEGER NOT NULL,duplicate_hash TEXT NOT NULL,raw_row_hash TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now')),
 updated_at TEXT NOT NULL DEFAULT(datetime('now')),version INTEGER NOT NULL DEFAULT 1,
 FOREIGN KEY(bank_account_id) REFERENCES accounting_bank_accounts(id),FOREIGN KEY(source_file_id) REFERENCES accounting_bank_import_files(id),
 UNIQUE(bank_account_id,duplicate_hash),CHECK(source_type IN('csv','manual','stripe_payout','bank_feed_future')),CHECK(direction IN('debit','credit')),
 CHECK(status IN('imported','ignored','superseded','deleted_before_reconciliation')),CHECK(match_status IN('unmatched','partially_matched','matched','excluded','exception')),
 CHECK(amount>0 AND matched_amount>=0 AND unmatched_amount>=0 AND matched_amount+unmatched_amount=amount)
);
CREATE INDEX IF NOT EXISTS idx_accounting_bank_transactions_match ON accounting_bank_transactions(bank_account_id,match_status,posted_date);
CREATE TABLE IF NOT EXISTS accounting_reconciliation_settings (
 id TEXT PRIMARY KEY CHECK(id='primary'),default_reconciliation_bank_account_id TEXT,automatic_match_enabled INTEGER NOT NULL DEFAULT 0,
 automatic_match_confidence_threshold INTEGER NOT NULL DEFAULT 100,date_match_tolerance_days INTEGER NOT NULL DEFAULT 3,
 amount_tolerance_minor_units INTEGER NOT NULL DEFAULT 0,stale_check_days INTEGER NOT NULL DEFAULT 90,stale_deposit_days INTEGER NOT NULL DEFAULT 10,
 require_separate_reviewer INTEGER NOT NULL DEFAULT 0,allow_reopen INTEGER NOT NULL DEFAULT 1,settings_version INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL DEFAULT(datetime('now')),FOREIGN KEY(default_reconciliation_bank_account_id) REFERENCES accounting_bank_accounts(id)
);
INSERT OR IGNORE INTO accounting_reconciliation_settings(id) VALUES('primary');
CREATE TABLE IF NOT EXISTS accounting_reconciliation_sessions (
 id TEXT PRIMARY KEY,bank_account_id TEXT NOT NULL,statement_start_date TEXT NOT NULL,statement_end_date TEXT NOT NULL,
 statement_beginning_balance INTEGER NOT NULL,statement_ending_balance INTEGER NOT NULL,ledger_beginning_balance INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'draft',cleared_deposits INTEGER NOT NULL DEFAULT 0,cleared_withdrawals INTEGER NOT NULL DEFAULT 0,
 adjustments INTEGER NOT NULL DEFAULT 0,calculated_ending_balance INTEGER NOT NULL DEFAULT 0,difference INTEGER NOT NULL DEFAULT 0,
 created_by_actor_type TEXT NOT NULL,created_by_actor_id TEXT NOT NULL,completed_by_actor_type TEXT,completed_by_actor_id TEXT,
 created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),completed_at TEXT,reopened_at TEXT,
 void_reason TEXT,version INTEGER NOT NULL DEFAULT 1,correlation_id TEXT,FOREIGN KEY(bank_account_id) REFERENCES accounting_bank_accounts(id),
 CHECK(status IN('draft','in_progress','ready_to_complete','completed','reopened','voided')),CHECK(statement_end_date>=statement_start_date)
);
CREATE INDEX IF NOT EXISTS idx_accounting_reconciliation_sessions_bank ON accounting_reconciliation_sessions(bank_account_id,statement_end_date,status);
CREATE TABLE IF NOT EXISTS accounting_reconciliation_items (
 id TEXT PRIMARY KEY,reconciliation_session_id TEXT NOT NULL,bank_transaction_id TEXT NOT NULL,journal_entry_id TEXT NOT NULL,journal_line_id TEXT NOT NULL,
 match_group_id TEXT NOT NULL,matched_amount INTEGER NOT NULL,match_type TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'confirmed',
 created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),
 FOREIGN KEY(reconciliation_session_id) REFERENCES accounting_reconciliation_sessions(id),FOREIGN KEY(bank_transaction_id) REFERENCES accounting_bank_transactions(id),
 FOREIGN KEY(journal_entry_id) REFERENCES accounting_journal_entries(id),FOREIGN KEY(journal_line_id) REFERENCES accounting_journal_lines(id),
 UNIQUE(reconciliation_session_id,bank_transaction_id,journal_line_id,match_group_id),CHECK(matched_amount>0),
 CHECK(match_type IN('one_to_one','one_to_many','many_to_one','many_to_many','manual_adjustment','stripe_payout')),CHECK(status IN('proposed','confirmed','removed','exception'))
);
CREATE INDEX IF NOT EXISTS idx_accounting_reconciliation_items_line ON accounting_reconciliation_items(journal_line_id,status);
CREATE TABLE IF NOT EXISTS accounting_reconciliation_snapshots (
 id TEXT PRIMARY KEY,reconciliation_session_id TEXT NOT NULL,statement_beginning_balance INTEGER NOT NULL,statement_ending_balance INTEGER NOT NULL,
 adjusted_bank_balance INTEGER NOT NULL,ledger_ending_balance INTEGER NOT NULL,adjusted_ledger_balance INTEGER NOT NULL,
 outstanding_deposits INTEGER NOT NULL,outstanding_withdrawals INTEGER NOT NULL,adjustments_total INTEGER NOT NULL,difference INTEGER NOT NULL,
 completed_at TEXT NOT NULL,completed_by_actor_type TEXT NOT NULL,completed_by_actor_id TEXT NOT NULL,snapshot_hash TEXT NOT NULL,
 FOREIGN KEY(reconciliation_session_id) REFERENCES accounting_reconciliation_sessions(id)
);
