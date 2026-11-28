CREATE TABLE IF NOT EXISTS stripe_payment_exception_assignments (
  event_id TEXT PRIMARY KEY REFERENCES stripe_events(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  next_action TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
