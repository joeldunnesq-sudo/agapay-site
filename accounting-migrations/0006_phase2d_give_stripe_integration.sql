-- Phase 2D: AGAPAY Give and Stripe accounting integration (parish database only).
PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO accounting_accounts
  (id,account_number,name,account_type_id,normal_balance,is_posting_account,is_system,requires_fund)
VALUES
  ('acct_1110','1110','Stripe Clearing','type_asset','debit',1,1,1),
  ('acct_4020','4020','Restricted Contributions','type_revenue','credit',1,1,1);

CREATE TABLE IF NOT EXISTS accounting_integration_settings (
  id TEXT PRIMARY KEY CHECK(id='give_stripe'), give_posting_enabled INTEGER NOT NULL DEFAULT 0,
  stripe_posting_enabled INTEGER NOT NULL DEFAULT 0, posting_mode TEXT NOT NULL DEFAULT 'review_required',
  integration_start_date TEXT, default_contribution_account_id TEXT, default_fund_id TEXT,
  stripe_clearing_account_id TEXT, stripe_fee_expense_account_id TEXT, default_bank_account_id TEXT,
  refund_accounting_method TEXT NOT NULL DEFAULT 'reverse_original_revenue',
  dispute_accounting_method TEXT NOT NULL DEFAULT 'reverse_original_revenue',
  closed_period_policy TEXT NOT NULL DEFAULT 'hold', settings_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT(datetime('now')), updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  FOREIGN KEY(default_contribution_account_id) REFERENCES accounting_accounts(id),
  FOREIGN KEY(default_fund_id) REFERENCES accounting_funds(id),
  FOREIGN KEY(stripe_clearing_account_id) REFERENCES accounting_accounts(id),
  FOREIGN KEY(stripe_fee_expense_account_id) REFERENCES accounting_accounts(id),
  FOREIGN KEY(default_bank_account_id) REFERENCES accounting_accounts(id),
  CHECK(give_posting_enabled IN(0,1)), CHECK(stripe_posting_enabled IN(0,1)),
  CHECK(posting_mode IN('automatic','review_required')), CHECK(closed_period_policy IN('hold','next_open_period'))
);
INSERT OR IGNORE INTO accounting_integration_settings
  (id,default_contribution_account_id,default_fund_id,stripe_clearing_account_id,stripe_fee_expense_account_id,default_bank_account_id)
VALUES ('give_stripe','acct_4010','fund_general','acct_1110','acct_5840','acct_1010');

CREATE TABLE IF NOT EXISTS accounting_source_mappings (
  id TEXT PRIMARY KEY, source_system TEXT NOT NULL, source_type TEXT NOT NULL, source_subtype TEXT,
  source_object_id TEXT, revenue_stream_id TEXT, settlement_profile_id TEXT,
  revenue_account_id TEXT, fee_expense_account_id TEXT, clearing_account_id TEXT,
  refund_account_id TEXT, dispute_account_id TEXT, bank_account_id TEXT, fund_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1, effective_from TEXT, effective_to TEXT,
  version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT(datetime('now')),
  updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  FOREIGN KEY(revenue_account_id) REFERENCES accounting_accounts(id), FOREIGN KEY(fee_expense_account_id) REFERENCES accounting_accounts(id),
  FOREIGN KEY(clearing_account_id) REFERENCES accounting_accounts(id), FOREIGN KEY(refund_account_id) REFERENCES accounting_accounts(id),
  FOREIGN KEY(dispute_account_id) REFERENCES accounting_accounts(id), FOREIGN KEY(bank_account_id) REFERENCES accounting_accounts(id),
  FOREIGN KEY(fund_id) REFERENCES accounting_funds(id), CHECK(is_active IN(0,1))
);
CREATE INDEX IF NOT EXISTS idx_accounting_source_mappings_lookup ON accounting_source_mappings(source_system,source_type,source_object_id,is_active);

CREATE TABLE IF NOT EXISTS accounting_integration_source_events (
  id TEXT PRIMARY KEY, source_system TEXT NOT NULL, source_type TEXT NOT NULL, source_event_id TEXT NOT NULL,
  source_object_id TEXT NOT NULL, event_version INTEGER NOT NULL DEFAULT 1, occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'USD', gross_amount INTEGER NOT NULL DEFAULT 0,
  fee_amount INTEGER NOT NULL DEFAULT 0, net_amount INTEGER NOT NULL DEFAULT 0, refund_amount INTEGER NOT NULL DEFAULT 0,
  dispute_amount INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'received', mapping_status TEXT NOT NULL DEFAULT 'pending',
  posting_status TEXT NOT NULL DEFAULT 'unposted', journal_entry_id TEXT, reversal_entry_id TEXT,
  original_source_event_id TEXT, donation_id TEXT, payment_intent_id TEXT, charge_id TEXT, balance_transaction_id TEXT,
  refund_id TEXT, dispute_id TEXT, payout_id TEXT, revenue_stream_id TEXT, settlement_profile_id TEXT,
  donation_type TEXT, campaign_id TEXT, designated_fund_id TEXT, donor_restricted INTEGER NOT NULL DEFAULT 0,
  fee_coverage_amount INTEGER NOT NULL DEFAULT 0, correlation_id TEXT, payload_hash TEXT NOT NULL,
  exception_code TEXT, exception_message TEXT, ignored_reason TEXT, proposal_json TEXT,
  created_at TEXT NOT NULL DEFAULT(datetime('now')), updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  FOREIGN KEY(journal_entry_id) REFERENCES accounting_journal_entries(id), FOREIGN KEY(reversal_entry_id) REFERENCES accounting_journal_entries(id),
  UNIQUE(source_system,source_event_id), UNIQUE(source_system,source_type,source_object_id,event_version),
  CHECK(status IN('received','waiting_for_source','waiting_for_mapping','ready_to_post','waiting_for_review','posting','posted','exception','ignored','superseded')),
  CHECK(mapping_status IN('pending','resolved','missing','invalid')), CHECK(posting_status IN('unposted','pending_review','posting','posted','failed','ignored')),
  CHECK(gross_amount>=0 AND fee_amount>=0 AND refund_amount>=0 AND dispute_amount>=0 AND fee_coverage_amount>=0)
);
CREATE INDEX IF NOT EXISTS idx_accounting_integration_events_queue ON accounting_integration_source_events(status,occurred_at);
CREATE INDEX IF NOT EXISTS idx_accounting_integration_events_object ON accounting_integration_source_events(source_system,source_object_id);

CREATE TABLE IF NOT EXISTS accounting_payout_composition (
  payout_id TEXT NOT NULL, balance_transaction_id TEXT NOT NULL, source_event_id TEXT,
  amount INTEGER NOT NULL, currency TEXT NOT NULL, source_type TEXT NOT NULL,
  included_at TEXT NOT NULL DEFAULT(datetime('now')), PRIMARY KEY(payout_id,balance_transaction_id)
);

CREATE TABLE IF NOT EXISTS accounting_integration_backfills (
  id TEXT PRIMARY KEY, start_date TEXT NOT NULL, end_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'previewed',
  dry_run INTEGER NOT NULL DEFAULT 1, review_required INTEGER NOT NULL DEFAULT 1, maximum_batch_size INTEGER NOT NULL DEFAULT 100,
  cursor TEXT, events_found INTEGER NOT NULL DEFAULT 0, already_posted INTEGER NOT NULL DEFAULT 0,
  ready_to_post INTEGER NOT NULL DEFAULT 0, exception_count INTEGER NOT NULL DEFAULT 0,
  gross_total INTEGER NOT NULL DEFAULT 0, fee_total INTEGER NOT NULL DEFAULT 0, refund_total INTEGER NOT NULL DEFAULT 0,
  payout_total INTEGER NOT NULL DEFAULT 0, created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT(datetime('now')), updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  CHECK(status IN('previewed','queued','running','completed','failed','canceled')), CHECK(maximum_batch_size BETWEEN 1 AND 500)
);
