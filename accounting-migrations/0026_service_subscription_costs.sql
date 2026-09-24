-- Subscription payments are reconciled against the actual bank/card account
-- through billing clearing, never against the parish's Stripe giving balance.
INSERT OR IGNORE INTO accounting_accounts
 (id,account_number,name,account_type_id,normal_balance,is_posting_account,is_system,requires_fund,cash_flow_classification)
VALUES
 ('acct_5860','5860','AGAPAY Service Subscription','type_expense','debit',1,1,1,'operating'),
 ('acct_2180','2180','AGAPAY Billing Clearing','type_liability','credit',1,1,1,'operating');

UPDATE accounting_accounts SET name='AGAPAY Transaction Fees' WHERE id='acct_5850' AND name='AGAPAY Platform Fees';
