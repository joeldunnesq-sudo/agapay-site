-- Restricted-fund inflows remain derived from contribution records. These
-- columns store only the parish-supplied opening balances and deductions
-- needed to calculate spendable balances until Accounting becomes the source
-- of truth. Revisions retain the exact calculated balance set at each save.
ALTER TABLE stewardship_authoritative_financial_snapshots
  ADD COLUMN restricted_fund_adjustments_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE stewardship_authoritative_financial_snapshots
  ADD COLUMN restricted_fund_balances_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE stewardship_financial_snapshot_revisions
  ADD COLUMN restricted_fund_adjustments_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE stewardship_financial_snapshot_revisions
  ADD COLUMN restricted_fund_balances_json TEXT NOT NULL DEFAULT '[]';
-- Original filename retained because D1 identifies applied migrations by filename.
