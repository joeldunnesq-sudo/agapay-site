-- Idempotent representative accounting data for the isolated St. Fiacre demo parish.
-- Amounts are integer cents. Stable demo_* identifiers make repeat execution safe.
PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO accounting_accounts
  (id,account_number,name,description,account_type_id,normal_balance,is_posting_account,is_system,is_active,requires_fund,cash_flow_classification)
VALUES
  ('acct_2000','2000','Accounts Payable','Approved parish obligations awaiting payment.','type_liability','credit',1,1,1,1,'operating'),
  ('acct_5010','5010','Clergy and Staff','Clergy stipends and parish staff expenses.','type_expense','debit',1,0,1,1,'operating'),
  ('acct_5210','5210','Utilities','Electricity, gas, water, and communications.','type_expense','debit',1,0,1,1,'operating'),
  ('acct_5310','5310','Liturgical Supplies','Candles, incense, altar supplies, and service books.','type_expense','debit',1,0,1,1,'operating'),
  ('acct_5410','5410','Repairs and Maintenance','Building and grounds maintenance.','type_expense','debit',1,0,1,1,'operating'),
  ('acct_5510','5510','Charitable Outreach','Parish almsgiving and community assistance.','type_expense','debit',1,0,1,1,'operating');

INSERT OR IGNORE INTO accounting_funds
  (id,code,name,description,restriction_type,purpose,is_default,is_active,is_system)
VALUES
  ('fund_building','BUILDING','Building Restoration Fund','Donor-restricted gifts for roof and iconography restoration.','donor_restricted_temporary','Building restoration',0,1,0),
  ('fund_outreach','OUTREACH','Charitable Outreach Fund','Donor-restricted gifts for parish almsgiving.','donor_restricted_temporary','Charitable outreach',0,1,0);

INSERT OR IGNORE INTO accounting_fiscal_years
  (id,name,start_date,end_date,status,is_current)
VALUES
  ('fy_2025','Fiscal Year 2025','2025-01-01','2025-12-31','closed',0),
  ('fy_2026','Fiscal Year 2026','2026-01-01','2026-12-31','open',1);

WITH RECURSIVE months(n) AS (
  VALUES(1) UNION ALL SELECT n+1 FROM months WHERE n<12
)
INSERT OR IGNORE INTO accounting_periods
  (id,fiscal_year_id,period_number,name,start_date,end_date,status,opened_at)
SELECT
  printf('period_2026_%02d',n),
  'fy_2026',
  n,
  CASE n
    WHEN 1 THEN 'January 2026' WHEN 2 THEN 'February 2026'
    WHEN 3 THEN 'March 2026' WHEN 4 THEN 'April 2026'
    WHEN 5 THEN 'May 2026' WHEN 6 THEN 'June 2026'
    WHEN 7 THEN 'July 2026' WHEN 8 THEN 'August 2026'
    WHEN 9 THEN 'September 2026' WHEN 10 THEN 'October 2026'
    WHEN 11 THEN 'November 2026' ELSE 'December 2026'
  END,
  date('2026-01-01',printf('+%d months',n-1)),
  date('2026-01-01',printf('+%d months',n),'-1 day'),
  CASE WHEN n=7 THEN 'open' ELSE 'future' END,
  CASE WHEN n=7 THEN '2026-07-01T00:00:00Z' ELSE NULL END
FROM months;

UPDATE accounting_settings
SET default_fund_id='fund_general',
    setup_completed_at=COALESCE(setup_completed_at,'2026-07-01T00:00:00Z'),
    setup_completed_by_actor_type=COALESCE(setup_completed_by_actor_type,'platform_user'),
    setup_completed_by_actor_id=COALESCE(setup_completed_by_actor_id,'st-fiacre-demo-seed'),
    opening_balances_disposition='posted',
    updated_at=datetime('now')
WHERE id='primary';

INSERT OR IGNORE INTO accounting_bank_accounts
  (id,name,account_id,account_type,institution_name,masked_last4,currency,is_default,is_active,status,opening_statement_date)
VALUES
  ('demo_bank_operating','Operating Checking','acct_1010','checking','Demo Community Bank','1842','USD',1,1,'active','2026-01-01');

INSERT OR IGNORE INTO accounting_check_settings
  (bank_account_id,next_check_number,check_style,payer_name,payer_address,signature_line_1,signature_line_2)
VALUES
  ('demo_bank_operating',1002,'top_check_two_stubs','St. Fiacre Orthodox Church','100 Garden Way\nMunster, IN 46321','Treasurer','Parish Priest');

INSERT OR IGNORE INTO accounting_vendors
  (id,vendor_number,display_name,legal_name,vendor_type,status,email,phone,address_line1,city,state_region,postal_code,country,payment_terms_id,default_expense_account_id,default_fund_id,default_payment_method,notes)
VALUES
  ('demo_vendor_utility','V-1001','Munster Municipal Utilities','Munster Municipal Utilities','utility','active','billing@example.test','219-555-0101','100 Utility Plaza','Munster','IN','46321','US','terms_net30','acct_5210','fund_general','check','Demo data only.'),
  ('demo_vendor_candles','V-1002','St. Tikhon Church Supply','St. Tikhon Church Supply','business','active','orders@example.test','570-555-0120','175 Monastery Road','South Canaan','PA','18459','US','terms_net30','acct_5310','fund_general','check','Demo data only.'),
  ('demo_vendor_roofing','V-1003','Fiacre Roofing & Masonry','Fiacre Roofing & Masonry LLC','business','active','office@example.test','219-555-0130','42 Calumet Avenue','Munster','IN','46321','US','terms_net30','acct_5410','fund_building','check','Demo data only.');

-- Balanced posted journals. Lines are inserted while entries are drafts, then finalized.
INSERT OR IGNORE INTO accounting_journal_entries
  (id,entry_number,entry_date,posting_date,description,status,source_type,fiscal_year_id,accounting_period_id,total_debits,total_credits,created_by_actor_type,created_by_actor_id,posted_by_actor_type,posted_by_actor_id,posted_at,correlation_id)
VALUES
  ('demo_je_opening','JE-DEMO-0001','2026-01-01','2026-01-01','Opening operating cash','draft','opening_balance','fy_2026','period_2026_01',2500000,2500000,'platform_user','st-fiacre-demo-seed','platform_user','st-fiacre-demo-seed','2026-01-01T12:00:00Z','st-fiacre-demo'),
  ('demo_je_giving','JE-DEMO-0002','2026-07-05','2026-07-05','Sunday giving deposit','draft','manual','fy_2026','period_2026_07',425000,425000,'platform_user','st-fiacre-demo-seed','platform_user','st-fiacre-demo-seed','2026-07-05T18:00:00Z','st-fiacre-demo'),
  ('demo_je_building','JE-DEMO-0003','2026-07-12','2026-07-12','Building restoration gifts','draft','manual','fy_2026','period_2026_07',175000,175000,'platform_user','st-fiacre-demo-seed','platform_user','st-fiacre-demo-seed','2026-07-12T18:00:00Z','st-fiacre-demo'),
  ('demo_je_utility','JE-DEMO-0004','2026-06-30','2026-06-30','June utilities accrued','draft','accounts_payable_bill','fy_2026','period_2026_06',28640,28640,'platform_user','st-fiacre-demo-seed','platform_user','st-fiacre-demo-seed','2026-06-30T20:00:00Z','st-fiacre-demo'),
  ('demo_je_candles','JE-DEMO-0005','2026-07-08','2026-07-08','Paschal candle and incense supplies','draft','accounts_payable_bill','fy_2026','period_2026_07',48675,48675,'platform_user','st-fiacre-demo-seed','platform_user','st-fiacre-demo-seed','2026-07-08T20:00:00Z','st-fiacre-demo');

WITH demo_lines(id,journal_entry_id,line_number,account_id,fund_id,description,debit_amount,credit_amount) AS (
  VALUES
    ('demo_jl_001','demo_je_opening',1,'acct_1010','fund_general','Opening operating cash',2500000,0),
    ('demo_jl_002','demo_je_opening',2,'acct_3000','fund_general','Opening net assets',0,2500000),
    ('demo_jl_003','demo_je_giving',1,'acct_1010','fund_general','Sunday deposit',425000,0),
    ('demo_jl_004','demo_je_giving',2,'acct_4010','fund_general','General donations',0,425000),
    ('demo_jl_005','demo_je_building',1,'acct_1010','fund_building','Building fund deposit',175000,0),
    ('demo_jl_006','demo_je_building',2,'acct_4020','fund_building','Restricted contributions',0,175000),
    ('demo_jl_007','demo_je_utility',1,'acct_5210','fund_general','June utilities',28640,0),
    ('demo_jl_008','demo_je_utility',2,'acct_2000','fund_general','Utilities payable',0,28640),
    ('demo_jl_009','demo_je_candles',1,'acct_5310','fund_general','Candles and incense',48675,0),
    ('demo_jl_010','demo_je_candles',2,'acct_2000','fund_general','Church supply payable',0,48675)
)
INSERT INTO accounting_journal_lines
  (id,journal_entry_id,line_number,account_id,fund_id,description,debit_amount,credit_amount)
SELECT d.id,d.journal_entry_id,d.line_number,d.account_id,d.fund_id,d.description,d.debit_amount,d.credit_amount
FROM demo_lines d
WHERE NOT EXISTS(SELECT 1 FROM accounting_journal_lines existing WHERE existing.id=d.id);

UPDATE accounting_journal_entries
SET status='posted',updated_at=datetime('now')
WHERE id LIKE 'demo_je_%' AND status='draft';

INSERT OR IGNORE INTO accounting_bills
  (id,bill_number,vendor_id,vendor_invoice_number,bill_date,received_date,due_date,posting_date,description,currency,status,approval_status,payment_status,subtotal_amount,tax_amount,total_amount,amount_paid,amount_due,accounts_payable_account_id,created_by_actor_type,created_by_actor_id,submitted_by_actor_type,submitted_by_actor_id,approved_by_actor_type,approved_by_actor_id,posted_journal_entry_id,submitted_at,approved_at,posted_at,correlation_id)
VALUES
  ('demo_bill_utility','B-DEMO-1001','demo_vendor_utility','UTIL-2026-06','2026-06-30','2026-07-02','2026-07-30','2026-06-30','June electricity, water, and refuse','USD','posted','approved','unpaid',28640,0,28640,0,28640,'acct_2000','platform_user','demo-bookkeeper','platform_user','demo-bookkeeper','platform_user','demo-treasurer','demo_je_utility','2026-07-02T14:00:00Z','2026-07-03T14:00:00Z','2026-07-03T14:05:00Z','st-fiacre-demo'),
  ('demo_bill_candles','B-DEMO-1002','demo_vendor_candles','STT-58421','2026-07-08','2026-07-10','2026-08-07','2026-07-08','Paschal candle, beeswax tapers, and incense','USD','posted','approved','scheduled',48675,0,48675,0,48675,'acct_2000','platform_user','demo-bookkeeper','platform_user','demo-bookkeeper','platform_user','demo-treasurer','demo_je_candles','2026-07-10T14:00:00Z','2026-07-11T14:00:00Z','2026-07-11T14:05:00Z','st-fiacre-demo'),
  ('demo_bill_roof','B-DEMO-1003','demo_vendor_roofing','FRM-2026-071','2026-07-15','2026-07-15','2026-08-14',NULL,'Roof inspection and emergency flashing repair','USD','approved','approved','unpaid',125000,0,125000,0,125000,'acct_2000','platform_user','demo-bookkeeper','platform_user','demo-bookkeeper','platform_user','demo-treasurer',NULL,'2026-07-15T14:00:00Z','2026-07-16T14:00:00Z',NULL,'st-fiacre-demo');

WITH demo_bill_lines(id,bill_id,line_number,description,account_id,fund_id,quantity,unit_amount,line_amount,tax_amount) AS (
  VALUES
    ('demo_bl_utility','demo_bill_utility',1,'June parish utilities','acct_5210','fund_general',1,28640,28640,0),
    ('demo_bl_candles','demo_bill_candles',1,'Candles, tapers, and incense','acct_5310','fund_general',1,48675,48675,0),
    ('demo_bl_roof','demo_bill_roof',1,'Roof inspection and emergency flashing repair','acct_5410','fund_building',1,125000,125000,0)
)
INSERT INTO accounting_bill_lines
  (id,bill_id,line_number,description,account_id,fund_id,quantity,unit_amount,line_amount,tax_amount)
SELECT d.id,d.bill_id,d.line_number,d.description,d.account_id,d.fund_id,d.quantity,d.unit_amount,d.line_amount,d.tax_amount
FROM demo_bill_lines d
WHERE NOT EXISTS(SELECT 1 FROM accounting_bill_lines existing WHERE existing.id=d.id);

INSERT OR IGNORE INTO accounting_bill_approvals
  (id,bill_id,sequence_number,actor_type,actor_id,decision,reason,decided_at)
VALUES
  ('demo_approval_utility','demo_bill_utility',1,'platform_user','demo-treasurer','approved','Routine utility expense.','2026-07-03T14:00:00Z'),
  ('demo_approval_candles','demo_bill_candles',1,'platform_user','demo-treasurer','approved','Liturgical supply replenishment.','2026-07-11T14:00:00Z'),
  ('demo_approval_roof','demo_bill_roof',1,'platform_user','demo-treasurer','approved','Emergency building repair within approved limit.','2026-07-16T14:00:00Z');

-- An approved, unprinted check provides the fixture required for print/reprint/void QA.
INSERT OR IGNORE INTO accounting_payments
  (id,payment_number,vendor_id,payment_date,payment_method,bank_account_id,status,currency,total_amount,check_number,memo,created_by_actor_type,created_by_actor_id,approved_by_actor_type,approved_by_actor_id,correlation_id)
VALUES
  ('demo_payment_check','P-DEMO-1001','demo_vendor_candles','2026-07-23','check','demo_bank_operating','approved','USD',48675,'1001','Approved demo check awaiting original print','platform_user','demo-bookkeeper','platform_user','demo-treasurer','st-fiacre-demo');

INSERT OR IGNORE INTO accounting_payment_applications
  (id,payment_id,bill_id,amount_applied)
VALUES
  ('demo_application_check','demo_payment_check','demo_bill_candles',48675);

INSERT OR IGNORE INTO accounting_budgets
  (id,budget_name,fiscal_year_id,version_number,status,description,created_by,approved_by,locked_by,submitted_at,approved_at,locked_at)
VALUES
  ('demo_budget_2026','2026 Parish Operating Budget','fy_2026',1,'draft','Council-approved annual operating plan.','demo-treasurer','demo-council','demo-treasurer','2025-12-01T14:00:00Z','2025-12-15T14:00:00Z','2025-12-16T14:00:00Z');

WITH demo_budget_lines(id,budget_id,account_id,fund_id,annual_amount,january_amount,february_amount,march_amount,april_amount,may_amount,june_amount,july_amount,august_amount,september_amount,october_amount,november_amount,december_amount,allocation_strategy,notes) AS (
  VALUES
    ('demo_budget_giving','demo_budget_2026','acct_4010','fund_general',7200000,600000,600000,600000,600000,600000,600000,600000,600000,600000,600000,600000,600000,'even_monthly','Expected general giving.'),
    ('demo_budget_staff','demo_budget_2026','acct_5010','fund_general',3600000,300000,300000,300000,300000,300000,300000,300000,300000,300000,300000,300000,300000,'even_monthly','Clergy and staff plan.'),
    ('demo_budget_utilities','demo_budget_2026','acct_5210','fund_general',420000,35000,35000,35000,35000,35000,35000,35000,35000,35000,35000,35000,35000,'even_monthly','Utilities plan.'),
    ('demo_budget_liturgical','demo_budget_2026','acct_5310','fund_general',360000,30000,30000,30000,30000,30000,30000,30000,30000,30000,30000,30000,30000,'even_monthly','Liturgical supplies plan.')
)
INSERT INTO accounting_budget_lines
  (id,budget_id,account_id,fund_id,annual_amount,january_amount,february_amount,march_amount,april_amount,may_amount,june_amount,july_amount,august_amount,september_amount,october_amount,november_amount,december_amount,allocation_strategy,notes)
SELECT d.id,d.budget_id,d.account_id,d.fund_id,d.annual_amount,d.january_amount,d.february_amount,d.march_amount,d.april_amount,d.may_amount,d.june_amount,d.july_amount,d.august_amount,d.september_amount,d.october_amount,d.november_amount,d.december_amount,d.allocation_strategy,d.notes
FROM demo_budget_lines d
WHERE NOT EXISTS(SELECT 1 FROM accounting_budget_lines existing WHERE existing.id=d.id);

INSERT OR IGNORE INTO accounting_budget_assumptions
  (id,budget_id,sort_order,title,description)
VALUES
  ('demo_assumption_1','demo_budget_2026',1,'Giving','General giving remains consistent with the prior year.'),
  ('demo_assumption_2','demo_budget_2026',2,'Facilities','Building restoration is supported by restricted gifts and tracked separately.');

UPDATE accounting_budgets
SET status='locked',updated_at=datetime('now')
WHERE id='demo_budget_2026' AND status='draft';

INSERT OR IGNORE INTO accounting_bank_transactions
  (id,bank_account_id,source_type,external_transaction_id,statement_date,posted_date,effective_date,description,normalized_description,reference_number,amount,direction,currency,transaction_type,status,match_status,matched_amount,unmatched_amount,duplicate_hash,raw_row_hash)
VALUES
  ('demo_bank_tx_giving','demo_bank_operating','manual','DEMO-DEP-0705','2026-07-31','2026-07-06','2026-07-05','Sunday giving deposit','SUNDAY GIVING DEPOSIT','DEP-0705',425000,'credit','USD','deposit','imported','matched',425000,0,'demo-hash-giving','demo-raw-giving');

INSERT OR IGNORE INTO accounting_bank_transactions
  (id,bank_account_id,source_type,external_transaction_id,statement_date,posted_date,effective_date,description,normalized_description,reference_number,amount,direction,currency,transaction_type,status,match_status,matched_amount,unmatched_amount,duplicate_hash,raw_row_hash)
VALUES
  ('demo_bank_tx_building','demo_bank_operating','manual','DEMO-DEP-0712','2026-07-31','2026-07-13','2026-07-12','Building restoration deposit','BUILDING RESTORATION DEPOSIT','DEP-0712',175000,'credit','USD','deposit','imported','matched',175000,0,'demo-hash-building','demo-raw-building');

INSERT OR IGNORE INTO accounting_bank_transactions
  (id,bank_account_id,source_type,external_transaction_id,statement_date,posted_date,effective_date,description,normalized_description,reference_number,amount,direction,currency,transaction_type,status,match_status,matched_amount,unmatched_amount,duplicate_hash,raw_row_hash)
VALUES
  ('demo_bank_tx_fee','demo_bank_operating','manual','DEMO-FEE-0715','2026-07-31','2026-07-15',NULL,'Monthly account fee','MONTHLY ACCOUNT FEE','FEE-0715',1500,'debit','USD','fee','imported','unmatched',0,1500,'demo-hash-fee','demo-raw-fee');

INSERT OR IGNORE INTO accounting_reconciliation_sessions
  (id,bank_account_id,statement_start_date,statement_end_date,statement_beginning_balance,statement_ending_balance,ledger_beginning_balance,status,cleared_deposits,cleared_withdrawals,adjustments,calculated_ending_balance,difference,created_by_actor_type,created_by_actor_id,correlation_id)
VALUES
  ('demo_recon_july','demo_bank_operating','2026-07-01','2026-07-31',2500000,3098500,2500000,'in_progress',600000,1500,0,3098500,0,'platform_user','demo-bookkeeper','st-fiacre-demo');
