ALTER TABLE stripe_events ADD COLUMN stripe_account_id TEXT;
ALTER TABLE stripe_events ADD COLUMN parish_id TEXT NOT NULL DEFAULT '';
