-- Idempotent St. Fiacre backfill from the Giving Overview seed snapshot.
-- Gross giving: $12,560.00; Candles: $410.00; Campaign / Appeal: $75.00.
-- The pre-existing $6,000 manual demo deposits are reversed before the
-- source-linked AGAPAY Give snapshot is posted.
PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO accounting_funds
  (id,code,name,description,restriction_type,purpose,is_default,is_active,is_system)
VALUES
  ('fund_giving_stewardship','STEWARDSHIP','General Stewardship','Synced from AGAPAY Give.','unrestricted','General stewardship',0,1,0),
  ('fund_giving_candle','CANDLE','Candles / Vigil Lights','Synced from AGAPAY Give.','donor_restricted_temporary','Candles and vigil lights',0,1,0),
  ('fund_giving_building','BUILDING-GIVE','Building Fund','Synced from AGAPAY Give.','donor_restricted_temporary','Building needs',0,1,0),
  ('fund_giving_alms','ALMS','Poor Box / Alms','Synced from AGAPAY Give.','donor_restricted_temporary','Charitable alms',0,1,0),
  ('fund_giving_campaign','CAMPAIGN','Campaign / Appeal','Synced from AGAPAY campaign giving.','donor_restricted_temporary','Parish campaigns and appeals',0,1,0),
  ('fund_giving_iconography','ICONOGRAPHY','Iconography Fund','Synced from AGAPAY Give.','donor_restricted_temporary','Iconography',0,1,0),
  ('fund_giving_memorial','MEMORIAL','Memorial / Panakhida','Synced from AGAPAY Give.','donor_restricted_temporary','Memorials and panakhidas',0,1,0);

-- Reverse the older hand-entered giving examples without altering posted books.
INSERT OR IGNORE INTO accounting_journal_entries
  (id,entry_number,entry_date,posting_date,description,status,source_type,source_id,
   fiscal_year_id,accounting_period_id,total_debits,total_credits,
   created_by_actor_type,created_by_actor_id,posted_by_actor_type,posted_by_actor_id,posted_at,correlation_id)
VALUES
  ('demo_je_giving_legacy_reversal','JE-DEMO-GIVE-REV','2026-07-23','2026-07-23',
   'Replace manual demo giving with AGAPAY Giving Overview source data','draft',
   'agapay_give_backfill','st-fiacre:legacy-demo-reversal','fy_2026','period_2026_07',
   600000,600000,'system','agapay_operational_sync','system','agapay_operational_sync',
   '2026-07-23T18:00:00Z','st-fiacre-giving-backfill');

WITH reversal_lines(id,line_number,account_id,fund_id,description,debit_amount,credit_amount) AS (
  VALUES
    ('demo_give_rev_01',1,'acct_4010','fund_general','Reverse manual general giving',425000,0),
    ('demo_give_rev_02',2,'acct_1010','fund_general','Reverse manual general deposit',0,425000),
    ('demo_give_rev_03',3,'acct_4020','fund_building','Reverse manual building giving',175000,0),
    ('demo_give_rev_04',4,'acct_1010','fund_building','Reverse manual building deposit',0,175000)
)
INSERT OR IGNORE INTO accounting_journal_lines
  (id,journal_entry_id,line_number,account_id,fund_id,description,debit_amount,credit_amount)
SELECT id,'demo_je_giving_legacy_reversal',line_number,account_id,fund_id,description,debit_amount,credit_amount
FROM reversal_lines
WHERE EXISTS (
  SELECT 1 FROM accounting_journal_entries
  WHERE id='demo_je_giving_legacy_reversal' AND status='draft'
);

UPDATE accounting_journal_entries
SET status='posted',updated_at=datetime('now')
WHERE id='demo_je_giving_legacy_reversal' AND status='draft';

-- Post one source-linked journal per Giving Overview allocation so fund
-- activity, the ledger, reports, and the integration overview agree.
WITH giving(category,amount,fund_id,revenue_account_id,entry_number) AS (
  VALUES
    ('stewardship',752500,'fund_giving_stewardship','acct_4010','JE-GIVE-SEED-001'),
    ('candle',41000,'fund_giving_candle','acct_4020','JE-GIVE-SEED-002'),
    ('building',260000,'fund_giving_building','acct_4020','JE-GIVE-SEED-003'),
    ('alms',30000,'fund_giving_alms','acct_4020','JE-GIVE-SEED-004'),
    ('campaign',7500,'fund_giving_campaign','acct_4020','JE-GIVE-SEED-005'),
    ('iconography',130000,'fund_giving_iconography','acct_4020','JE-GIVE-SEED-006'),
    ('memorial',35000,'fund_giving_memorial','acct_4020','JE-GIVE-SEED-007')
)
INSERT OR IGNORE INTO accounting_journal_entries
  (id,entry_number,entry_date,posting_date,description,status,source_type,source_id,source_event_id,
   fiscal_year_id,accounting_period_id,total_debits,total_credits,
   created_by_actor_type,created_by_actor_id,posted_by_actor_type,posted_by_actor_id,posted_at,correlation_id)
SELECT
  'demo_je_give_' || category,entry_number,'2026-07-23','2026-07-23',
  'AGAPAY Giving Overview — ' || category,'draft','agapay_give',
  'st-fiacre:2026:' || category,'st-fiacre:2026:' || category,
  'fy_2026','period_2026_07',amount,amount,
  'system','agapay_operational_sync','system','agapay_operational_sync',
  '2026-07-23T18:05:00Z','st-fiacre-giving-backfill'
FROM giving;

WITH giving(category,amount,fund_id,revenue_account_id) AS (
  VALUES
    ('stewardship',752500,'fund_giving_stewardship','acct_4010'),
    ('candle',41000,'fund_giving_candle','acct_4020'),
    ('building',260000,'fund_giving_building','acct_4020'),
    ('alms',30000,'fund_giving_alms','acct_4020'),
    ('campaign',7500,'fund_giving_campaign','acct_4020'),
    ('iconography',130000,'fund_giving_iconography','acct_4020'),
    ('memorial',35000,'fund_giving_memorial','acct_4020')
)
INSERT OR IGNORE INTO accounting_journal_lines
  (id,journal_entry_id,line_number,account_id,fund_id,description,debit_amount,credit_amount)
SELECT 'demo_jl_give_' || category || '_cash','demo_je_give_' || category,1,
       'acct_1010',fund_id,'AGAPAY Give deposit',amount,0
FROM giving
WHERE EXISTS (
  SELECT 1 FROM accounting_journal_entries
  WHERE id='demo_je_give_' || category AND status='draft'
)
UNION ALL
SELECT 'demo_jl_give_' || category || '_revenue','demo_je_give_' || category,2,
       revenue_account_id,fund_id,'AGAPAY Give contribution',0,amount
FROM giving
WHERE EXISTS (
  SELECT 1 FROM accounting_journal_entries
  WHERE id='demo_je_give_' || category AND status='draft'
);

UPDATE accounting_journal_entries
SET status='posted',updated_at=datetime('now')
WHERE id LIKE 'demo_je_give_%' AND status='draft';

WITH giving(category,amount,fund_id) AS (
  VALUES
    ('stewardship',752500,'fund_giving_stewardship'),
    ('candle',41000,'fund_giving_candle'),
    ('building',260000,'fund_giving_building'),
    ('alms',30000,'fund_giving_alms'),
    ('campaign',7500,'fund_giving_campaign'),
    ('iconography',130000,'fund_giving_iconography'),
    ('memorial',35000,'fund_giving_memorial')
)
INSERT OR IGNORE INTO accounting_integration_source_events
  (id,source_system,source_type,source_event_id,source_object_id,occurred_at,received_at,
   currency,gross_amount,net_amount,status,mapping_status,posting_status,journal_entry_id,
   donation_id,donation_type,campaign_id,designated_fund_id,donor_restricted,
   correlation_id,payload_hash)
SELECT
  'demo_src_give_' || category,'agapay_give','donation_succeeded',
  'st-fiacre:2026:' || category,'st-fiacre:2026:' || category,
  '2026-07-23T18:05:00Z','2026-07-23T18:05:00Z','USD',amount,amount,
  'posted','resolved','posted','demo_je_give_' || category,
  'st-fiacre:2026:' || category,category,
  CASE WHEN category='campaign' THEN 'alms' ELSE NULL END,
  fund_id,CASE WHEN category='stewardship' THEN 0 ELSE 1 END,
  'st-fiacre-giving-backfill','st-fiacre-giving-seed-' || category
FROM giving;

WITH giving(category) AS (
  VALUES ('stewardship'),('candle'),('building'),('alms'),('campaign'),('iconography'),('memorial')
)
INSERT OR IGNORE INTO accounting_entry_links
  (id,journal_entry_id,source_type,source_id,relationship_type)
SELECT 'demo_link_give_' || category,'demo_je_give_' || category,
       'agapay_give','st-fiacre:2026:' || category,'accounting_source'
FROM giving;

-- The original two matched deposits total $6,000. Add the remaining $6,560
-- so bank reconciliation agrees with the $12,560 Giving Overview snapshot.
INSERT OR IGNORE INTO accounting_bank_transactions
  (id,bank_account_id,source_type,external_transaction_id,statement_date,posted_date,effective_date,
   description,normalized_description,reference_number,amount,direction,currency,transaction_type,
   status,match_status,matched_amount,unmatched_amount,duplicate_hash,raw_row_hash)
VALUES
  ('demo_bank_tx_giving_backfill','demo_bank_operating','agapay_give','DEMO-GIVE-BACKFILL-2026',
   '2026-07-31','2026-07-23','2026-07-23','AGAPAY Giving Overview backfill',
   'AGAPAY GIVING OVERVIEW BACKFILL','GIVE-BACKFILL',656000,'credit','USD','deposit',
   'imported','matched',656000,0,'demo-hash-giving-backfill','demo-raw-giving-backfill');

UPDATE accounting_reconciliation_sessions
SET cleared_deposits=1256000,
    calculated_ending_balance=3754500,
    statement_ending_balance=3754500,
    difference=0,
    updated_at=datetime('now')
WHERE id='demo_recon_july';

-- Historical Parish Commerce / bookstore orders visible in the parish demo.
-- Gross sales are $92.90 (displayed as $93); Stripe fees total $3.30.
WITH orders(order_id,occurred_at,gross,fee,net) AS (
  VALUES
    ('bookstore_demo_joel_2026a','2026-07-02T15:20:00.000Z',4995,175,4820),
    ('bookstore_demo_joel_2026b','2026-06-27T11:05:00.000Z',4295,155,4140)
)
INSERT OR IGNORE INTO accounting_journal_entries
  (id,entry_number,entry_date,posting_date,description,status,source_type,source_id,source_event_id,
   fiscal_year_id,accounting_period_id,total_debits,total_credits,
   created_by_actor_type,created_by_actor_id,posted_by_actor_type,posted_by_actor_id,posted_at,correlation_id)
SELECT
  'demo_je_commerce_' || substr(order_id,-5),'JE-COM-' || upper(substr(order_id,-5)),
  substr(occurred_at,1,10),substr(occurred_at,1,10),'Bookstore order ' || order_id,
  'draft','commerce.commerce_sale_completed',order_id,'commerce:' || order_id || ':completed',
  'fy_2026',CASE WHEN substr(occurred_at,6,2)='06' THEN 'period_2026_06' ELSE 'period_2026_07' END,
  gross,gross,'system','agapay_operational_sync','system','agapay_operational_sync',
  occurred_at,'st-fiacre-commerce-backfill'
FROM orders;

WITH orders(order_id,gross) AS (
  VALUES ('bookstore_demo_joel_2026a',4995),('bookstore_demo_joel_2026b',4295)
)
INSERT OR IGNORE INTO accounting_journal_lines
  (id,journal_entry_id,line_number,account_id,fund_id,description,debit_amount,credit_amount)
SELECT 'demo_jl_commerce_' || substr(order_id,-5) || '_clearing',
       'demo_je_commerce_' || substr(order_id,-5),1,'acct_1110','fund_general',
       'Stripe bookstore clearing',gross,0
FROM orders
WHERE EXISTS (
  SELECT 1 FROM accounting_journal_entries
  WHERE id='demo_je_commerce_' || substr(order_id,-5) AND status='draft'
)
UNION ALL
SELECT 'demo_jl_commerce_' || substr(order_id,-5) || '_revenue',
       'demo_je_commerce_' || substr(order_id,-5),2,'acct_4050','fund_general',
       'Bookstore sales revenue',0,gross
FROM orders
WHERE EXISTS (
  SELECT 1 FROM accounting_journal_entries
  WHERE id='demo_je_commerce_' || substr(order_id,-5) AND status='draft'
);

UPDATE accounting_journal_entries
SET status='posted',updated_at=datetime('now')
WHERE id LIKE 'demo_je_commerce_%' AND status='draft';

WITH orders(order_id,occurred_at,gross,fee,net) AS (
  VALUES
    ('bookstore_demo_joel_2026a','2026-07-02T15:20:00.000Z',4995,175,4820),
    ('bookstore_demo_joel_2026b','2026-06-27T11:05:00.000Z',4295,155,4140)
)
INSERT OR IGNORE INTO accounting_integration_source_events
  (id,source_system,source_type,source_event_id,source_object_id,occurred_at,received_at,
   currency,gross_amount,fee_amount,net_amount,status,mapping_status,posting_status,journal_entry_id,
   designated_fund_id,correlation_id,payload_hash,commerce_channel,order_number,tender_type,
   gross_merchandise_amount,tax_exempt_amount)
SELECT
  'demo_src_commerce_' || substr(order_id,-5),'agapay_commerce','commerce_sale_completed',
  'commerce:' || order_id || ':completed',order_id,occurred_at,occurred_at,'USD',
  gross,fee,net,'posted','resolved','posted','demo_je_commerce_' || substr(order_id,-5),
  'fund_general','st-fiacre-commerce-backfill','st-fiacre-commerce-seed-' || substr(order_id,-5),
  'bookstore',order_id,'stripe',gross,gross
FROM orders;

WITH orders(order_id) AS (
  VALUES ('bookstore_demo_joel_2026a'),('bookstore_demo_joel_2026b')
)
INSERT OR IGNORE INTO accounting_entry_links
  (id,journal_entry_id,source_type,source_id,relationship_type)
SELECT 'demo_link_commerce_' || substr(order_id,-5),
       'demo_je_commerce_' || substr(order_id,-5),'commerce_order',order_id,'commerce_accounting'
FROM orders;
