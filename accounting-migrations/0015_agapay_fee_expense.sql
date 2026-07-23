-- Record AGAPAY platform fees separately from bank and processor fees.
PRAGMA foreign_keys=ON;
INSERT OR IGNORE INTO accounting_accounts
  (id,account_number,name,account_type_id,normal_balance,is_posting_account,is_system,requires_fund)
VALUES
  ('acct_5850','5850','AGAPAY Platform Fees','type_expense','debit',1,1,1);
