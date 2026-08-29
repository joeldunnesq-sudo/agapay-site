PRAGMA defer_foreign_keys=ON;
CREATE TABLE accounting_account_presentations (
  account_id TEXT PRIMARY KEY,
  expense_group TEXT,
  default_fund_id TEXT,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  FOREIGN KEY(account_id) REFERENCES accounting_accounts(id),
  FOREIGN KEY(default_fund_id) REFERENCES accounting_funds(id),
  CHECK(expense_group IS NULL OR expense_group IN('administrative','other'))
);
CREATE TABLE accounting_account_types (
 id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, category TEXT NOT NULL UNIQUE,
 normal_balance TEXT NOT NULL, statement_type TEXT NOT NULL, sort_order INTEGER NOT NULL, is_system INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 CHECK(category IN ('asset','liability','net_asset','revenue','expense')),
 CHECK(normal_balance IN ('debit','credit')), CHECK(statement_type IN ('balance_sheet','activity_statement')), CHECK(is_system IN (0,1))
);
CREATE TABLE accounting_accountant_exports (
 id TEXT PRIMARY KEY, fiscal_year_id TEXT NOT NULL, close_session_id TEXT, status TEXT NOT NULL DEFAULT 'pending',
 request_hash TEXT NOT NULL, format TEXT NOT NULL DEFAULT 'csv_bundle', manifest_json TEXT, package_json TEXT,
 expires_at TEXT, generated_by_actor_type TEXT NOT NULL, generated_by_actor_id TEXT NOT NULL,
 requested_at TEXT NOT NULL DEFAULT (datetime('now')), completed_at TEXT, downloaded_at TEXT, version INTEGER NOT NULL DEFAULT 1,
 FOREIGN KEY(fiscal_year_id) REFERENCES accounting_fiscal_years(id), FOREIGN KEY(close_session_id) REFERENCES accounting_close_sessions(id),
 UNIQUE(fiscal_year_id,request_hash), CHECK(status IN ('pending','generating','completed','failed','canceled','expired'))
);
CREATE TABLE accounting_accounts (
 id TEXT PRIMARY KEY, account_number TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT,
 account_type_id TEXT NOT NULL, parent_account_id TEXT, normal_balance TEXT NOT NULL,
 is_posting_account INTEGER NOT NULL DEFAULT 1, is_system INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1,
 requires_fund INTEGER NOT NULL DEFAULT 1, cash_flow_classification TEXT, restricted_usage TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), archived_at TEXT, version INTEGER NOT NULL DEFAULT 1,
 FOREIGN KEY(account_type_id) REFERENCES accounting_account_types(id), FOREIGN KEY(parent_account_id) REFERENCES accounting_accounts(id),
 CHECK(parent_account_id IS NULL OR parent_account_id <> id), CHECK(normal_balance IN ('debit','credit')),
 CHECK(is_posting_account IN (0,1)), CHECK(is_system IN (0,1)), CHECK(is_active IN (0,1)), CHECK(requires_fund IN (0,1))
);
CREATE TABLE accounting_adjustment_template_runs (
 id TEXT PRIMARY KEY, template_id TEXT NOT NULL, scheduled_date TEXT NOT NULL, adjustment_id TEXT,
 status TEXT NOT NULL, exception_code TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
 FOREIGN KEY(template_id) REFERENCES accounting_adjustment_templates(id),
 FOREIGN KEY(adjustment_id) REFERENCES accounting_adjustments(id), UNIQUE(template_id,scheduled_date)
);
CREATE TABLE accounting_adjustment_templates (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, frequency TEXT NOT NULL, default_description TEXT NOT NULL,
 default_lines_json TEXT NOT NULL, default_lines_version INTEGER NOT NULL DEFAULT 1, next_run_date TEXT,
 end_date TEXT, auto_create_draft INTEGER NOT NULL DEFAULT 1, auto_reverse INTEGER NOT NULL DEFAULT 0,
 is_active INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now')), archived_at TEXT, version INTEGER NOT NULL DEFAULT 1,
 CHECK(frequency IN ('monthly','quarterly','annually','custom'))
);
CREATE TABLE accounting_adjustments (
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
CREATE TABLE accounting_attachments (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256_hex TEXT NOT NULL,
  storage_status TEXT NOT NULL DEFAULT 'stored',
  uploaded_by_actor_type TEXT NOT NULL,
  uploaded_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  CHECK(entity_type IN ('journal_entry','bill','reconciliation_session')),
  CHECK(storage_status IN ('stored','deleted')),
  CHECK(size_bytes > 0 AND size_bytes <= 10485760)
);
CREATE TABLE accounting_bank_accounts (
 id TEXT PRIMARY KEY,name TEXT NOT NULL,account_id TEXT NOT NULL UNIQUE,account_type TEXT NOT NULL,institution_name TEXT,
 masked_last4 TEXT,currency TEXT NOT NULL DEFAULT 'USD',settlement_profile_id TEXT,stripe_external_account_id TEXT,
 is_default INTEGER NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'active',opening_statement_date TEXT,
 created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),archived_at TEXT,version INTEGER NOT NULL DEFAULT 1,
 FOREIGN KEY(account_id) REFERENCES accounting_accounts(id),CHECK(account_type IN('checking','savings','money_market','cash','other')),
 CHECK(status IN('active','inactive','archived','blocked')),CHECK(is_default IN(0,1)),CHECK(is_active IN(0,1)),CHECK(masked_last4 IS NULL OR length(masked_last4)<=4)
);
CREATE TABLE accounting_bank_import_files (
 id TEXT PRIMARY KEY,bank_account_id TEXT NOT NULL,filename TEXT NOT NULL,file_type TEXT NOT NULL DEFAULT 'csv',file_hash TEXT NOT NULL,
 statement_start_date TEXT,statement_end_date TEXT,row_count INTEGER NOT NULL DEFAULT 0,imported_count INTEGER NOT NULL DEFAULT 0,
 duplicate_count INTEGER NOT NULL DEFAULT 0,error_count INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'uploaded',
 created_by_actor_type TEXT NOT NULL,created_by_actor_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now')),completed_at TEXT,version INTEGER NOT NULL DEFAULT 1,
 FOREIGN KEY(bank_account_id) REFERENCES accounting_bank_accounts(id),UNIQUE(bank_account_id,file_hash),CHECK(status IN('uploaded','parsing','preview_ready','importing','completed','failed','canceled'))
);
CREATE TABLE accounting_bank_transactions (
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
CREATE TABLE accounting_bill_approvals(id TEXT PRIMARY KEY,bill_id TEXT NOT NULL,sequence_number INTEGER NOT NULL,actor_type TEXT NOT NULL,actor_id TEXT NOT NULL,decision TEXT NOT NULL,reason TEXT,decided_at TEXT NOT NULL DEFAULT(datetime('now')),FOREIGN KEY(bill_id) REFERENCES accounting_bills(id),CHECK(decision IN('approved','rejected')));
CREATE TABLE accounting_bill_lines(id TEXT PRIMARY KEY,bill_id TEXT NOT NULL,line_number INTEGER NOT NULL,description TEXT NOT NULL,account_id TEXT NOT NULL,fund_id TEXT NOT NULL,quantity INTEGER NOT NULL DEFAULT 1,unit_amount INTEGER NOT NULL,line_amount INTEGER NOT NULL,tax_amount INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),FOREIGN KEY(bill_id) REFERENCES accounting_bills(id),FOREIGN KEY(account_id) REFERENCES accounting_accounts(id),FOREIGN KEY(fund_id) REFERENCES accounting_funds(id),UNIQUE(bill_id,line_number),CHECK(quantity>0 AND unit_amount>=0 AND line_amount>=0 AND tax_amount>=0));
CREATE TABLE accounting_bills(id TEXT PRIMARY KEY,bill_number TEXT NOT NULL UNIQUE,vendor_id TEXT NOT NULL,vendor_invoice_number TEXT,bill_date TEXT NOT NULL,received_date TEXT,due_date TEXT NOT NULL,posting_date TEXT,description TEXT NOT NULL,memo TEXT,currency TEXT NOT NULL DEFAULT 'USD',status TEXT NOT NULL DEFAULT 'draft',approval_status TEXT NOT NULL DEFAULT 'pending',payment_status TEXT NOT NULL DEFAULT 'unpaid',subtotal_amount INTEGER NOT NULL DEFAULT 0,tax_amount INTEGER NOT NULL DEFAULT 0,total_amount INTEGER NOT NULL DEFAULT 0,amount_paid INTEGER NOT NULL DEFAULT 0,amount_due INTEGER NOT NULL DEFAULT 0,accounts_payable_account_id TEXT NOT NULL DEFAULT 'acct_2000',created_by_actor_type TEXT NOT NULL,created_by_actor_id TEXT NOT NULL,submitted_by_actor_type TEXT,submitted_by_actor_id TEXT,approved_by_actor_type TEXT,approved_by_actor_id TEXT,posted_journal_entry_id TEXT,created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),submitted_at TEXT,approved_at TEXT,posted_at TEXT,voided_at TEXT,version INTEGER NOT NULL DEFAULT 1,correlation_id TEXT,FOREIGN KEY(vendor_id) REFERENCES accounting_vendors(id),FOREIGN KEY(accounts_payable_account_id) REFERENCES accounting_accounts(id),FOREIGN KEY(posted_journal_entry_id) REFERENCES accounting_journal_entries(id),CHECK(status IN('draft','submitted','approved','posted','partially_paid','paid','rejected','voided')),CHECK(approval_status IN('not_required','pending','approved','rejected')),CHECK(payment_status IN('unpaid','scheduled','partially_paid','paid','failed')),CHECK(total_amount>=0 AND amount_paid>=0 AND amount_due>=0));
CREATE TABLE accounting_budget_assumptions(id TEXT PRIMARY KEY,budget_id TEXT NOT NULL,sort_order INTEGER NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),FOREIGN KEY(budget_id) REFERENCES accounting_budgets(id));
CREATE TABLE accounting_budget_events(id TEXT PRIMARY KEY,budget_id TEXT NOT NULL,event_type TEXT NOT NULL,actor_id TEXT NOT NULL,reason TEXT,metadata_json TEXT,created_at TEXT NOT NULL DEFAULT(datetime('now')),FOREIGN KEY(budget_id) REFERENCES accounting_budgets(id));
CREATE TABLE accounting_budget_lines(id TEXT PRIMARY KEY,budget_id TEXT NOT NULL,account_id TEXT NOT NULL,fund_id TEXT NOT NULL,annual_amount INTEGER NOT NULL,january_amount INTEGER NOT NULL DEFAULT 0,february_amount INTEGER NOT NULL DEFAULT 0,march_amount INTEGER NOT NULL DEFAULT 0,april_amount INTEGER NOT NULL DEFAULT 0,may_amount INTEGER NOT NULL DEFAULT 0,june_amount INTEGER NOT NULL DEFAULT 0,july_amount INTEGER NOT NULL DEFAULT 0,august_amount INTEGER NOT NULL DEFAULT 0,september_amount INTEGER NOT NULL DEFAULT 0,october_amount INTEGER NOT NULL DEFAULT 0,november_amount INTEGER NOT NULL DEFAULT 0,december_amount INTEGER NOT NULL DEFAULT 0,allocation_strategy TEXT NOT NULL DEFAULT 'manual',notes TEXT,created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),version INTEGER NOT NULL DEFAULT 1,FOREIGN KEY(budget_id) REFERENCES accounting_budgets(id),FOREIGN KEY(account_id) REFERENCES accounting_accounts(id),FOREIGN KEY(fund_id) REFERENCES accounting_funds(id),UNIQUE(budget_id,account_id,fund_id),CHECK(annual_amount>=0),CHECK(allocation_strategy IN('even_monthly','prior_year_actuals','manual','seasonal','percentage')),
CHECK(annual_amount=january_amount+february_amount+march_amount+april_amount+may_amount+june_amount+july_amount+august_amount+september_amount+october_amount+november_amount+december_amount));
CREATE TABLE accounting_budgets(id TEXT PRIMARY KEY,budget_name TEXT NOT NULL,fiscal_year_id TEXT NOT NULL,version_number INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'draft',description TEXT,revision_notes TEXT,created_by TEXT NOT NULL,approved_by TEXT,locked_by TEXT,created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),submitted_at TEXT,approved_at TEXT,locked_at TEXT,version INTEGER NOT NULL DEFAULT 1,FOREIGN KEY(fiscal_year_id) REFERENCES accounting_fiscal_years(id),UNIQUE(fiscal_year_id,version_number),CHECK(version_number>0),CHECK(status IN('draft','submitted','approved','locked','archived')));
CREATE TABLE accounting_check_print_events(
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  print_sequence INTEGER NOT NULL,
  print_type TEXT NOT NULL DEFAULT 'original',
  printed_by_actor_id TEXT NOT NULL,
  printed_at TEXT NOT NULL DEFAULT(datetime('now')),
  reason TEXT,
  UNIQUE(payment_id,print_sequence),
  FOREIGN KEY(payment_id) REFERENCES accounting_payments(id),
  CHECK(print_type IN('original','reprint'))
);
CREATE TABLE accounting_check_settings(
  bank_account_id TEXT PRIMARY KEY,
  next_check_number INTEGER NOT NULL DEFAULT 1001,
  check_style TEXT NOT NULL DEFAULT 'top_check_two_stubs',
  payer_name TEXT NOT NULL DEFAULT '',
  payer_address TEXT NOT NULL DEFAULT '',
  signature_line_1 TEXT NOT NULL DEFAULT '',
  signature_line_2 TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  CHECK(next_check_number>0),
  FOREIGN KEY(bank_account_id) REFERENCES accounting_bank_accounts(id)
);
CREATE TABLE accounting_close_checks (
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
CREATE TABLE accounting_close_policies (
 id TEXT PRIMARY KEY DEFAULT 'primary', require_all_bank_accounts_reconciled INTEGER NOT NULL DEFAULT 0,
 require_stripe_clearing_validation INTEGER NOT NULL DEFAULT 1, require_no_open_journal_drafts INTEGER NOT NULL DEFAULT 0,
 require_no_integration_exceptions INTEGER NOT NULL DEFAULT 0, require_ap_review INTEGER NOT NULL DEFAULT 1,
 require_budget_review INTEGER NOT NULL DEFAULT 1, require_commerce_review INTEGER NOT NULL DEFAULT 1,
 require_sales_tax_review INTEGER NOT NULL DEFAULT 1, require_inventory_cost_review INTEGER NOT NULL DEFAULT 0,
 allow_warning_waivers INTEGER NOT NULL DEFAULT 1, require_separate_reviewer INTEGER NOT NULL DEFAULT 0,
 small_parish_mode INTEGER NOT NULL DEFAULT 1, policy_version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE accounting_close_sessions (
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
CREATE TABLE accounting_close_snapshots (
 id TEXT PRIMARY KEY, close_session_id TEXT NOT NULL, sequence_number INTEGER NOT NULL, snapshot_type TEXT NOT NULL,
 snapshot_json TEXT NOT NULL, snapshot_hash TEXT NOT NULL, created_by_actor_type TEXT NOT NULL,
 created_by_actor_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
 FOREIGN KEY(close_session_id) REFERENCES accounting_close_sessions(id), UNIQUE(close_session_id,sequence_number),
 CHECK(snapshot_type IN ('month_end','quarter_end','year_end','special'))
);
CREATE TABLE accounting_commerce_items(id TEXT PRIMARY KEY,operational_item_id TEXT NOT NULL UNIQUE,sku TEXT,barcode TEXT,name TEXT NOT NULL,category_id TEXT,revenue_stream_id TEXT,default_revenue_account_id TEXT,default_fund_id TEXT,tax_category_id TEXT,is_taxable INTEGER NOT NULL DEFAULT 0,is_inventory_tracked INTEGER NOT NULL DEFAULT 0,inventory_asset_account_id TEXT,cogs_account_id TEXT,current_unit_cost INTEGER,costing_method TEXT NOT NULL DEFAULT 'manual_cost',quantity_on_hand INTEGER NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),version INTEGER NOT NULL DEFAULT 1,CHECK(current_unit_cost IS NULL OR current_unit_cost>=0),CHECK(costing_method IN('average_cost','manual_cost')));
CREATE TABLE accounting_commerce_mappings(id TEXT PRIMARY KEY,commerce_channel TEXT,revenue_stream_id TEXT,settlement_profile_id TEXT,item_id TEXT,item_category_id TEXT,tax_category_id TEXT,revenue_account_id TEXT,sales_tax_liability_account_id TEXT,fee_expense_account_id TEXT,clearing_account_id TEXT,refund_account_id TEXT,inventory_asset_account_id TEXT,cogs_account_id TEXT,fund_id TEXT,is_inventory_tracked INTEGER NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 1,effective_from TEXT,effective_to TEXT,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),FOREIGN KEY(revenue_account_id) REFERENCES accounting_accounts(id),FOREIGN KEY(sales_tax_liability_account_id) REFERENCES accounting_accounts(id),FOREIGN KEY(fee_expense_account_id) REFERENCES accounting_accounts(id),FOREIGN KEY(clearing_account_id) REFERENCES accounting_accounts(id),FOREIGN KEY(refund_account_id) REFERENCES accounting_accounts(id),FOREIGN KEY(inventory_asset_account_id) REFERENCES accounting_accounts(id),FOREIGN KEY(cogs_account_id) REFERENCES accounting_accounts(id),FOREIGN KEY(fund_id) REFERENCES accounting_funds(id));
CREATE TABLE accounting_commerce_settings(id TEXT PRIMARY KEY CHECK(id='primary'),posting_mode TEXT NOT NULL DEFAULT 'review_required',integration_start_date TEXT,default_revenue_account_id TEXT NOT NULL DEFAULT 'acct_4300',sales_tax_liability_account_id TEXT NOT NULL DEFAULT 'acct_2100',fee_expense_account_id TEXT NOT NULL DEFAULT 'acct_5840',stripe_clearing_account_id TEXT NOT NULL DEFAULT 'acct_1110',cash_account_id TEXT NOT NULL DEFAULT 'acct_1100',external_clearing_account_id TEXT NOT NULL DEFAULT 'acct_1120',refund_account_id TEXT NOT NULL DEFAULT 'acct_4320',inventory_asset_account_id TEXT NOT NULL DEFAULT 'acct_1200',cogs_account_id TEXT NOT NULL DEFAULT 'acct_5700',default_fund_id TEXT NOT NULL DEFAULT 'fund_general',negative_inventory_policy TEXT NOT NULL DEFAULT 'exception',settings_version INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT(datetime('now')),CHECK(posting_mode IN('automatic','review_required')),CHECK(negative_inventory_policy IN('block','exception','allow_with_override')));
CREATE TABLE accounting_commerce_source_items(id TEXT PRIMARY KEY,source_event_id TEXT NOT NULL,operational_item_id TEXT NOT NULL,sku_snapshot TEXT,barcode_snapshot TEXT,name_snapshot TEXT NOT NULL,quantity INTEGER NOT NULL,gross_amount INTEGER NOT NULL,discount_amount INTEGER NOT NULL DEFAULT 0,tax_amount INTEGER NOT NULL DEFAULT 0,refund_amount INTEGER NOT NULL DEFAULT 0,unit_cost_snapshot INTEGER,is_resalable_return INTEGER NOT NULL DEFAULT 1,FOREIGN KEY(source_event_id) REFERENCES accounting_integration_source_events(id),UNIQUE(source_event_id,operational_item_id),CHECK(quantity>0));
CREATE TABLE accounting_database_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE accounting_draft_revisions (
 id TEXT PRIMARY KEY, journal_entry_id TEXT NOT NULL, version INTEGER NOT NULL,
 description TEXT NOT NULL, memo TEXT, entry_date TEXT NOT NULL, lines_json TEXT NOT NULL,
 actor_type TEXT NOT NULL, actor_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT(datetime('now')),
 FOREIGN KEY(journal_entry_id) REFERENCES accounting_journal_entries(id), UNIQUE(journal_entry_id,version)
);
CREATE TABLE accounting_entry_links (
 id TEXT PRIMARY KEY, journal_entry_id TEXT NOT NULL, source_type TEXT NOT NULL, source_id TEXT NOT NULL, relationship_type TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(journal_entry_id) REFERENCES accounting_journal_entries(id),
 UNIQUE(source_type,source_id,relationship_type)
);
CREATE TABLE accounting_fiscal_year_closes (
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
CREATE TABLE accounting_fiscal_years (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, status TEXT NOT NULL,
 is_current INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 closed_at TEXT, version INTEGER NOT NULL DEFAULT 1,
 CHECK(end_date >= start_date), CHECK(status IN ('planned','open','closing','closed','archived')), CHECK(is_current IN (0,1))
);
CREATE TABLE accounting_funds (
 id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT,
 restriction_type TEXT NOT NULL, purpose TEXT, start_date TEXT, end_date TEXT,
 is_default INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1, is_system INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), archived_at TEXT, version INTEGER NOT NULL DEFAULT 1, giving_source_type TEXT, giving_source_id TEXT, giving_enabled INTEGER NOT NULL DEFAULT 0, giving_slug TEXT, giving_goal_cents INTEGER, giving_metadata_json TEXT,
 CHECK(restriction_type IN ('unrestricted','board_designated','donor_restricted_temporary','donor_restricted_permanent')),
 CHECK(is_default IN (0,1)), CHECK(is_active IN (0,1)), CHECK(is_system IN (0,1)), CHECK(end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE TABLE accounting_health_checks (
  id TEXT PRIMARY KEY,
  check_name TEXT NOT NULL,
  status TEXT NOT NULL,
  checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (status IN ('healthy', 'unhealthy'))
);
CREATE TABLE accounting_idempotency_keys (
  idempotency_key TEXT PRIMARY KEY,
  operation TEXT NOT NULL,
  result_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE accounting_integration_backfills (
  id TEXT PRIMARY KEY, start_date TEXT NOT NULL, end_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'previewed',
  dry_run INTEGER NOT NULL DEFAULT 1, review_required INTEGER NOT NULL DEFAULT 1, maximum_batch_size INTEGER NOT NULL DEFAULT 100,
  cursor TEXT, events_found INTEGER NOT NULL DEFAULT 0, already_posted INTEGER NOT NULL DEFAULT 0,
  ready_to_post INTEGER NOT NULL DEFAULT 0, exception_count INTEGER NOT NULL DEFAULT 0,
  gross_total INTEGER NOT NULL DEFAULT 0, fee_total INTEGER NOT NULL DEFAULT 0, refund_total INTEGER NOT NULL DEFAULT 0,
  payout_total INTEGER NOT NULL DEFAULT 0, created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT(datetime('now')), updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  CHECK(status IN('previewed','queued','running','completed','failed','canceled')), CHECK(maximum_batch_size BETWEEN 1 AND 500)
);
CREATE TABLE accounting_integration_settings (
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
CREATE TABLE accounting_integration_source_events (
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
  created_at TEXT NOT NULL DEFAULT(datetime('now')), updated_at TEXT NOT NULL DEFAULT(datetime('now')), commerce_channel TEXT, order_number TEXT, tender_type TEXT, gross_merchandise_amount INTEGER NOT NULL DEFAULT 0, discount_amount INTEGER NOT NULL DEFAULT 0, taxable_amount INTEGER NOT NULL DEFAULT 0, tax_exempt_amount INTEGER NOT NULL DEFAULT 0, sales_tax_amount INTEGER NOT NULL DEFAULT 0, shipping_amount INTEGER NOT NULL DEFAULT 0, tip_or_donation_amount INTEGER NOT NULL DEFAULT 0, tax_jurisdiction TEXT, tax_rate_basis_points INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(journal_entry_id) REFERENCES accounting_journal_entries(id), FOREIGN KEY(reversal_entry_id) REFERENCES accounting_journal_entries(id),
  UNIQUE(source_system,source_event_id), UNIQUE(source_system,source_type,source_object_id,event_version),
  CHECK(status IN('received','waiting_for_source','waiting_for_mapping','ready_to_post','waiting_for_review','posting','posted','exception','ignored','superseded')),
  CHECK(mapping_status IN('pending','resolved','missing','invalid')), CHECK(posting_status IN('unposted','pending_review','posting','posted','failed','ignored')),
  CHECK(gross_amount>=0 AND fee_amount>=0 AND refund_amount>=0 AND dispute_amount>=0 AND fee_coverage_amount>=0)
);
CREATE TABLE accounting_integrity_findings(
 id TEXT PRIMARY KEY,scan_id TEXT NOT NULL,health_scope TEXT NOT NULL,health_code TEXT NOT NULL,
 status TEXT NOT NULL,severity TEXT NOT NULL,affected_module TEXT NOT NULL,safe_summary TEXT NOT NULL,
 recommended_action TEXT NOT NULL,details_json TEXT,source_reference_type TEXT,source_reference_id TEXT,
 detected_at TEXT NOT NULL DEFAULT(datetime('now')),last_checked_at TEXT NOT NULL DEFAULT(datetime('now')),
 resolved_at TEXT,correlation_id TEXT,created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),
 FOREIGN KEY(scan_id) REFERENCES accounting_integrity_scans(id),
 CHECK(status IN('healthy','warning','degraded','blocked','recovering','unknown')),
 CHECK(severity IN('informational','warning','error','critical'))
);
CREATE TABLE accounting_integrity_scans(
 id TEXT PRIMARY KEY,scan_type TEXT NOT NULL,scope TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',
 started_at TEXT,completed_at TEXT,last_checkpoint TEXT,checks_total INTEGER NOT NULL DEFAULT 0,
 checks_passed INTEGER NOT NULL DEFAULT 0,checks_warned INTEGER NOT NULL DEFAULT 0,checks_failed INTEGER NOT NULL DEFAULT 0,
 critical_failures INTEGER NOT NULL DEFAULT 0,scanner_version TEXT NOT NULL,schema_version TEXT,
 correlation_id TEXT,created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),
 CHECK(scan_type IN('incremental','full','post_migration','post_restore','pre_close','post_close','manual','canary')),
 CHECK(status IN('queued','running','paused','completed','completed_with_warnings','failed','canceled'))
);
CREATE TABLE accounting_inventory_movements(id TEXT PRIMARY KEY,item_id TEXT NOT NULL,movement_type TEXT NOT NULL,quantity INTEGER NOT NULL,unit_cost INTEGER,total_cost INTEGER,source_type TEXT NOT NULL,source_id TEXT NOT NULL,occurred_at TEXT NOT NULL,journal_entry_id TEXT,reversal_movement_id TEXT,status TEXT NOT NULL DEFAULT 'committed',created_at TEXT NOT NULL DEFAULT(datetime('now')),correlation_id TEXT,FOREIGN KEY(item_id) REFERENCES accounting_commerce_items(id),FOREIGN KEY(journal_entry_id) REFERENCES accounting_journal_entries(id),UNIQUE(source_type,source_id,item_id,movement_type),CHECK(movement_type IN('sale','return','purchase_future','adjustment_increase','adjustment_decrease','damage','loss','opening_quantity','count_correction')),CHECK(quantity<>0),CHECK(status IN('pending_cost','committed','exception','reversed')));
CREATE TABLE accounting_journal_entries (
 id TEXT PRIMARY KEY, entry_number TEXT UNIQUE, entry_date TEXT NOT NULL, posting_date TEXT, description TEXT NOT NULL, memo TEXT,
 status TEXT NOT NULL DEFAULT 'draft', source_type TEXT NOT NULL DEFAULT 'manual', source_id TEXT, source_event_id TEXT, external_reference TEXT,
 fiscal_year_id TEXT, accounting_period_id TEXT, currency TEXT NOT NULL DEFAULT 'USD', total_debits INTEGER NOT NULL DEFAULT 0, total_credits INTEGER NOT NULL DEFAULT 0,
 created_by_actor_type TEXT NOT NULL, created_by_actor_id TEXT NOT NULL, posted_by_actor_type TEXT, posted_by_actor_id TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), posted_at TEXT, reversed_at TEXT, voided_at TEXT,
 void_reason TEXT, version INTEGER NOT NULL DEFAULT 1, correlation_id TEXT,
 FOREIGN KEY(fiscal_year_id) REFERENCES accounting_fiscal_years(id), FOREIGN KEY(accounting_period_id) REFERENCES accounting_periods(id),
 CHECK(status IN ('draft','pending','posted','reversed','voided')), CHECK(total_debits >= 0), CHECK(total_credits >= 0)
);
CREATE TABLE accounting_journal_lines (
 id TEXT PRIMARY KEY, journal_entry_id TEXT NOT NULL, line_number INTEGER NOT NULL, account_id TEXT NOT NULL, fund_id TEXT NOT NULL,
 description TEXT, debit_amount INTEGER NOT NULL DEFAULT 0, credit_amount INTEGER NOT NULL DEFAULT 0, source_detail_type TEXT, source_detail_id TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 FOREIGN KEY(journal_entry_id) REFERENCES accounting_journal_entries(id), FOREIGN KEY(account_id) REFERENCES accounting_accounts(id), FOREIGN KEY(fund_id) REFERENCES accounting_funds(id),
 UNIQUE(journal_entry_id,line_number), CHECK(debit_amount >= 0), CHECK(credit_amount >= 0),
 CHECK((debit_amount > 0 AND credit_amount = 0) OR (credit_amount > 0 AND debit_amount = 0))
);
CREATE TABLE accounting_ledger_events (
 id TEXT PRIMARY KEY, event_type TEXT NOT NULL, journal_entry_id TEXT, related_entry_id TEXT, actor_type TEXT NOT NULL, actor_id TEXT,
 reason_code TEXT, correlation_id TEXT, metadata_json TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
 FOREIGN KEY(journal_entry_id) REFERENCES accounting_journal_entries(id), FOREIGN KEY(related_entry_id) REFERENCES accounting_journal_entries(id)
);
CREATE TABLE accounting_legal_holds (
 id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, hold_reason TEXT NOT NULL,
 placed_by TEXT NOT NULL, placed_at TEXT NOT NULL DEFAULT (datetime('now')), released_by TEXT, released_at TEXT,
 status TEXT NOT NULL DEFAULT 'active', version INTEGER NOT NULL DEFAULT 1, CHECK(status IN ('active','released'))
);
CREATE TABLE accounting_migration_account_map(
  migration_session_id TEXT NOT NULL,
  source_account_ref TEXT NOT NULL,
  agapay_account_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  PRIMARY KEY(migration_session_id,source_account_ref),
  FOREIGN KEY(migration_session_id) REFERENCES accounting_migration_sessions(id),
  FOREIGN KEY(agapay_account_id) REFERENCES accounting_accounts(id)
);
CREATE TABLE accounting_migration_fund_map(
  migration_session_id TEXT NOT NULL,
  source_fund_ref TEXT NOT NULL,
  agapay_fund_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  PRIMARY KEY(migration_session_id,source_fund_ref),
  FOREIGN KEY(migration_session_id) REFERENCES accounting_migration_sessions(id),
  FOREIGN KEY(agapay_fund_id) REFERENCES accounting_funds(id)
);
CREATE TABLE accounting_migration_sessions(
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
CREATE TABLE accounting_migrations (
  version TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE accounting_net_asset_mappings (
 id TEXT PRIMARY KEY DEFAULT 'primary', unrestricted_net_assets_account_id TEXT NOT NULL DEFAULT 'acct_3000',
 restricted_net_assets_account_id TEXT NOT NULL DEFAULT 'acct_3100', board_designated_net_assets_account_id TEXT,
 temporary_closing_account_id TEXT, closing_method TEXT NOT NULL DEFAULT 'direct', version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 FOREIGN KEY(unrestricted_net_assets_account_id) REFERENCES accounting_accounts(id),
 FOREIGN KEY(restricted_net_assets_account_id) REFERENCES accounting_accounts(id),
 FOREIGN KEY(board_designated_net_assets_account_id) REFERENCES accounting_accounts(id),
 CHECK(closing_method IN ('direct','income_summary'))
);
CREATE TABLE accounting_opening_balance_batches (
 id TEXT PRIMARY KEY, effective_date TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', source_system TEXT,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), posted_at TEXT, journal_entry_id TEXT UNIQUE, version INTEGER NOT NULL DEFAULT 1,
 FOREIGN KEY(journal_entry_id) REFERENCES accounting_journal_entries(id), CHECK(status IN ('draft','posted','voided'))
);
CREATE TABLE accounting_opening_balance_lines (
 id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, account_id TEXT NOT NULL, fund_id TEXT NOT NULL, debit_amount INTEGER NOT NULL DEFAULT 0,
 credit_amount INTEGER NOT NULL DEFAULT 0, description TEXT, FOREIGN KEY(batch_id) REFERENCES accounting_opening_balance_batches(id),
 FOREIGN KEY(account_id) REFERENCES accounting_accounts(id), FOREIGN KEY(fund_id) REFERENCES accounting_funds(id),
 CHECK(debit_amount >= 0), CHECK(credit_amount >= 0), CHECK((debit_amount > 0 AND credit_amount = 0) OR (credit_amount > 0 AND debit_amount = 0))
);
CREATE TABLE accounting_operational_alerts(
 id TEXT PRIMARY KEY,alert_code TEXT NOT NULL,severity TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',
 safe_summary TEXT NOT NULL,recommended_action TEXT NOT NULL,source_type TEXT,source_id TEXT,
 correlation_id TEXT,opened_at TEXT NOT NULL DEFAULT(datetime('now')),acknowledged_by TEXT,
 acknowledged_at TEXT,resolved_at TEXT,version INTEGER NOT NULL DEFAULT 1,
 CHECK(severity IN('informational','warning','error','critical')),
 CHECK(status IN('open','acknowledged','resolved','suppressed'))
);
CREATE TABLE accounting_payment_applications(id TEXT PRIMARY KEY,payment_id TEXT NOT NULL,bill_id TEXT NOT NULL,amount_applied INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now')),FOREIGN KEY(payment_id) REFERENCES accounting_payments(id),FOREIGN KEY(bill_id) REFERENCES accounting_bills(id),UNIQUE(payment_id,bill_id),CHECK(amount_applied>0));
CREATE TABLE accounting_payment_run_items(
  id TEXT PRIMARY KEY,
  payment_run_id TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  FOREIGN KEY(payment_run_id) REFERENCES accounting_payment_runs(id),
  FOREIGN KEY(payment_id) REFERENCES accounting_payments(id),
  UNIQUE(payment_run_id, sequence),
  UNIQUE(payment_id)
);
CREATE TABLE accounting_payment_runs(
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
CREATE TABLE accounting_payment_terms(id TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,due_days INTEGER NOT NULL DEFAULT 0,discount_days INTEGER NOT NULL DEFAULT 0,discount_percent_basis_points INTEGER NOT NULL DEFAULT 0,is_default INTEGER NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),version INTEGER NOT NULL DEFAULT 1,CHECK(due_days>=0),CHECK(discount_percent_basis_points BETWEEN 0 AND 10000));
CREATE TABLE accounting_payments(id TEXT PRIMARY KEY,payment_number TEXT NOT NULL UNIQUE,vendor_id TEXT NOT NULL,payment_date TEXT NOT NULL,payment_method TEXT NOT NULL,bank_account_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',currency TEXT NOT NULL DEFAULT 'USD',total_amount INTEGER NOT NULL,reference_number TEXT,check_number TEXT,memo TEXT,scheduled_at TEXT,processed_at TEXT,cleared_at TEXT,voided_at TEXT,created_by_actor_type TEXT NOT NULL,created_by_actor_id TEXT NOT NULL,approved_by_actor_type TEXT,approved_by_actor_id TEXT,posted_journal_entry_id TEXT,reconciliation_transaction_id TEXT,created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),version INTEGER NOT NULL DEFAULT 1,correlation_id TEXT,FOREIGN KEY(vendor_id) REFERENCES accounting_vendors(id),FOREIGN KEY(bank_account_id) REFERENCES accounting_bank_accounts(id),FOREIGN KEY(posted_journal_entry_id) REFERENCES accounting_journal_entries(id),CHECK(payment_method IN('check','ach','wire','debit_card','credit_card','cash','external','other')),CHECK(status IN('draft','scheduled','approved','posted','cleared','failed','voided')),CHECK(total_amount>0));
CREATE TABLE accounting_payout_composition (
  payout_id TEXT NOT NULL, balance_transaction_id TEXT NOT NULL, source_event_id TEXT,
  amount INTEGER NOT NULL, currency TEXT NOT NULL, source_type TEXT NOT NULL,
  included_at TEXT NOT NULL DEFAULT(datetime('now')), PRIMARY KEY(payout_id,balance_transaction_id)
);
CREATE TABLE accounting_period_locks (
 id TEXT PRIMARY KEY, accounting_period_id TEXT NOT NULL, lock_type TEXT NOT NULL, locked_by_actor_type TEXT NOT NULL, locked_by_actor_id TEXT NOT NULL,
 reason TEXT NOT NULL, locked_at TEXT NOT NULL DEFAULT (datetime('now')), unlocked_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
 FOREIGN KEY(accounting_period_id) REFERENCES accounting_periods(id), CHECK(lock_type IN ('soft_close','hard_close','audit_lock','system_lock'))
);
CREATE TABLE accounting_periods (
 id TEXT PRIMARY KEY, fiscal_year_id TEXT NOT NULL, period_number INTEGER NOT NULL, name TEXT NOT NULL,
 start_date TEXT NOT NULL, end_date TEXT NOT NULL, status TEXT NOT NULL,
 opened_at TEXT, closed_at TEXT, locked_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), version INTEGER NOT NULL DEFAULT 1,
 FOREIGN KEY(fiscal_year_id) REFERENCES accounting_fiscal_years(id), UNIQUE(fiscal_year_id, period_number),
 CHECK(end_date >= start_date), CHECK(status IN ('future','open','soft_closed','closed','locked'))
);
CREATE TABLE accounting_posting_idempotency (
 id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE, operation_type TEXT NOT NULL, source_type TEXT, source_id TEXT,
 request_hash TEXT NOT NULL, journal_entry_id TEXT, result_status TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), completed_at TEXT, expires_at TEXT,
 FOREIGN KEY(journal_entry_id) REFERENCES accounting_journal_entries(id), UNIQUE(source_type,source_id,operation_type)
);
CREATE TABLE accounting_protective_state(
 id TEXT PRIMARY KEY DEFAULT 'primary',state TEXT NOT NULL DEFAULT 'normal',reason_code TEXT,
 safe_summary TEXT,activated_by TEXT,activated_at TEXT,released_by TEXT,released_at TEXT,
 source_scan_id TEXT,version INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT(datetime('now')),
 FOREIGN KEY(source_scan_id) REFERENCES accounting_integrity_scans(id),
 CHECK(state IN('normal','degraded_read_only','posting_blocked','recovering'))
);
CREATE TABLE accounting_reconciliation_items (
 id TEXT PRIMARY KEY,reconciliation_session_id TEXT NOT NULL,bank_transaction_id TEXT NOT NULL,journal_entry_id TEXT NOT NULL,journal_line_id TEXT NOT NULL,
 match_group_id TEXT NOT NULL,matched_amount INTEGER NOT NULL,match_type TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'confirmed',
 created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),
 FOREIGN KEY(reconciliation_session_id) REFERENCES accounting_reconciliation_sessions(id),FOREIGN KEY(bank_transaction_id) REFERENCES accounting_bank_transactions(id),
 FOREIGN KEY(journal_entry_id) REFERENCES accounting_journal_entries(id),FOREIGN KEY(journal_line_id) REFERENCES accounting_journal_lines(id),
 UNIQUE(reconciliation_session_id,bank_transaction_id,journal_line_id,match_group_id),CHECK(matched_amount>0),
 CHECK(match_type IN('one_to_one','one_to_many','many_to_one','many_to_many','manual_adjustment','stripe_payout')),CHECK(status IN('proposed','confirmed','removed','exception'))
);
CREATE TABLE accounting_reconciliation_sessions (
 id TEXT PRIMARY KEY,bank_account_id TEXT NOT NULL,statement_start_date TEXT NOT NULL,statement_end_date TEXT NOT NULL,
 statement_beginning_balance INTEGER NOT NULL,statement_ending_balance INTEGER NOT NULL,ledger_beginning_balance INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'draft',cleared_deposits INTEGER NOT NULL DEFAULT 0,cleared_withdrawals INTEGER NOT NULL DEFAULT 0,
 adjustments INTEGER NOT NULL DEFAULT 0,calculated_ending_balance INTEGER NOT NULL DEFAULT 0,difference INTEGER NOT NULL DEFAULT 0,
 created_by_actor_type TEXT NOT NULL,created_by_actor_id TEXT NOT NULL,completed_by_actor_type TEXT,completed_by_actor_id TEXT,
 created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),completed_at TEXT,reopened_at TEXT,
 void_reason TEXT,version INTEGER NOT NULL DEFAULT 1,correlation_id TEXT,FOREIGN KEY(bank_account_id) REFERENCES accounting_bank_accounts(id),
 CHECK(status IN('draft','in_progress','ready_to_complete','completed','reopened','voided')),CHECK(statement_end_date>=statement_start_date)
);
CREATE TABLE accounting_reconciliation_settings (
 id TEXT PRIMARY KEY CHECK(id='primary'),default_reconciliation_bank_account_id TEXT,automatic_match_enabled INTEGER NOT NULL DEFAULT 0,
 automatic_match_confidence_threshold INTEGER NOT NULL DEFAULT 100,date_match_tolerance_days INTEGER NOT NULL DEFAULT 3,
 amount_tolerance_minor_units INTEGER NOT NULL DEFAULT 0,stale_check_days INTEGER NOT NULL DEFAULT 90,stale_deposit_days INTEGER NOT NULL DEFAULT 10,
 require_separate_reviewer INTEGER NOT NULL DEFAULT 0,allow_reopen INTEGER NOT NULL DEFAULT 1,settings_version INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL DEFAULT(datetime('now')),FOREIGN KEY(default_reconciliation_bank_account_id) REFERENCES accounting_bank_accounts(id)
);
CREATE TABLE accounting_reconciliation_snapshots (
 id TEXT PRIMARY KEY,reconciliation_session_id TEXT NOT NULL,statement_beginning_balance INTEGER NOT NULL,statement_ending_balance INTEGER NOT NULL,
 adjusted_bank_balance INTEGER NOT NULL,ledger_ending_balance INTEGER NOT NULL,adjusted_ledger_balance INTEGER NOT NULL,
 outstanding_deposits INTEGER NOT NULL,outstanding_withdrawals INTEGER NOT NULL,adjustments_total INTEGER NOT NULL,difference INTEGER NOT NULL,
 completed_at TEXT NOT NULL,completed_by_actor_type TEXT NOT NULL,completed_by_actor_id TEXT NOT NULL,snapshot_hash TEXT NOT NULL,
 FOREIGN KEY(reconciliation_session_id) REFERENCES accounting_reconciliation_sessions(id)
);
CREATE TABLE accounting_recovery_verifications(
 id TEXT PRIMARY KEY,verification_type TEXT NOT NULL,status TEXT NOT NULL,artifact_reference TEXT,
 artifact_checksum TEXT,manifest_checksum TEXT,schema_valid INTEGER NOT NULL DEFAULT 0,
 trial_balance_hash TEXT,source_links_valid INTEGER NOT NULL DEFAULT 0,reconciliations_valid INTEGER NOT NULL DEFAULT 0,
 close_snapshots_valid INTEGER NOT NULL DEFAULT 0,verified_by TEXT NOT NULL,verified_at TEXT NOT NULL DEFAULT(datetime('now')),
 expires_at TEXT,correlation_id TEXT,details_json TEXT,
 CHECK(verification_type IN('backup','restore','migration_preflight','post_restore')),
 CHECK(status IN('pending','verified','failed','expired'))
);
CREATE TABLE accounting_recurring_bill_executions (
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
CREATE TABLE accounting_recurring_bill_schedules (
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
CREATE TABLE accounting_recurring_bills(id TEXT PRIMARY KEY,vendor_id TEXT NOT NULL,name TEXT NOT NULL,frequency TEXT NOT NULL,next_run_date TEXT NOT NULL,end_date TEXT,payment_terms_id TEXT,default_description TEXT,auto_create_draft INTEGER NOT NULL DEFAULT 1,requires_review INTEGER NOT NULL DEFAULT 1,is_active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),version INTEGER NOT NULL DEFAULT 1,FOREIGN KEY(vendor_id) REFERENCES accounting_vendors(id),FOREIGN KEY(payment_terms_id) REFERENCES accounting_payment_terms(id),CHECK(frequency IN('weekly','monthly','quarterly','annual','custom_interval')));
CREATE TABLE accounting_recurring_executions (
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
CREATE TABLE accounting_recurring_transactions (
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
CREATE TABLE accounting_retention_settings (
 id TEXT PRIMARY KEY DEFAULT 'primary', accounting_records_retention_years INTEGER NOT NULL DEFAULT 7,
 bank_statement_retention_years INTEGER NOT NULL DEFAULT 7, invoice_retention_years INTEGER NOT NULL DEFAULT 7,
 audit_log_retention_years INTEGER NOT NULL DEFAULT 7, attachment_retention_years INTEGER NOT NULL DEFAULT 7,
 close_packet_retention_years INTEGER NOT NULL DEFAULT 7, allow_legal_hold INTEGER NOT NULL DEFAULT 1,
 retention_policy_version INTEGER NOT NULL DEFAULT 1, updated_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE accounting_schema_expectations(
 object_type TEXT NOT NULL,object_name TEXT NOT NULL,required_definition_fragment TEXT,
 introduced_version TEXT NOT NULL,is_critical INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT(datetime('now')),PRIMARY KEY(object_type,object_name),
 CHECK(object_type IN('table','index','trigger','column'))
);
CREATE TABLE accounting_settings (
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
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), pledge_comparison_account_id TEXT REFERENCES accounting_accounts(id),
  FOREIGN KEY(default_fund_id) REFERENCES accounting_funds(id),
  CHECK(length(base_currency) = 3),
  CHECK(fiscal_year_start_month BETWEEN 1 AND 12),
  CHECK(opening_balances_required IN (0,1)),
  CHECK(opening_balances_disposition IN ('pending','required','deferred','not_applicable','posted')),
  CHECK(account_numbers_required IN (0,1)),
  CHECK(allow_custom_account_numbers IN (0,1)),
  CHECK(soft_close_override_enabled IN (0,1))
);
CREATE TABLE accounting_source_mappings (
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
CREATE TABLE accounting_vendors(id TEXT PRIMARY KEY,vendor_number TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,legal_name TEXT,vendor_type TEXT NOT NULL DEFAULT 'business',status TEXT NOT NULL DEFAULT 'active',email TEXT,phone TEXT,website TEXT,address_line1 TEXT,address_line2 TEXT,city TEXT,state_region TEXT,postal_code TEXT,country TEXT NOT NULL DEFAULT 'US',payment_terms_id TEXT,default_expense_account_id TEXT,default_fund_id TEXT,default_payment_method TEXT,tax_classification TEXT,tax_id_last4 TEXT,requires_1099_review INTEGER NOT NULL DEFAULT 0,notes TEXT,created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),archived_at TEXT,version INTEGER NOT NULL DEFAULT 1,FOREIGN KEY(payment_terms_id) REFERENCES accounting_payment_terms(id),FOREIGN KEY(default_expense_account_id) REFERENCES accounting_accounts(id),FOREIGN KEY(default_fund_id) REFERENCES accounting_funds(id),CHECK(vendor_type IN('business','individual','clergy','government','utility','diocese','monastery','charity','other')),CHECK(status IN('active','inactive','archived','blocked')),CHECK(tax_id_last4 IS NULL OR length(tax_id_last4)<=4));
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE commemorations (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  source_id TEXT,
  donor_email TEXT,
  created_at TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE donor_offerings (
  id TEXT PRIMARY KEY,
  donor_email TEXT NOT NULL,
  parish_id TEXT,
  checkout_session_id TEXT,
  payment_intent_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT,
  payment_status TEXT,
  created_at TEXT,
  updated_at TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE donors (
  email TEXT PRIMARY KEY,
  default_parish_id TEXT,
  email_verified_at TEXT,
  created_at TEXT,
  updated_at TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE learn_academic_records (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  occurred_on TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES learn_households(id),
  FOREIGN KEY (child_id) REFERENCES learn_children(id)
);
CREATE TABLE learn_book_assignments (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  assignment_type TEXT NOT NULL,
  assignee_id TEXT NOT NULL,
  progress_percent INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (book_id) REFERENCES learn_books(id)
);
CREATE TABLE learn_books (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  category TEXT NOT NULL,
  audience_label TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES learn_households(id)
);
CREATE TABLE learn_child_lesson_blocks (
  id TEXT PRIMARY KEY,
  lesson_day_id TEXT NOT NULL,
  child_track_id TEXT NOT NULL,
  status TEXT NOT NULL,
  minutes_planned INTEGER NOT NULL DEFAULT 0,
  minutes_actual INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (lesson_day_id) REFERENCES learn_lesson_days(id),
  FOREIGN KEY (child_track_id) REFERENCES learn_child_tracks(id)
);
CREATE TABLE learn_child_tracks (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  title TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (child_id) REFERENCES learn_children(id)
);
CREATE TABLE learn_children (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  first_name TEXT NOT NULL,
  age_years INTEGER NOT NULL,
  grade_label TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES learn_households(id)
);
CREATE TABLE learn_church_rhythm_practices (
  id TEXT PRIMARY KEY,
  lesson_day_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (lesson_day_id) REFERENCES learn_lesson_days(id)
);
CREATE TABLE learn_curriculum_packages (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  title TEXT NOT NULL,
  vendor TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES learn_households(id)
);
CREATE TABLE learn_cycle_frameworks (
  id TEXT PRIMARY KEY,
  framework_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE learn_cycle_topics (
  id TEXT PRIMARY KEY,
  cycle_year_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  title TEXT NOT NULL,
  season_label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (cycle_year_id) REFERENCES learn_cycle_years(id)
);
CREATE TABLE learn_cycle_years (
  id TEXT PRIMARY KEY,
  cycle_framework_id TEXT NOT NULL,
  year_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (cycle_framework_id) REFERENCES learn_cycle_frameworks(id)
);
CREATE TABLE learn_household_lesson_blocks (
  id TEXT PRIMARY KEY,
  lesson_day_id TEXT NOT NULL,
  household_stream_id TEXT NOT NULL,
  status TEXT NOT NULL,
  minutes_planned INTEGER NOT NULL DEFAULT 0,
  minutes_actual INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (lesson_day_id) REFERENCES learn_lesson_days(id),
  FOREIGN KEY (household_stream_id) REFERENCES learn_household_streams(id)
);
CREATE TABLE learn_household_pace_profiles (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  title TEXT NOT NULL,
  pace_mode TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES learn_households(id)
);
CREATE TABLE learn_household_streams (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  stream_type TEXT NOT NULL,
  title TEXT NOT NULL,
  cadence_label TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES learn_households(id)
);
CREATE TABLE learn_households (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  household_size INTEGER NOT NULL DEFAULT 0,
  liturgical_calendar_type TEXT NOT NULL,
  pace_mode TEXT NOT NULL,
  grace_mode_active INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE learn_lesson_days (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  civil_date TEXT NOT NULL,
  calendar_type TEXT NOT NULL,
  liturgical_day_id TEXT,
  cycle_year_id TEXT,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES learn_households(id),
  FOREIGN KEY (liturgical_day_id) REFERENCES learn_liturgical_days(id)
);
CREATE TABLE learn_liturgical_days (
  id TEXT PRIMARY KEY,
  civil_date TEXT NOT NULL,
  calendar_type TEXT NOT NULL,
  feast_title TEXT NOT NULL,
  feast_rank TEXT NOT NULL,
  fasting_rule TEXT NOT NULL,
  tone TEXT NOT NULL,
  old_style_date_label TEXT NOT NULL,
  epistle_ref TEXT NOT NULL,
  gospel_ref TEXT NOT NULL,
  troparion_tone TEXT NOT NULL,
  kontakion_tone TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE learn_narration_logs (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL,
  lesson_day_id TEXT,
  narration_type TEXT NOT NULL,
  subject_title TEXT NOT NULL,
  source_title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  logged_at TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (child_id) REFERENCES learn_children(id),
  FOREIGN KEY (lesson_day_id) REFERENCES learn_lesson_days(id)
);
CREATE TABLE learn_print_jobs (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  template_id TEXT,
  status TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES learn_households(id),
  FOREIGN KEY (template_id) REFERENCES learn_print_templates(id)
);
CREATE TABLE learn_print_templates (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  title TEXT NOT NULL,
  template_type TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES learn_households(id)
);
CREATE TABLE learn_report_cards (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  school_year_id TEXT NOT NULL,
  status TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES learn_households(id),
  FOREIGN KEY (child_id) REFERENCES learn_children(id),
  FOREIGN KEY (school_year_id) REFERENCES learn_school_years(id)
);
CREATE TABLE learn_school_years (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  label TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  current_term_id TEXT,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES learn_households(id)
);
CREATE TABLE learn_season_adjustments (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  pace_profile_id TEXT,
  title TEXT NOT NULL,
  adjustment_kind TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES learn_households(id),
  FOREIGN KEY (pace_profile_id) REFERENCES learn_household_pace_profiles(id)
);
CREATE TABLE learn_terms (
  id TEXT PRIMARY KEY,
  school_year_id TEXT NOT NULL,
  label TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  pace_mode TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (school_year_id) REFERENCES learn_school_years(id)
);
CREATE TABLE learn_transcripts (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  status TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES learn_households(id),
  FOREIGN KEY (child_id) REFERENCES learn_children(id)
);
CREATE TABLE registrations (
  reference TEXT PRIMARY KEY,
  parish_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  parish_name TEXT,
  community_type TEXT,
  stripe_account_id TEXT,
  stripe_subscription_id TEXT,
  received_at TEXT,
  updated_at TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE stripe_events (
  id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL
, event_type TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'processed', processed_at TEXT DEFAULT '', error_message TEXT DEFAULT '');
CREATE INDEX idx_accounting_accounts_parent ON accounting_accounts(parent_account_id);
CREATE INDEX idx_accounting_accounts_type ON accounting_accounts(account_type_id);
CREATE INDEX idx_accounting_attachments_entity ON accounting_attachments(entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_accounting_bank_one_default ON accounting_bank_accounts(is_default) WHERE is_default=1 AND is_active=1;
CREATE INDEX idx_accounting_bank_transactions_match ON accounting_bank_transactions(bank_account_id,match_status,posted_date);
CREATE INDEX idx_accounting_bills_aging
  ON accounting_bills(status, bill_date, due_date, vendor_id)
  WHERE amount_due > 0;
CREATE INDEX idx_accounting_entries_reporting ON accounting_journal_entries(status,posting_date,accounting_period_id,source_type);
CREATE INDEX idx_accounting_entries_search ON accounting_journal_entries(status,entry_date,source_type);
CREATE UNIQUE INDEX idx_accounting_entry_source ON accounting_journal_entries(source_type,source_id) WHERE source_id IS NOT NULL;
CREATE UNIQUE INDEX idx_accounting_fiscal_year_current ON accounting_fiscal_years(is_current) WHERE is_current = 1;
CREATE INDEX idx_accounting_funds_giving_enabled
  ON accounting_funds(giving_enabled,is_active,code);
CREATE UNIQUE INDEX idx_accounting_funds_giving_source
  ON accounting_funds(giving_source_type,giving_source_id)
  WHERE giving_source_type IS NOT NULL AND giving_source_id IS NOT NULL;
CREATE UNIQUE INDEX idx_accounting_funds_one_default ON accounting_funds(is_default) WHERE is_default = 1;
CREATE INDEX idx_accounting_integration_events_object ON accounting_integration_source_events(source_system,source_object_id);
CREATE INDEX idx_accounting_integration_events_queue ON accounting_integration_source_events(status,occurred_at);
CREATE INDEX idx_accounting_ledger_events_entry ON accounting_ledger_events(journal_entry_id,created_at);
CREATE INDEX idx_accounting_lines_account ON accounting_journal_lines(account_id,journal_entry_id);
CREATE INDEX idx_accounting_lines_entry_account_fund ON accounting_journal_lines(journal_entry_id,account_id,fund_id);
CREATE INDEX idx_accounting_lines_fund ON accounting_journal_lines(fund_id,journal_entry_id);
CREATE INDEX idx_accounting_lines_reporting ON accounting_journal_lines(account_id,fund_id,journal_entry_id,debit_amount,credit_amount);
CREATE INDEX idx_accounting_period_dates ON accounting_periods(start_date,end_date,status);
CREATE INDEX idx_accounting_reconciliation_items_line ON accounting_reconciliation_items(journal_line_id,status);
CREATE INDEX idx_accounting_reconciliation_sessions_bank ON accounting_reconciliation_sessions(bank_account_id,statement_end_date,status);
CREATE INDEX idx_accounting_recurring_bills_due
  ON accounting_recurring_bill_schedules(status,next_bill_date);
CREATE INDEX idx_accounting_recurring_due
  ON accounting_recurring_transactions(status,next_posting_date);
CREATE INDEX idx_accounting_source_mappings_lookup ON accounting_source_mappings(source_system,source_type,source_object_id,is_active);
CREATE INDEX idx_adjustments_close ON accounting_adjustments(close_session_id,status);
CREATE INDEX idx_adjustments_reversal ON accounting_adjustments(reversal_status,reversal_date);
CREATE UNIQUE INDEX idx_ap_bill_vendor_invoice ON accounting_bills(vendor_id,vendor_invoice_number) WHERE vendor_invoice_number IS NOT NULL AND vendor_invoice_number<>'' AND status<>'voided';
CREATE UNIQUE INDEX idx_ap_check_number ON accounting_payments(bank_account_id,check_number) WHERE check_number IS NOT NULL AND check_number<>'' AND status<>'voided';
CREATE UNIQUE INDEX idx_ap_terms_default ON accounting_payment_terms(is_default) WHERE is_default=1 AND is_active=1;
CREATE INDEX idx_ap_vendors_name ON accounting_vendors(display_name,status);
CREATE INDEX idx_budget_lines_report ON accounting_budget_lines(budget_id,fund_id,account_id);
CREATE UNIQUE INDEX idx_budget_official ON accounting_budgets(fiscal_year_id) WHERE status='locked';
CREATE INDEX idx_check_print_events_payment ON accounting_check_print_events(payment_id,printed_at);
CREATE UNIQUE INDEX idx_close_active_period ON accounting_close_sessions(accounting_period_id,close_type)
 WHERE status NOT IN ('completed','voided','reopened') AND accounting_period_id IS NOT NULL;
CREATE INDEX idx_close_checks_status ON accounting_close_checks(close_session_id,status,blocking);
CREATE INDEX idx_close_fiscal_status ON accounting_close_sessions(fiscal_year_id,status,started_at);
CREATE INDEX idx_close_health ON accounting_close_sessions(status,accounting_period_id,completed_at);
CREATE INDEX idx_commemorations_donor_email_created_at ON commemorations(donor_email, created_at);
CREATE INDEX idx_commemorations_parish_id_created_at ON commemorations(parish_id, created_at);
CREATE INDEX idx_commemorations_source_id ON commemorations(source_id);
CREATE UNIQUE INDEX idx_commerce_item_barcode ON accounting_commerce_items(barcode) WHERE barcode IS NOT NULL AND barcode<>'';
CREATE UNIQUE INDEX idx_commerce_item_sku ON accounting_commerce_items(sku) WHERE sku IS NOT NULL AND sku<>'';
CREATE INDEX idx_commerce_mapping_precedence ON accounting_commerce_mappings(item_id,item_category_id,revenue_stream_id,settlement_profile_id,commerce_channel,is_active);
CREATE INDEX idx_donor_offerings_checkout_session_id ON donor_offerings(checkout_session_id);
CREATE INDEX idx_donor_offerings_donor_email_created_at ON donor_offerings(donor_email, created_at);
CREATE INDEX idx_donor_offerings_parish_id_created_at ON donor_offerings(parish_id, created_at);
CREATE INDEX idx_donor_offerings_payment_intent_id ON donor_offerings(payment_intent_id);
CREATE INDEX idx_donor_offerings_stripe_subscription_id ON donor_offerings(stripe_subscription_id);
CREATE INDEX idx_donors_default_parish_id ON donors(default_parish_id);
CREATE INDEX idx_integration_events_health ON accounting_integration_source_events(status,posting_status,occurred_at);
CREATE INDEX idx_integrity_findings_active ON accounting_integrity_findings(status,severity,health_scope);
CREATE INDEX idx_integrity_findings_scan ON accounting_integrity_findings(scan_id,health_code);
CREATE INDEX idx_integrity_scans_status ON accounting_integrity_scans(status,created_at);
CREATE INDEX idx_journal_entries_period_status_date ON accounting_journal_entries(accounting_period_id,status,posting_date);
CREATE INDEX idx_journal_entries_source_status ON accounting_journal_entries(source_type,source_id,status);
CREATE INDEX idx_learn_book_assignments_book_id ON learn_book_assignments(book_id);
CREATE INDEX idx_learn_books_household_id ON learn_books(household_id);
CREATE INDEX idx_learn_child_blocks_day_id ON learn_child_lesson_blocks(lesson_day_id);
CREATE INDEX idx_learn_child_tracks_child_id ON learn_child_tracks(child_id);
CREATE INDEX idx_learn_children_household_id ON learn_children(household_id);
CREATE INDEX idx_learn_church_rhythm_day_id ON learn_church_rhythm_practices(lesson_day_id);
CREATE INDEX idx_learn_curriculum_packages_household_id ON learn_curriculum_packages(household_id);
CREATE INDEX idx_learn_cycle_topics_cycle_year_id ON learn_cycle_topics(cycle_year_id);
CREATE INDEX idx_learn_cycle_years_framework_id ON learn_cycle_years(cycle_framework_id);
CREATE INDEX idx_learn_household_blocks_day_id ON learn_household_lesson_blocks(lesson_day_id);
CREATE INDEX idx_learn_household_streams_household_id ON learn_household_streams(household_id);
CREATE INDEX idx_learn_lesson_days_household_id ON learn_lesson_days(household_id, civil_date);
CREATE UNIQUE INDEX idx_learn_liturgical_days_unique_date
  ON learn_liturgical_days(civil_date, calendar_type);
CREATE INDEX idx_learn_narration_logs_child_id ON learn_narration_logs(child_id, logged_at DESC);
CREATE INDEX idx_learn_pace_profiles_household_id ON learn_household_pace_profiles(household_id);
CREATE INDEX idx_learn_school_years_household_id ON learn_school_years(household_id);
CREATE INDEX idx_learn_season_adjustments_household_id ON learn_season_adjustments(household_id, starts_on, ends_on);
CREATE INDEX idx_learn_terms_school_year_id ON learn_terms(school_year_id);
CREATE INDEX idx_legal_holds_entity ON accounting_legal_holds(entity_type,entity_id,status);
CREATE INDEX idx_operational_alerts_open ON accounting_operational_alerts(status,severity,opened_at);
CREATE INDEX idx_payment_run_items_run ON accounting_payment_run_items(payment_run_id, sequence);
CREATE INDEX idx_payment_runs_date ON accounting_payment_runs(run_date DESC, created_at DESC);
CREATE INDEX idx_reconciliation_health ON accounting_reconciliation_sessions(status,statement_end_date,difference);
CREATE INDEX idx_recovery_verifications_status ON accounting_recovery_verifications(status,verified_at);
CREATE INDEX idx_registrations_parish_id ON registrations(parish_id);
CREATE INDEX idx_registrations_received_at ON registrations(received_at);
CREATE INDEX idx_registrations_status ON registrations(status);
CREATE INDEX idx_registrations_stripe_account_id ON registrations(stripe_account_id);
CREATE INDEX idx_registrations_stripe_subscription_id ON registrations(stripe_subscription_id);
CREATE INDEX idx_stripe_events_received_at ON stripe_events(received_at);
CREATE INDEX idx_stripe_events_status ON stripe_events(status);
CREATE UNIQUE INDEX idx_year_close_active ON accounting_fiscal_year_closes(fiscal_year_id)
 WHERE status NOT IN ('reopened','superseded','failed');
CREATE TRIGGER accounting_close_snapshot_immutable_delete BEFORE DELETE ON accounting_close_snapshots
BEGIN SELECT RAISE(ABORT,'close snapshot is immutable'); END;
CREATE TRIGGER accounting_close_snapshot_immutable_update BEFORE UPDATE ON accounting_close_snapshots
BEGIN SELECT RAISE(ABORT,'close snapshot is immutable'); END;
CREATE TRIGGER accounting_locked_budget_immutable BEFORE UPDATE ON accounting_budgets WHEN OLD.status='locked' BEGIN SELECT RAISE(ABORT,'locked budget is immutable'); END;
CREATE TRIGGER accounting_locked_budget_lines_no_delete BEFORE DELETE ON accounting_budget_lines WHEN (SELECT status FROM accounting_budgets WHERE id=OLD.budget_id)='locked' BEGIN SELECT RAISE(ABORT,'locked budget lines are immutable'); END;
CREATE TRIGGER accounting_locked_budget_lines_no_insert BEFORE INSERT ON accounting_budget_lines WHEN (SELECT status FROM accounting_budgets WHERE id=NEW.budget_id)='locked' BEGIN SELECT RAISE(ABORT,'locked budget lines are immutable'); END;
CREATE TRIGGER accounting_locked_budget_lines_no_update BEFORE UPDATE ON accounting_budget_lines WHEN (SELECT status FROM accounting_budgets WHERE id=OLD.budget_id)='locked' BEGIN SELECT RAISE(ABORT,'locked budget lines are immutable'); END;
CREATE TRIGGER accounting_posted_entry_immutable BEFORE UPDATE ON accounting_journal_entries
WHEN OLD.status IN ('posted','reversed') AND (NEW.entry_date<>OLD.entry_date OR COALESCE(NEW.posting_date,'')<>COALESCE(OLD.posting_date,'') OR NEW.description<>OLD.description OR NEW.source_type<>OLD.source_type OR COALESCE(NEW.source_id,'')<>COALESCE(OLD.source_id,'') OR NEW.total_debits<>OLD.total_debits OR NEW.total_credits<>OLD.total_credits)
BEGIN SELECT RAISE(ABORT,'posted journal entry is immutable'); END;
CREATE TRIGGER accounting_posted_lines_no_delete BEFORE DELETE ON accounting_journal_lines
WHEN (SELECT status FROM accounting_journal_entries WHERE id=OLD.journal_entry_id) IN ('posted','reversed')
BEGIN SELECT RAISE(ABORT,'posted journal lines are immutable'); END;
CREATE TRIGGER accounting_posted_lines_no_insert BEFORE INSERT ON accounting_journal_lines
WHEN (SELECT status FROM accounting_journal_entries WHERE id=NEW.journal_entry_id) IN ('posted','reversed')
BEGIN SELECT RAISE(ABORT,'posted journal lines are immutable'); END;
CREATE TRIGGER accounting_posted_lines_no_update BEFORE UPDATE ON accounting_journal_lines
WHEN (SELECT status FROM accounting_journal_entries WHERE id=OLD.journal_entry_id) IN ('posted','reversed')
BEGIN SELECT RAISE(ABORT,'posted journal lines are immutable'); END;
