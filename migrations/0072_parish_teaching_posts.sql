CREATE TABLE IF NOT EXISTS parish_teaching_posts (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audio_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_parish_teaching_feed ON parish_teaching_posts(parish_id, status, published_at DESC);

CREATE TABLE parish_content_reads_teaching (
  parish_id TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('announcement', 'group_message', 'teaching')),
  content_id TEXT NOT NULL,
  donor_id TEXT NOT NULL,
  read_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (content_type, content_id, donor_id)
);

INSERT INTO parish_content_reads_teaching (parish_id, content_type, content_id, donor_id, read_at)
SELECT parish_id, content_type, content_id, donor_id, read_at FROM parish_content_reads;

DROP TABLE parish_content_reads;
ALTER TABLE parish_content_reads_teaching RENAME TO parish_content_reads;

CREATE INDEX IF NOT EXISTS idx_parish_content_reads_lookup ON parish_content_reads(parish_id, content_type, donor_id);
CREATE INDEX IF NOT EXISTS idx_parish_content_reads_receipts
  ON parish_content_reads(parish_id, content_type, content_id, read_at, donor_id);
