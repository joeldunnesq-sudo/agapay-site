CREATE TABLE IF NOT EXISTS parish_youtube_channels (
  parish_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  channel_url TEXT NOT NULL,
  channel_title TEXT NOT NULL DEFAULT '',
  added_by TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
