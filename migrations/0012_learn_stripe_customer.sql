-- Migration: 0012_learn_stripe_customer
--
-- Gives AGAPAY Learn households a stable, reusable, platform-account Stripe
-- Customer, so learnBillingCheckout() (src/learn/billing.js) stops relying
-- on bare `customer_email` (which lets Stripe silently create a new,
-- unlinked Customer object on every checkout attempt).
--
-- Additive only: nullable ALTER TABLE ADD COLUMN on the existing
-- learn_households table (migrations/0003_agapay_learn_phase1.sql). No
-- existing household row is rewritten. learn_households.id is preserved
-- exactly as-is (see the note in src/learn/billing.js about NOT
-- recomputing it from email going forward -- documented technical debt,
-- not fixed in this migration).

ALTER TABLE learn_households ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE learn_households ADD COLUMN stripe_customer_created_at TEXT;
ALTER TABLE learn_households ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE learn_households ADD COLUMN stripe_subscription_status TEXT;
ALTER TABLE learn_households ADD COLUMN last_stripe_sync_at TEXT;

-- Unique where present -- SQLite unique indexes already treat NULL as
-- distinct-from-NULL (multiple NULLs are allowed), so this does not block
-- households that haven't checked out yet from having no Stripe Customer.
CREATE UNIQUE INDEX IF NOT EXISTS uq_learn_households_stripe_customer_id
  ON learn_households(stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_learn_households_stripe_subscription_id ON learn_households(stripe_subscription_id);
