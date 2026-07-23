-- User-managed expense accounts and presentation groups.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS accounting_account_presentations (
  account_id TEXT PRIMARY KEY,
  expense_group TEXT,
  default_fund_id TEXT,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  FOREIGN KEY(account_id) REFERENCES accounting_accounts(id),
  FOREIGN KEY(default_fund_id) REFERENCES accounting_funds(id),
  CHECK(expense_group IS NULL OR expense_group IN('administrative','other'))
);

INSERT OR IGNORE INTO accounting_account_presentations(account_id,expense_group,default_fund_id)
SELECT a.id,
  CASE WHEN lower(a.name) LIKE '%salary%' OR lower(a.name) LIKE '%clergy%'
    OR lower(a.name) LIKE '%staff%' OR lower(a.name) LIKE '%rent%'
    THEN 'administrative' ELSE 'other' END,
  (SELECT id FROM accounting_funds WHERE is_default=1 LIMIT 1)
FROM accounting_accounts a
JOIN accounting_account_types t ON t.id=a.account_type_id
WHERE t.category='expense';
