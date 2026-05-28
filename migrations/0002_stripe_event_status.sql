ALTER TABLE stripe_events ADD COLUMN event_type TEXT DEFAULT '';
ALTER TABLE stripe_events ADD COLUMN status TEXT NOT NULL DEFAULT 'processed';
ALTER TABLE stripe_events ADD COLUMN processed_at TEXT DEFAULT '';
ALTER TABLE stripe_events ADD COLUMN error_message TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_stripe_events_status ON stripe_events(status);
CREATE INDEX IF NOT EXISTS idx_stripe_events_received_at ON stripe_events(received_at);
