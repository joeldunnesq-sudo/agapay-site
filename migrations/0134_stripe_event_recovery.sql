ALTER TABLE stripe_events ADD COLUMN stripe_account_id TEXT;
-- This reference attributes a platform-owned delivery to a parish.
ALTER TABLE stripe_events ADD COLUMN affected_parish_id TEXT NOT NULL DEFAULT '';
