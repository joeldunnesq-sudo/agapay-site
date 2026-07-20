-- Phase 3D: close workflows, adjustments, accountant handoff, and audit readiness.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounting_close_policies (
 id TEXT PRIMARY KEY DEFAULT 'primary', require_all_bank_accounts_reconciled INTEGER NOT NULL DEFAULT 0,
 require_stripe_clearing_validation INTEGER NOT NULL DEFAULT 1, require_no_open_journal_drafts INTEGER NOT NULL DEFAULT 0,
 require_no_integration_exceptions INTEGER NOT NULL DEFAULT 0, require_ap_review INTEGER NOT NULL DEFAULT 1,
 require_budget_review INTEGER NOT NULL DEFAULT 1, require_commerce_review INTEGER NOT NULL DEFAULT 1,
 require_sales_tax_review INTEGER NOT NULL DEFAULT 1, require_inventory_cost_review INTEGER NOT NULL DEFAULT 0,
 allow_warning_waivers INTEGER NOT NULL DEFAULT 1, require_separate_reviewer INTEGER NOT NULL DEFAULT 0,
 small_parish_mode INTEGER NOT NULL DEFAULT 1, policy_version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO accounting_close_policies(id) VALUES('primary');

CREATE TABLE IF NOT EXISTS accounting_close_sessions (
 id TEXT PRIMARY KEY, close_type TEXT NOT NULL, fiscal_year_id TEXT NOT NULL, accounting_period_id TEXT,
 status TEXT NOT NULL DEFAULT 'draft', initiated_by_actor_type TEXT NOT NULL, initiated_by_actor_id TEXT NOT NULL,
 reviewed_by_actor_type TEXT, reviewed_by_actor_id TEXT, approved_by_actor_type TEXT, approved_by_actor_id TEXT,
 started_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), last_validated_at TEXT, reviewed_at TEXT, approved_at TEXT,
 completed_at TEXT, reopened_at TEXT, voided_at TEXT, reopen_reason TEXT, version INTEGER NOT NULL DEFAULT 1,
 correlation_id TEXT, FOREIGN KEY(fiscal_year_id) REFERENCES accounting_fiscal_years(id),
 FOREIGN KEY(accounting_period_id) REFERENCES accounting_periods(id),
 CHECK(close_type IN ('month_end','quarter_end','year_end','special')),
 CHECK(status IN ('draft','validating','blocked','ready_for_review','reviewed','approved','completed','reopened','voided'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_close_active_period ON accounting_close_sessions(accounting_period_id,close_type)
 WHERE status NOT IN ('completed','voided','reopened') AND accounting_period_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_close_fiscal_status ON accounting_close_sessions(fiscal_year_id,status,started_at);

CREATE TABLE IF NOT EXISTS accounting_close_checks (
 id TEXT PRIMARY KEY, close_session_id TEXT NOT NULL, check_code TEXT NOT NULL, category TEXT NOT NULL,
 label TEXT NOT NULL, description TEXT, check_origin TEXT NOT NULL DEFAULT 'automatic', status TEXT NOT NULL,
 severity TEXT NOT NULL, blocking INTEGER NOT NULL DEFAULT 0, details_json TEXT,
 resolved_by_actor_type TEXT, resolved_by_actor_id TEXT, resolved_at TEXT, resolution_note TEXT,
 source_reference_type TEXT, source_reference_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now')), version INTEGER NOT NULL DEFAULT 1,
 FOREIGN KEY(close_session_id) REFERENCES accounting_close_sessions(id), UNIQUE(close_session_id,check_code),
 CHECK(check_origin IN ('automatic','human_review')),
 CHECK(status IN ('pending','passed','warning','failed','waived','not_applicable')),
 CHECK(severity IN ('information','warning','error','critical')), CHECK(blocking IN (0,1))
);
CREATE INDEX IF NOT EXISTS idx_close_checks_status ON accounting_close_checks(close_session_id,status,blocking);

CREATE TABLE IF NOT EXISTS accounting_adjustments (
 id TEXT PRIMARY KEY, close_session_id TEXT, journal_entry_id TEXT UNIQUE, adjustment_type TEXT NOT NULL,
 effective_date TEXT NOT NULL, reason TEXT NOT NULL, supporting_memo TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
 auto_reverse INTEGER NOT NULL DEFAULT 0, reversal_date TEXT, reversal_period_id TEXT, reversal_status TEXT,
 reversal_journal_entry_id TEXT, created_by_actor_type TEXT NOT NULL, created_by_actor_id TEXT NOT NULL,
 posted_at TEXT, reversed_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now')), version INTEGER NOT NULL DEFAULT 1, correlation_id TEXT,
 FOREIGN KEY(close_session_id) REFERENCES accounting_close_sessions(id), FOREIGN KEY(journal_entry_id) REFERENCES accounting_journal_entries(id),
 FOREIGN KEY(reversal_period_id) REFERENCES accounting_periods(id), FOREIGN KEY(reversal_journal_entry_id) REFERENCES accounting_journal_entries(id),
 CHECK(adjustment_type IN ('accrual','deferral','prepaid_expense','accrued_expense','accrued_revenue','reclassification','correction','fund_reclassification','bank_adjustment','inventory_adjustment','accounts_payable_adjustment','other')),
 CHECK(status IN ('draft','posted','reversed','voided')), CHECK(auto_reverse IN (0,1)),
 CHECK(reversal_status IS NULL OR reversal_status IN ('scheduled','processing','completed','exception','canceled'))
);
CREATE INDEX IF NOT EXISTS idx_adjustments_close ON accounting_adjustments(close_session_id,status);
CREATE INDEX IF NOT EXISTS idx_adjustments_reversal ON accounting_adjustments(reversal_status,reversal_date);

CREATE TABLE IF NOT EXISTS accounting_adjustment_templates (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, frequency TEXT NOT NULL, default_description TEXT NOT NULL,
 default_lines_json TEXT NOT NULL, default_lines_version INTEGER NOT NULL DEFAULT 1, next_run_date TEXT,
 end_date TEXT, auto_create_draft INTEGER NOT NULL DEFAULT 1, auto_reverse INTEGER NOT NULL DEFAULT 0,
 is_active INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now')), archived_at TEXT, version INTEGER NOT NULL DEFAULT 1,
 CHECK(frequency IN ('monthly','quarterly','annually','custom'))
);
CREATE TABLE IF NOT EXISTS accounting_adjustment_template_runs (
 id TEXT PRIMARY KEY, template_id TEXT NOT NULL, scheduled_date TEXT NOT NULL, adjustment_id TEXT,
 status TEXT NOT NULL, exception_code TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
 FOREIGN KEY(template_id) REFERENCES accounting_adjustment_templates(id),
 FOREIGN KEY(adjustment_id) REFERENCES accounting_adjustments(id), UNIQUE(template_id,scheduled_date)
);

CREATE TABLE IF NOT EXISTS accounting_net_asset_mappings (
 id TEXT PRIMARY KEY DEFAULT 'primary', unrestricted_net_assets_account_id TEXT NOT NULL DEFAULT 'acct_3000',
 restricted_net_assets_account_id TEXT NOT NULL DEFAULT 'acct_3100', board_designated_net_assets_account_id TEXT,
 temporary_closing_account_id TEXT, closing_method TEXT NOT NULL DEFAULT 'direct', version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 FOREIGN KEY(unrestricted_net_assets_account_id) REFERENCES accounting_accounts(id),
 FOREIGN KEY(restricted_net_assets_account_id) REFERENCES accounting_accounts(id),
 FOREIGN KEY(board_designated_net_assets_account_id) REFERENCES accounting_accounts(id),
 CHECK(closing_method IN ('direct','income_summary'))
);
INSERT OR IGNORE INTO accounting_net_asset_mappings(id) VALUES('primary');

CREATE TABLE IF NOT EXISTS accounting_fiscal_year_closes (
 id TEXT PRIMARY KEY, fiscal_year_id TEXT NOT NULL, close_session_id TEXT NOT NULL, closing_date TEXT NOT NULL,
 closing_entry_id TEXT UNIQUE, status TEXT NOT NULL DEFAULT 'draft', pre_close_trial_balance_hash TEXT,
 post_close_trial_balance_hash TEXT, revenue_total INTEGER NOT NULL DEFAULT 0, expense_total INTEGER NOT NULL DEFAULT 0,
 change_in_net_assets INTEGER NOT NULL DEFAULT 0, restricted_change INTEGER NOT NULL DEFAULT 0,
 unrestricted_change INTEGER NOT NULL DEFAULT 0, completed_by_actor_type TEXT, completed_by_actor_id TEXT,
 completed_at TEXT, reopened_at TEXT, version INTEGER NOT NULL DEFAULT 1, correlation_id TEXT,
 FOREIGN KEY(fiscal_year_id) REFERENCES accounting_fiscal_years(id), FOREIGN KEY(close_session_id) REFERENCES accounting_close_sessions(id),
 FOREIGN KEY(closing_entry_id) REFERENCES accounting_journal_entries(id),
 CHECK(status IN ('draft','validated','ready_to_close','closing','completed','failed','reopened','superseded'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_year_close_active ON accounting_fiscal_year_closes(fiscal_year_id)
 WHERE status NOT IN ('reopened','superseded','failed');

CREATE TABLE IF NOT EXISTS accounting_close_snapshots (
 id TEXT PRIMARY KEY, close_session_id TEXT NOT NULL, sequence_number INTEGER NOT NULL, snapshot_type TEXT NOT NULL,
 snapshot_json TEXT NOT NULL, snapshot_hash TEXT NOT NULL, created_by_actor_type TEXT NOT NULL,
 created_by_actor_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
 FOREIGN KEY(close_session_id) REFERENCES accounting_close_sessions(id), UNIQUE(close_session_id,sequence_number),
 CHECK(snapshot_type IN ('month_end','quarter_end','year_end','special'))
);

CREATE TABLE IF NOT EXISTS accounting_accountant_exports (
 id TEXT PRIMARY KEY, fiscal_year_id TEXT NOT NULL, close_session_id TEXT, status TEXT NOT NULL DEFAULT 'pending',
 request_hash TEXT NOT NULL, format TEXT NOT NULL DEFAULT 'csv_bundle', manifest_json TEXT, package_json TEXT,
 expires_at TEXT, generated_by_actor_type TEXT NOT NULL, generated_by_actor_id TEXT NOT NULL,
 requested_at TEXT NOT NULL DEFAULT (datetime('now')), completed_at TEXT, downloaded_at TEXT, version INTEGER NOT NULL DEFAULT 1,
 FOREIGN KEY(fiscal_year_id) REFERENCES accounting_fiscal_years(id), FOREIGN KEY(close_session_id) REFERENCES accounting_close_sessions(id),
 UNIQUE(fiscal_year_id,request_hash), CHECK(status IN ('pending','generating','completed','failed','canceled','expired'))
);

CREATE TABLE IF NOT EXISTS accounting_retention_settings (
 id TEXT PRIMARY KEY DEFAULT 'primary', accounting_records_retention_years INTEGER NOT NULL DEFAULT 7,
 bank_statement_retention_years INTEGER NOT NULL DEFAULT 7, invoice_retention_years INTEGER NOT NULL DEFAULT 7,
 audit_log_retention_years INTEGER NOT NULL DEFAULT 7, attachment_retention_years INTEGER NOT NULL DEFAULT 7,
 close_packet_retention_years INTEGER NOT NULL DEFAULT 7, allow_legal_hold INTEGER NOT NULL DEFAULT 1,
 retention_policy_version INTEGER NOT NULL DEFAULT 1, updated_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO accounting_retention_settings(id) VALUES('primary');
CREATE TABLE IF NOT EXISTS accounting_legal_holds (
 id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, hold_reason TEXT NOT NULL,
 placed_by TEXT NOT NULL, placed_at TEXT NOT NULL DEFAULT (datetime('now')), released_by TEXT, released_at TEXT,
 status TEXT NOT NULL DEFAULT 'active', version INTEGER NOT NULL DEFAULT 1, CHECK(status IN ('active','released'))
);
CREATE INDEX IF NOT EXISTS idx_legal_holds_entity ON accounting_legal_holds(entity_type,entity_id,status);

CREATE TRIGGER IF NOT EXISTS accounting_close_snapshot_immutable_update BEFORE UPDATE ON accounting_close_snapshots
BEGIN SELECT RAISE(ABORT,'close snapshot is immutable'); END;
CREATE TRIGGER IF NOT EXISTS accounting_close_snapshot_immutable_delete BEFORE DELETE ON accounting_close_snapshots
BEGIN SELECT RAISE(ABORT,'close snapshot is immutable'); END;
