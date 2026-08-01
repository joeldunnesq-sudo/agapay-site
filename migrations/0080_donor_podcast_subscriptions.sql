CREATE TABLE IF NOT EXISTS donor_podcast_subscriptions (
  donor_id TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  show_title TEXT NOT NULL,
  artwork_url TEXT,
  website_url TEXT,
  author TEXT,
  subscribed_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (donor_id, feed_url)
);

CREATE INDEX IF NOT EXISTS idx_donor_podcast_subscriptions_recent
  ON donor_podcast_subscriptions(donor_id, updated_at DESC);
