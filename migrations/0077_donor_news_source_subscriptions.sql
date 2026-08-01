CREATE TABLE IF NOT EXISTS donor_news_source_subscriptions (
  donor_id TEXT NOT NULL,
  source_key TEXT NOT NULL CHECK (source_key IN ('parish_blog', 'oca', 'orthochristian', 'spzh', 'orthodoxtimes', 'orthodoxethos')),
  subscribed INTEGER NOT NULL DEFAULT 0 CHECK (subscribed IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (donor_id, source_key)
);

INSERT OR IGNORE INTO donor_news_source_subscriptions (donor_id, source_key, subscribed, updated_at)
SELECT donor_id, 'orthochristian', subscribed, updated_at
FROM donor_external_feed_subscriptions
WHERE feed_key = 'orthochristian' AND subscribed = 1;

CREATE TABLE IF NOT EXISTS donor_custom_news_feeds (
  id TEXT PRIMARY KEY,
  donor_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  source_label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (donor_id, feed_url)
);

CREATE INDEX IF NOT EXISTS donor_custom_news_feeds_donor_idx
  ON donor_custom_news_feeds (donor_id, created_at DESC);
