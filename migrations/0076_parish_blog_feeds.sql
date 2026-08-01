CREATE TABLE IF NOT EXISTS parish_blog_feeds (
  parish_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  source_url TEXT NOT NULL DEFAULT '',
  feed_url TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS donor_external_feed_subscriptions (
  donor_id TEXT NOT NULL,
  feed_key TEXT NOT NULL CHECK (feed_key IN ('orthochristian')),
  subscribed INTEGER NOT NULL DEFAULT 0 CHECK (subscribed IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (donor_id, feed_key)
);
