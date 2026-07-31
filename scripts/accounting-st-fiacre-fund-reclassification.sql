-- Auditable St. Fiacre fund cleanup. Posted source entries remain immutable;
-- these journals move their balances and activity to the canonical live funds.
PRAGMA foreign_keys = ON;

-- $7,525.00 General Stewardship -> General Operating Fund.
INSERT OR IGNORE INTO accounting_journal_entries
  (id,entry_number,entry_date,posting_date,description,status,source_type,source_id,
   fiscal_year_id,accounting_period_id,total_debits,total_credits,
   created_by_actor_type,created_by_actor_id,posted_by_actor_type,posted_by_actor_id,
   posted_at,correlation_id)
SELECT
  'je_reclass_stewardship_general','JE-RECLASS-FUND-002','2026-07-31','2026-07-31',
  'Reclassify General Stewardship into General Operating Fund','draft',
  'fund_reclassification','st-fiacre:stewardship-to-general',
  'fy_2026','period_2026_07',1505000,1505000,
  'system','agapay_operational_sync','system','agapay_operational_sync',
  '2026-07-31T19:00:00Z','st-fiacre-fund-cleanup'
WHERE (SELECT COALESCE(SUM(debit_amount-credit_amount),0) FROM accounting_journal_lines l
       JOIN accounting_journal_entries e ON e.id=l.journal_entry_id
       WHERE l.fund_id='fund_giving_stewardship' AND l.account_id='acct_1010'
         AND e.status IN ('posted','reversed'))=752500
  AND (SELECT COALESCE(SUM(credit_amount-debit_amount),0) FROM accounting_journal_lines l
       JOIN accounting_journal_entries e ON e.id=l.journal_entry_id
       WHERE l.fund_id='fund_giving_stewardship' AND l.account_id='acct_4010'
         AND e.status IN ('posted','reversed'))=752500;

WITH lines(id,line_number,account_id,fund_id,description,debit_amount,credit_amount) AS (
  VALUES
    ('jl_reclass_stewardship_01',1,'acct_1010','fund_general','Move stewardship cash into General Operating',752500,0),
    ('jl_reclass_stewardship_02',2,'acct_1010','fund_giving_stewardship','Remove cash from archived General Stewardship',0,752500),
    ('jl_reclass_stewardship_03',3,'acct_4010','fund_giving_stewardship','Remove revenue from archived General Stewardship',752500,0),
    ('jl_reclass_stewardship_04',4,'acct_4010','fund_general','Move revenue into General Operating',0,752500)
)
INSERT OR IGNORE INTO accounting_journal_lines
  (id,journal_entry_id,line_number,account_id,fund_id,description,debit_amount,credit_amount)
SELECT id,'je_reclass_stewardship_general',line_number,account_id,fund_id,description,debit_amount,credit_amount
FROM lines WHERE EXISTS (SELECT 1 FROM accounting_journal_entries WHERE id='je_reclass_stewardship_general' AND status='draft');

UPDATE accounting_journal_entries SET status='posted',updated_at=datetime('now')
WHERE id='je_reclass_stewardship_general' AND status='draft'
  AND (SELECT COUNT(*) FROM accounting_journal_lines WHERE journal_entry_id='je_reclass_stewardship_general')=4
  AND (SELECT SUM(debit_amount) FROM accounting_journal_lines WHERE journal_entry_id='je_reclass_stewardship_general')=1505000
  AND (SELECT SUM(credit_amount) FROM accounting_journal_lines WHERE journal_entry_id='je_reclass_stewardship_general')=1505000;

-- $75.00 generic Campaign / Appeal -> the live Church Roof Restoration campaign.
INSERT OR IGNORE INTO accounting_journal_entries
  (id,entry_number,entry_date,posting_date,description,status,source_type,source_id,
   fiscal_year_id,accounting_period_id,total_debits,total_credits,
   created_by_actor_type,created_by_actor_id,posted_by_actor_type,posted_by_actor_id,
   posted_at,correlation_id)
SELECT
  'je_reclass_campaign_roof','JE-RECLASS-FUND-003','2026-07-31','2026-07-31',
  'Reclassify Campaign / Appeal into Church Roof Restoration','draft',
  'fund_reclassification','st-fiacre:campaign-to-roof',
  'fy_2026','period_2026_07',15000,15000,
  'system','agapay_operational_sync','system','agapay_operational_sync',
  '2026-07-31T19:01:00Z','st-fiacre-fund-cleanup'
WHERE (SELECT COALESCE(SUM(debit_amount-credit_amount),0) FROM accounting_journal_lines l
       JOIN accounting_journal_entries e ON e.id=l.journal_entry_id
       WHERE l.fund_id='fund_giving_campaign' AND l.account_id='acct_1010'
         AND e.status IN ('posted','reversed'))=7500
  AND (SELECT COALESCE(SUM(credit_amount-debit_amount),0) FROM accounting_journal_lines l
       JOIN accounting_journal_entries e ON e.id=l.journal_entry_id
       WHERE l.fund_id='fund_giving_campaign' AND l.account_id='acct_4020'
         AND e.status IN ('posted','reversed'))=7500;

WITH lines(id,line_number,account_id,fund_id,description,debit_amount,credit_amount) AS (
  VALUES
    ('jl_reclass_campaign_01',1,'acct_1010','fund_operational_66fab8284774e852c0f9','Move campaign cash into Church Roof Restoration',7500,0),
    ('jl_reclass_campaign_02',2,'acct_1010','fund_giving_campaign','Remove cash from archived Campaign / Appeal',0,7500),
    ('jl_reclass_campaign_03',3,'acct_4020','fund_giving_campaign','Remove revenue from archived Campaign / Appeal',7500,0),
    ('jl_reclass_campaign_04',4,'acct_4020','fund_operational_66fab8284774e852c0f9','Move revenue into Church Roof Restoration',0,7500)
)
INSERT OR IGNORE INTO accounting_journal_lines
  (id,journal_entry_id,line_number,account_id,fund_id,description,debit_amount,credit_amount)
SELECT id,'je_reclass_campaign_roof',line_number,account_id,fund_id,description,debit_amount,credit_amount
FROM lines WHERE EXISTS (SELECT 1 FROM accounting_journal_entries WHERE id='je_reclass_campaign_roof' AND status='draft');

UPDATE accounting_journal_entries SET status='posted',updated_at=datetime('now')
WHERE id='je_reclass_campaign_roof' AND status='draft'
  AND (SELECT COUNT(*) FROM accounting_journal_lines WHERE journal_entry_id='je_reclass_campaign_roof')=4
  AND (SELECT SUM(debit_amount) FROM accounting_journal_lines WHERE journal_entry_id='je_reclass_campaign_roof')=15000
  AND (SELECT SUM(credit_amount) FROM accounting_journal_lines WHERE journal_entry_id='je_reclass_campaign_roof')=15000;

-- Move the $1,250 roof-repair expense and payable from the retired building
-- fund to the current Building Fund. The original posted bill journal is kept.
INSERT OR IGNORE INTO accounting_journal_entries
  (id,entry_number,entry_date,posting_date,description,status,source_type,source_id,
   fiscal_year_id,accounting_period_id,total_debits,total_credits,
   created_by_actor_type,created_by_actor_id,posted_by_actor_type,posted_by_actor_id,
   posted_at,correlation_id)
SELECT
  'je_reclass_building_current','JE-RECLASS-FUND-004','2026-07-31','2026-07-31',
  'Reclassify retired Building Restoration activity into Building Fund','draft',
  'fund_reclassification','st-fiacre:building-to-current',
  'fy_2026','period_2026_07',250000,250000,
  'system','agapay_operational_sync','system','agapay_operational_sync',
  '2026-07-31T19:02:00Z','st-fiacre-fund-cleanup'
WHERE (SELECT COALESCE(SUM(debit_amount-credit_amount),0) FROM accounting_journal_lines l
       JOIN accounting_journal_entries e ON e.id=l.journal_entry_id
       WHERE l.fund_id='fund_building' AND l.account_id='acct_5410'
         AND e.status IN ('posted','reversed'))=125000
  AND (SELECT COALESCE(SUM(credit_amount-debit_amount),0) FROM accounting_journal_lines l
       JOIN accounting_journal_entries e ON e.id=l.journal_entry_id
       WHERE l.fund_id='fund_building' AND l.account_id='acct_2000'
         AND e.status IN ('posted','reversed'))=125000;

WITH lines(id,line_number,account_id,fund_id,description,debit_amount,credit_amount) AS (
  VALUES
    ('jl_reclass_building_01',1,'acct_5410','fund_giving_building','Move roof-repair expense into current Building Fund',125000,0),
    ('jl_reclass_building_02',2,'acct_5410','fund_building','Remove expense from retired Building Restoration fund',0,125000),
    ('jl_reclass_building_03',3,'acct_2000','fund_building','Remove payable from retired Building Restoration fund',125000,0),
    ('jl_reclass_building_04',4,'acct_2000','fund_giving_building','Move payable into current Building Fund',0,125000)
)
INSERT OR IGNORE INTO accounting_journal_lines
  (id,journal_entry_id,line_number,account_id,fund_id,description,debit_amount,credit_amount)
SELECT id,'je_reclass_building_current',line_number,account_id,fund_id,description,debit_amount,credit_amount
FROM lines WHERE EXISTS (SELECT 1 FROM accounting_journal_entries WHERE id='je_reclass_building_current' AND status='draft');

UPDATE accounting_journal_entries SET status='posted',updated_at=datetime('now')
WHERE id='je_reclass_building_current' AND status='draft'
  AND (SELECT COUNT(*) FROM accounting_journal_lines WHERE journal_entry_id='je_reclass_building_current')=4
  AND (SELECT SUM(debit_amount) FROM accounting_journal_lines WHERE journal_entry_id='je_reclass_building_current')=250000
  AND (SELECT SUM(credit_amount) FROM accounting_journal_lines WHERE journal_entry_id='je_reclass_building_current')=250000;

-- Make the SQL-created journals visible in the normal ledger audit trail.
WITH events(id,event_type,journal_entry_id) AS (
  VALUES
    ('event_reclass_stewardship_created','journal_entry.created','je_reclass_stewardship_general'),
    ('event_reclass_stewardship_posted','journal_entry.posted','je_reclass_stewardship_general'),
    ('event_reclass_campaign_created','journal_entry.created','je_reclass_campaign_roof'),
    ('event_reclass_campaign_posted','journal_entry.posted','je_reclass_campaign_roof'),
    ('event_reclass_building_created','journal_entry.created','je_reclass_building_current'),
    ('event_reclass_building_posted','journal_entry.posted','je_reclass_building_current')
)
INSERT OR IGNORE INTO accounting_ledger_events
  (id,event_type,journal_entry_id,actor_type,actor_id,reason_code,correlation_id,metadata_json)
SELECT id,event_type,journal_entry_id,'system','agapay_operational_sync','archived_fund_reclassification',
  'st-fiacre-fund-cleanup','{"preservesOriginalPostedEntries":true}'
FROM events WHERE EXISTS (
  SELECT 1 FROM accounting_journal_entries e WHERE e.id=events.journal_entry_id AND e.status='posted'
);

-- Repoint mutable operational routing records so future screens and postings
-- use live funds. Historical posted journal lines are intentionally untouched.
UPDATE accounting_integration_source_events SET designated_fund_id='fund_general',updated_at=datetime('now')
WHERE designated_fund_id='fund_giving_stewardship'
  AND EXISTS (SELECT 1 FROM accounting_journal_entries WHERE id='je_reclass_stewardship_general' AND status='posted');
UPDATE accounting_integration_source_events SET designated_fund_id='fund_operational_66fab8284774e852c0f9',updated_at=datetime('now')
WHERE designated_fund_id='fund_giving_campaign'
  AND EXISTS (SELECT 1 FROM accounting_journal_entries WHERE id='je_reclass_campaign_roof' AND status='posted');
UPDATE accounting_integration_source_events SET designated_fund_id='fund_operational_507346b39f44e02ecd15',updated_at=datetime('now')
WHERE designated_fund_id='fund_giving_alms'
  AND EXISTS (SELECT 1 FROM accounting_journal_entries WHERE id='je_reclass_alms_benevolence' AND status='posted');
UPDATE accounting_vendors SET default_fund_id='fund_giving_building',version=version+1,updated_at=datetime('now')
WHERE default_fund_id='fund_building'
  AND EXISTS (SELECT 1 FROM accounting_journal_entries WHERE id='je_reclass_building_current' AND status='posted');
UPDATE accounting_bill_lines SET fund_id='fund_giving_building',updated_at=datetime('now')
WHERE fund_id='fund_building'
  AND EXISTS (SELECT 1 FROM accounting_journal_entries WHERE id='je_reclass_building_current' AND status='posted');
