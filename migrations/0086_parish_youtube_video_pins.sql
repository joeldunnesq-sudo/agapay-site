ALTER TABLE parish_youtube_links ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_parish_youtube_links_pinned
  ON parish_youtube_links(parish_id, pinned DESC, added_at DESC);
