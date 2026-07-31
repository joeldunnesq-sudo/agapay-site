INSERT OR IGNORE INTO accounting_accounts(
  id,
  account_number,
  name,
  account_type_id,
  normal_balance,
  is_posting_account,
  is_system,
  requires_fund
)
VALUES(
  'acct_4200',
  '4200',
  'In-Kind Contributions',
  'type_revenue',
  'credit',
  1,
  0,
  1
);
