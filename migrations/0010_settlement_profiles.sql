-- Migration: 0010_settlement_profiles
-- Settlement Profiles let a parish separate its revenue streams (giving vs.
-- Parish+ commerce vs. future modules) for reporting/accounting purposes,
-- even though today every profile settles through the same connected Stripe
-- account and the same parish bank account. The architecture is deliberately
-- future-proofed: stripe_account_id / stripe_external_account_id are
-- per-profile and nullable, so a larger parish can later point one profile
-- at a different Stripe account or payout destination without a schema
-- change. Nothing here changes existing Stripe Connect behavior — a profile
-- with no stripe_account_id simply means "use the parish's normal connected
-- account," which is what every profile does on day one.
--
-- This migration is additive and non-destructive:
--   - New tables only.
--   - New columns are nullable ALTER TABLE ADD COLUMN on existing tables.
--   - Backfill uses INSERT OR IGNORE with deterministic ids, so re-running
--     this migration is a safe no-op the second time.
--   - No existing rows are modified except to fill in a previously-NULL
--     settlement_profile_id.

CREATE TABLE IF NOT EXISTS settlement_profiles (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  name TEXT NOT NULL,
  profile_type TEXT NOT NULL DEFAULT 'general_giving', -- general_giving | liturgical | bookstore | festival | school | cemetery | camp | hall_rental | fundraisers
  stripe_account_id TEXT,               -- nullable: falls back to the parish's connected account
  stripe_external_account_id TEXT,      -- nullable: future per-profile payout destination (bank account)
  payout_destination_label TEXT,        -- nullable: human label only, e.g. "Operating checking ...1234"
  accounting_category TEXT,             -- nullable: free-text bookkeeping category/GL code
  is_default_giving INTEGER NOT NULL DEFAULT 0,
  is_default_commerce INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_settlement_profiles_parish
  ON settlement_profiles(parish_id, is_active, name);

-- At most one default-giving and one default-commerce profile per parish.
CREATE UNIQUE INDEX IF NOT EXISTS idx_settlement_profiles_default_giving
  ON settlement_profiles(parish_id) WHERE is_default_giving = 1;
CREATE UNIQUE INDEX IF NOT EXISTS idx_settlement_profiles_default_commerce
  ON settlement_profiles(parish_id) WHERE is_default_commerce = 1;

-- Explicit module -> profile assignment. A row here overrides the
-- is_default_giving / is_default_commerce fallback for that one module.
-- module_key today is 'giving' or 'bookstore'; the column is a free-text
-- key (not an enum) so future Parish+ modules (candles, events, tuition,
-- camp) can be assigned without a migration.
CREATE TABLE IF NOT EXISTS settlement_profile_modules (
  parish_id TEXT NOT NULL,
  module_key TEXT NOT NULL,
  settlement_profile_id TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (parish_id, module_key),
  FOREIGN KEY (settlement_profile_id) REFERENCES settlement_profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_settlement_profile_modules_profile
  ON settlement_profile_modules(settlement_profile_id);

-- Nullable settlement_profile_id on the two payment record tables that
-- exist today. Nullable/additive so existing rows and existing code paths
-- that don't yet know about profiles keep working unchanged.
ALTER TABLE donor_offerings ADD COLUMN settlement_profile_id TEXT;
ALTER TABLE commerce_orders ADD COLUMN settlement_profile_id TEXT;

CREATE INDEX IF NOT EXISTS idx_donor_offerings_settlement_profile
  ON donor_offerings(settlement_profile_id);
CREATE INDEX IF NOT EXISTS idx_commerce_orders_settlement_profile
  ON commerce_orders(settlement_profile_id);

-- ── Backfill: one "Primary Giving" profile per verified parish ─────────────
INSERT OR IGNORE INTO settlement_profiles
  (id, parish_id, name, profile_type, is_default_giving, is_default_commerce, is_active, created_at, updated_at)
SELECT 'sp_giving_' || parish_id, parish_id, 'Primary Giving', 'general_giving', 1, 0, 1, datetime('now'), datetime('now')
FROM registrations
WHERE status = 'verified' AND parish_id IS NOT NULL AND parish_id <> ''
GROUP BY parish_id;

INSERT OR IGNORE INTO settlement_profile_modules (parish_id, module_key, settlement_profile_id, updated_at)
SELECT parish_id, 'giving', 'sp_giving_' || parish_id, datetime('now')
FROM registrations
WHERE status = 'verified' AND parish_id IS NOT NULL AND parish_id <> ''
GROUP BY parish_id;

-- ── Backfill: "Bookstore Payments" profile for parishes with Parish+ active ─
INSERT OR IGNORE INTO settlement_profiles
  (id, parish_id, name, profile_type, is_default_giving, is_default_commerce, is_active, created_at, updated_at)
SELECT 'sp_commerce_' || parish_id, parish_id, 'Bookstore Payments', 'bookstore', 0, 1, 1, datetime('now'), datetime('now')
FROM parish_stewardship_settings
WHERE has_stewardship_suite = 1 AND parish_id IS NOT NULL AND parish_id <> ''
GROUP BY parish_id;

INSERT OR IGNORE INTO settlement_profile_modules (parish_id, module_key, settlement_profile_id, updated_at)
SELECT parish_id, 'bookstore', 'sp_commerce_' || parish_id, datetime('now')
FROM parish_stewardship_settings
WHERE has_stewardship_suite = 1 AND parish_id IS NOT NULL AND parish_id <> ''
GROUP BY parish_id;

-- ── Backfill historical payment records where a clean default exists ──────
UPDATE donor_offerings
SET settlement_profile_id = 'sp_giving_' || parish_id
WHERE settlement_profile_id IS NULL
  AND parish_id IN (SELECT parish_id FROM settlement_profiles WHERE is_default_giving = 1);

UPDATE commerce_orders
SET settlement_profile_id = 'sp_commerce_' || parish_id
WHERE settlement_profile_id IS NULL
  AND commerce_module = 'bookstore'
  AND parish_id IN (SELECT parish_id FROM settlement_profiles WHERE is_default_commerce = 1 AND profile_type = 'bookstore');
