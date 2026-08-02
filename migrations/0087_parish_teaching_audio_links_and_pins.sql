ALTER TABLE parish_teaching_posts ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE parish_teaching_posts ADD COLUMN audio_source TEXT NOT NULL DEFAULT 'upload'
  CHECK (audio_source IN ('upload', 'external'));

CREATE INDEX IF NOT EXISTS idx_parish_teaching_pinned_feed
  ON parish_teaching_posts(parish_id, status, pinned DESC, published_at DESC);
