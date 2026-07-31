CREATE TABLE IF NOT EXISTS parish_announcement_digest_subscriptions (
  parish_id TEXT NOT NULL,
  donor_id TEXT NOT NULL,
  subscribed_at TEXT,
  unsubscribed_at TEXT,
  unsubscribe_token TEXT NOT NULL,
  last_digest_sent_at TEXT,
  PRIMARY KEY (parish_id, donor_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_digest_unsubscribe_token
  ON parish_announcement_digest_subscriptions(unsubscribe_token);

CREATE INDEX IF NOT EXISTS idx_digest_active_subscriptions
  ON parish_announcement_digest_subscriptions(parish_id, unsubscribed_at, subscribed_at);
