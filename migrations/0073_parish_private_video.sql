CREATE TABLE IF NOT EXISTS parish_youtube_links (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  youtube_url TEXT NOT NULL,
  title TEXT,
  thumbnail_url TEXT,
  added_by TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_parish_youtube_links
  ON parish_youtube_links(parish_id, added_at DESC);

CREATE TABLE IF NOT EXISTS parish_video_posts (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  stream_video_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  published_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_parish_video_feed
  ON parish_video_posts(parish_id, status, published_at DESC);

CREATE TABLE parish_content_reads_video (
  parish_id TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('announcement', 'group_message', 'teaching', 'video')),
  content_id TEXT NOT NULL,
  donor_id TEXT NOT NULL,
  read_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (content_type, content_id, donor_id)
);

INSERT INTO parish_content_reads_video (parish_id, content_type, content_id, donor_id, read_at)
SELECT parish_id, content_type, content_id, donor_id, read_at FROM parish_content_reads;

DROP TABLE parish_content_reads;
ALTER TABLE parish_content_reads_video RENAME TO parish_content_reads;

CREATE INDEX IF NOT EXISTS idx_parish_content_reads_lookup
  ON parish_content_reads(parish_id, content_type, donor_id);
CREATE INDEX IF NOT EXISTS idx_parish_content_reads_receipts
  ON parish_content_reads(parish_id, content_type, content_id, read_at, donor_id);
