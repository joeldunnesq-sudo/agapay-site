-- Merge the duplicate Poor Box / Alms accounting balance into the restricted
-- Benevolence Fund without rewriting immutable posted journal history.
PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO accounting_journal_entries
  (id,entry_number,entry_date,posting_date,description,status,source_type,source_id,
   fiscal_year_id,accounting_period_id,total_debits,total_credits,
   created_by_actor_type,created_by_actor_id,posted_by_actor_type,posted_by_actor_id,
   posted_at,correlation_id)
VALUES
  ('je_reclass_alms_benevolence','JE-RECLASS-ALMS-001','2026-07-28','2026-07-28',
   'Merge Poor Box / Alms into Benevolence Fund','draft',
   'fund_reclassification','st-fiacre:alms-to-benevolence',
   'fy_2026','period_2026_07',60000,60000,
   'system','agapay_operational_sync','system','agapay_operational_sync',
   '2026-07-28T18:30:00Z','st-fiacre-alms-merge');

WITH lines(id,line_number,account_id,fund_id,description,debit_amount,credit_amount) AS (
  VALUES
    ('jl_reclass_alms_01',1,'acct_1010','fund_operational_507346b39f44e02ecd15','Move alms cash to Benevolence Fund',30000,0),
    ('jl_reclass_alms_02',2,'acct_1010','fund_giving_alms','Remove cash from duplicate Poor Box / Alms fund',0,30000),
    ('jl_reclass_alms_03',3,'acct_4020','fund_giving_alms','Remove contribution activity from duplicate Poor Box / Alms fund',30000,0),
    ('jl_reclass_alms_04',4,'acct_4020','fund_operational_507346b39f44e02ecd15','Move contribution activity to Benevolence Fund',0,30000)
)
INSERT OR IGNORE INTO accounting_journal_lines
  (id,journal_entry_id,line_number,account_id,fund_id,description,debit_amount,credit_amount)
SELECT id,'je_reclass_alms_benevolence',line_number,account_id,fund_id,description,debit_amount,credit_amount
FROM lines
WHERE EXISTS (
  SELECT 1 FROM accounting_journal_entries
  WHERE id='je_reclass_alms_benevolence' AND status='draft'
);

UPDATE accounting_journal_entries
SET status='posted',updated_at=datetime('now')
WHERE id='je_reclass_alms_benevolence' AND status='draft';

UPDATE accounting_funds
SET is_active=0,
    giving_enabled=0,
    archived_at=COALESCE(archived_at,datetime('now')),
    giving_source_type=NULL,
    giving_source_id=NULL,
    description='Merged into Benevolence Fund on 2026-07-28.',
    version=version+1,
    updated_at=datetime('now')
WHERE id='fund_giving_alms';
