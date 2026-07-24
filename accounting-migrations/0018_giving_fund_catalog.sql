-- Make the accounting fund catalog the durable source for Funds & Alms.
PRAGMA foreign_keys=ON;

ALTER TABLE accounting_funds ADD COLUMN giving_source_type TEXT;
ALTER TABLE accounting_funds ADD COLUMN giving_source_id TEXT;
ALTER TABLE accounting_funds ADD COLUMN giving_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounting_funds ADD COLUMN giving_slug TEXT;
ALTER TABLE accounting_funds ADD COLUMN giving_goal_cents INTEGER;
ALTER TABLE accounting_funds ADD COLUMN giving_metadata_json TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_funds_giving_source
  ON accounting_funds(giving_source_type,giving_source_id)
  WHERE giving_source_type IS NOT NULL AND giving_source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_funds_giving_enabled
  ON accounting_funds(giving_enabled,is_active,code);
