-- The seeded parish chart currently contains only cash/current assets,
-- current liabilities, net assets, ordinary revenue, and ordinary expenses.
-- Investing and financing become meaningful when a parish adds accounts in
-- those categories and explicitly classifies them through account settings.
UPDATE accounting_accounts
SET cash_flow_classification='operating',
    updated_at=datetime('now')
WHERE is_posting_account=1
  AND cash_flow_classification IS NULL;
