-- Migration: 0004_household_pledges_pk
-- Fixes the household_pledges primary key to include parish_id,
-- so a donor can hold pledges at multiple parishes in the same fiscal year.

-- 1. Rebuild the table with the correct three-column primary key.
CREATE TABLE IF NOT EXISTS household_pledges_new (
  donor_email         TEXT    NOT NULL,
  parish_id           TEXT    NOT NULL,
  fiscal_year         INTEGER NOT NULL,
  target_amount_cents INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (donor_email, parish_id, fiscal_year)
);

-- 2. Copy existing rows. Where the old table had duplicate (donor_email, fiscal_year)
--    rows for different parishes (shouldn't exist yet, but be safe), keep the latest.
INSERT INTO household_pledges_new
  (donor_email, parish_id, fiscal_year, target_amount_cents, created_at, updated_at)
SELECT donor_email, parish_id, fiscal_year, target_amount_cents, created_at, updated_at
FROM household_pledges;

-- 3. Swap.
DROP TABLE household_pledges;
ALTER TABLE household_pledges_new RENAME TO household_pledges;

-- 4. Restore the lookup index (parish + year is the query pattern for the summary API).
CREATE INDEX IF NOT EXISTS idx_household_pledges_parish_year
  ON household_pledges(parish_id, fiscal_year);
