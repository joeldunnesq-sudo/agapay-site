-- Paid platform invoices are retained even before a parish activates Accounting.
CREATE TABLE agapay_service_invoices (
  invoice_id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  paid_at TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
  plan_label TEXT NOT NULL,
  price_ids_json TEXT NOT NULL,
  accounting_status TEXT NOT NULL DEFAULT 'pending',
  accounting_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX agapay_service_invoices_parish ON agapay_service_invoices(parish_id, paid_at);
ALTER TABLE stewardship_authoritative_financial_snapshots ADD COLUMN automatic_costs_excluded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stewardship_authoritative_financial_snapshots ADD COLUMN entered_expense_cents INTEGER;
