CREATE TABLE IF NOT EXISTS parish_content_reads (
  parish_id TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('announcement', 'group_message')),
  content_id TEXT NOT NULL,
  donor_id TEXT NOT NULL,
  read_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (content_type, content_id, donor_id)
);

CREATE INDEX IF NOT EXISTS idx_parish_content_reads_lookup ON parish_content_reads(parish_id, content_type, donor_id);
