-- Phase G production hardening: indexes verified against canary query plans.
-- The partial index keeps the hot AP-aging set small while supporting the
-- status, as-of date, and due-date predicates used by treasurer reports.
CREATE INDEX IF NOT EXISTS idx_accounting_bills_aging
  ON accounting_bills(status, bill_date, due_date, vendor_id)
  WHERE amount_due > 0;
