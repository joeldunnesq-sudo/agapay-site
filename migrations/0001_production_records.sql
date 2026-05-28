CREATE TABLE IF NOT EXISTS registrations (
  reference TEXT PRIMARY KEY,
  parish_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  parish_name TEXT,
  community_type TEXT,
  stripe_account_id TEXT,
  stripe_subscription_id TEXT,
  received_at TEXT,
  updated_at TEXT NOT NULL,
  data TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_registrations_parish_id ON registrations(parish_id);
CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);
CREATE INDEX IF NOT EXISTS idx_registrations_stripe_account_id ON registrations(stripe_account_id);
CREATE INDEX IF NOT EXISTS idx_registrations_stripe_subscription_id ON registrations(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_registrations_received_at ON registrations(received_at);

CREATE TABLE IF NOT EXISTS donors (
  email TEXT PRIMARY KEY,
  default_parish_id TEXT,
  email_verified_at TEXT,
  created_at TEXT,
  updated_at TEXT NOT NULL,
  data TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_donors_default_parish_id ON donors(default_parish_id);

CREATE TABLE IF NOT EXISTS donor_offerings (
  id TEXT PRIMARY KEY,
  donor_email TEXT NOT NULL,
  parish_id TEXT,
  checkout_session_id TEXT,
  payment_intent_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT,
  payment_status TEXT,
  created_at TEXT,
  updated_at TEXT NOT NULL,
  data TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_donor_offerings_donor_email_created_at ON donor_offerings(donor_email, created_at);
CREATE INDEX IF NOT EXISTS idx_donor_offerings_parish_id_created_at ON donor_offerings(parish_id, created_at);
CREATE INDEX IF NOT EXISTS idx_donor_offerings_checkout_session_id ON donor_offerings(checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_donor_offerings_payment_intent_id ON donor_offerings(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_donor_offerings_stripe_subscription_id ON donor_offerings(stripe_subscription_id);

CREATE TABLE IF NOT EXISTS commemorations (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  source_id TEXT,
  donor_email TEXT,
  created_at TEXT NOT NULL,
  data TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_commemorations_parish_id_created_at ON commemorations(parish_id, created_at);
CREATE INDEX IF NOT EXISTS idx_commemorations_donor_email_created_at ON commemorations(donor_email, created_at);
CREATE INDEX IF NOT EXISTS idx_commemorations_source_id ON commemorations(source_id);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL
);
