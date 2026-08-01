CREATE TABLE IF NOT EXISTS donor_podcast_progress (
  donor_id TEXT NOT NULL,
  episode_key TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  show_title TEXT,
  episode_title TEXT,
  position_seconds INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (donor_id, episode_key)
);

CREATE INDEX IF NOT EXISTS idx_donor_podcast_progress_recent
  ON donor_podcast_progress(donor_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS donor_podcast_preferences (
  donor_id TEXT PRIMARY KEY,
  playback_rate REAL NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
