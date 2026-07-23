-- Non-customer Phase G canary only. Deterministic and idempotent.
-- 3,000 balanced journals / 6,000 lines spanning 2024-2026.
WITH d(n) AS (VALUES(0),(1),(2),(3),(4),(5),(6),(7),(8),(9)),
nums(n) AS (SELECT a.n + 10*b.n + 100*c.n + 1000*e.n FROM d a CROSS JOIN d b CROSS JOIN d c CROSS JOIN d e WHERE a.n + 10*b.n + 100*c.n + 1000*e.n < 3000)
INSERT OR IGNORE INTO accounting_journal_entries
  (id,entry_number,entry_date,posting_date,description,status,source_type,source_id,fiscal_year_id,accounting_period_id,total_debits,total_credits,created_by_actor_type,created_by_actor_id,correlation_id)
SELECT 'phase_g_vol_je_'||printf('%04d',n),'PGV-'||printf('%04d',n),date('2024-01-01','+'||(n%900)||' days'),date('2024-01-01','+'||(n%900)||' days'),
  'Representative weekly offering and operating activity','draft','manual','phase-g-volume-'||n,'fy_2026','period_2026_'||(1+(n%12)),10000+(n%25000),10000+(n%25000),'system','phase-g-volume','phase-g-volume-2026-07-21'
FROM nums;

WITH d(n) AS (VALUES(0),(1),(2),(3),(4),(5),(6),(7),(8),(9)),
nums(n) AS (SELECT a.n + 10*b.n + 100*c.n + 1000*e.n FROM d a CROSS JOIN d b CROSS JOIN d c CROSS JOIN d e WHERE a.n + 10*b.n + 100*c.n + 1000*e.n < 3000)
INSERT OR IGNORE INTO accounting_journal_lines(id,journal_entry_id,line_number,account_id,fund_id,description,debit_amount,credit_amount)
SELECT 'phase_g_vol_jl_d_'||printf('%04d',n),'phase_g_vol_je_'||printf('%04d',n),1,'acct_1010','fund_general','Deposit',10000+(n%25000),0 FROM nums WHERE NOT EXISTS (SELECT 1 FROM accounting_journal_lines x WHERE x.id='phase_g_vol_jl_d_'||printf('%04d',n))
UNION ALL
SELECT 'phase_g_vol_jl_c_'||printf('%04d',n),'phase_g_vol_je_'||printf('%04d',n),2,'acct_4000','fund_general','Offering revenue',0,10000+(n%25000) FROM nums WHERE NOT EXISTS (SELECT 1 FROM accounting_journal_lines x WHERE x.id='phase_g_vol_jl_c_'||printf('%04d',n));

UPDATE accounting_journal_entries SET status='posted',posted_by_actor_type='system',posted_by_actor_id='phase-g-volume',posted_at=datetime('now')
WHERE correlation_id='phase-g-volume-2026-07-21' AND status='draft';

INSERT OR IGNORE INTO accounting_vendors(id,vendor_number,display_name,status,default_expense_account_id,default_fund_id,created_at,updated_at)
VALUES('phase_g_vendor','PG-VENDOR','Phase G Representative Vendor','active','acct_5000','fund_general',datetime('now'),datetime('now'));

WITH d(n) AS (VALUES(0),(1),(2),(3),(4),(5),(6),(7),(8),(9)),
nums(n) AS (SELECT a.n + 10*b.n + 100*c.n + 1000*e.n FROM d a CROSS JOIN d b CROSS JOIN d c CROSS JOIN d e WHERE a.n + 10*b.n + 100*c.n + 1000*e.n < 1200)
INSERT OR IGNORE INTO accounting_bills
  (id,bill_number,vendor_id,vendor_invoice_number,bill_date,due_date,description,status,approval_status,payment_status,subtotal_amount,total_amount,amount_paid,amount_due,created_by_actor_type,created_by_actor_id,correlation_id)
SELECT 'phase_g_bill_'||printf('%04d',n),'PGB-'||printf('%04d',n),'phase_g_vendor','INV-'||printf('%04d',n),date('2024-01-01','+'||(n%900)||' days'),date('2024-01-31','+'||(n%900)||' days'),
 'Representative parish operating bill',CASE WHEN n%5=0 THEN 'paid' ELSE 'approved' END,'approved',CASE WHEN n%5=0 THEN 'paid' ELSE 'unpaid' END,
 5000+(n%95000),5000+(n%95000),CASE WHEN n%5=0 THEN 5000+(n%95000) ELSE 0 END,CASE WHEN n%5=0 THEN 0 ELSE 5000+(n%95000) END,'system','phase-g-volume','phase-g-volume-2026-07-21'
FROM nums;

INSERT OR IGNORE INTO accounting_budgets(id,budget_name,fiscal_year_id,version_number,status,description,created_by)
VALUES('phase_g_budget','Phase G Representative Annual Budget','fy_2026',1,'approved','Representative-volume canary budget','phase-g-volume');

INSERT OR IGNORE INTO accounting_budget_lines(id,budget_id,account_id,fund_id,annual_amount,january_amount,february_amount,march_amount,april_amount,may_amount,june_amount,july_amount,august_amount,september_amount,october_amount,november_amount,december_amount,allocation_strategy,notes)
VALUES
('phase_g_budget_4000','phase_g_budget','acct_4000','fund_general',12000000,1000000,1000000,1000000,1000000,1000000,1000000,1000000,1000000,1000000,1000000,1000000,1000000,'even_monthly','Representative offering budget'),
('phase_g_budget_5000','phase_g_budget','acct_5000','fund_general',6000000,500000,500000,500000,500000,500000,500000,500000,500000,500000,500000,500000,500000,'even_monthly','Representative operating budget');

INSERT OR IGNORE INTO accounting_budget_lines(id,budget_id,account_id,fund_id,annual_amount,january_amount,february_amount,march_amount,april_amount,may_amount,june_amount,july_amount,august_amount,september_amount,october_amount,november_amount,december_amount,allocation_strategy,notes)
SELECT 'phase_g_budget_'||id,'phase_g_budget',id,'fund_general',1200000,100000,100000,100000,100000,100000,100000,100000,100000,100000,100000,100000,100000,'even_monthly','Representative departmental budget line'
FROM accounting_accounts WHERE is_active=1 AND is_posting_account=1 ORDER BY account_number LIMIT 20;

INSERT OR IGNORE INTO accounting_bank_accounts(id,name,account_id,account_type,institution_name,masked_last4,is_default,is_active,status)
VALUES('phase_g_bank','Phase G Canary Operating','acct_1010','checking','Canary Test Bank','0000',1,1,'active');

WITH d(n) AS (VALUES(0),(1),(2),(3),(4),(5),(6),(7),(8),(9)),
nums(n) AS (SELECT a.n + 10*b.n + 100*c.n + 1000*e.n FROM d a CROSS JOIN d b CROSS JOIN d c CROSS JOIN d e WHERE a.n + 10*b.n + 100*c.n + 1000*e.n < 2000)
INSERT OR IGNORE INTO accounting_bank_transactions
  (id,bank_account_id,source_type,external_transaction_id,statement_date,posted_date,description,normalized_description,amount,direction,status,match_status,matched_amount,unmatched_amount,duplicate_hash,raw_row_hash)
SELECT 'phase_g_bank_tx_'||printf('%04d',n),'phase_g_bank','csv','PGTX-'||printf('%04d',n),date('2024-01-01','+'||(n%900)||' days'),date('2024-01-01','+'||(n%900)||' days'),
 'Representative bank transaction','representative bank transaction',1000+(n%50000),CASE WHEN n%3=0 THEN 'debit' ELSE 'credit' END,'imported',CASE WHEN n%4=0 THEN 'matched' ELSE 'unmatched' END,
 CASE WHEN n%4=0 THEN 1000+(n%50000) ELSE 0 END,CASE WHEN n%4=0 THEN 0 ELSE 1000+(n%50000) END,'phase-g-dup-'||n,'phase-g-row-'||n FROM nums;

WITH RECURSIVE nums(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM nums WHERE n<35)
INSERT OR IGNORE INTO accounting_reconciliation_sessions
  (id,bank_account_id,statement_start_date,statement_end_date,statement_beginning_balance,statement_ending_balance,ledger_beginning_balance,status,calculated_ending_balance,difference,created_by_actor_type,created_by_actor_id,correlation_id)
SELECT 'phase_g_recon_'||printf('%02d',n),'phase_g_bank',date('2024-01-01','+'||(n*30)||' days'),date('2024-01-31','+'||(n*30)||' days'),1000000+n*10000,1010000+n*10000,1000000+n*10000,
 CASE WHEN n<30 THEN 'completed' ELSE 'draft' END,1010000+n*10000,0,'system','phase-g-volume','phase-g-volume-2026-07-21' FROM nums;
