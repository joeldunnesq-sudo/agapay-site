-- Page-specific freshness for the compact Koinonia Community Tools cards.
-- These timestamps intentionally remain separate from general notification/read state.

ALTER TABLE koinonia_signup_sheets ADD COLUMN published_at INTEGER;

UPDATE koinonia_signup_sheets
SET published_at = COALESCE(updated_at, created_at)
WHERE status IN ('open', 'closed') AND published_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_koinonia_signup_sheets_parish_published
  ON koinonia_signup_sheets(parish_id, status, published_at DESC);

CREATE TABLE IF NOT EXISTS koinonia_community_tool_views (
  parish_id      TEXT    NOT NULL,
  person_id      TEXT    NOT NULL,
  tool           TEXT    NOT NULL CHECK (tool IN ('signups', 'exchange')),
  last_opened_at INTEGER NOT NULL,
  PRIMARY KEY (parish_id, person_id, tool)
);

CREATE INDEX IF NOT EXISTS idx_koinonia_community_tool_views_person
  ON koinonia_community_tool_views(parish_id, person_id, tool, last_opened_at);
