ALTER TABLE accounting_settings
ADD COLUMN pledge_comparison_account_id TEXT REFERENCES accounting_accounts(id);
