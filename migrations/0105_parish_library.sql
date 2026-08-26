-- Parish-scoped, staff-curated documents and links for My AGAPAY members.

CREATE TABLE IF NOT EXISTS parish_library_settings (
  parish_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS parish_library_resources (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'parish_life'
    CHECK (category IN ('prayer_worship', 'faith_formation', 'newcomers', 'ministries', 'forms_policies', 'pastoral_letters', 'parish_life')),
  resource_type TEXT NOT NULL CHECK (resource_type IN ('link', 'pdf')),
  external_url TEXT,
  object_key TEXT,
  file_name TEXT,
  file_size INTEGER,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  published_at TEXT,
  expires_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (resource_type = 'link' AND external_url IS NOT NULL AND object_key IS NULL)
    OR (resource_type = 'pdf' AND external_url IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_parish_library_member_feed
  ON parish_library_resources(parish_id, status, pinned DESC, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_parish_library_admin
  ON parish_library_resources(parish_id, updated_at DESC);
