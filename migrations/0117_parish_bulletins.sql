CREATE TABLE parish_bulletins (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  title TEXT NOT NULL,
  service_date TEXT NOT NULL CHECK (date(service_date) IS NOT NULL AND service_date = date(service_date)),
  template TEXT NOT NULL DEFAULT 'heritage' CHECK (template IN ('heritage', 'quiet', 'folded')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  content_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_parish_bulletins_edition
  ON parish_bulletins(parish_id, status, service_date DESC, updated_at DESC);
