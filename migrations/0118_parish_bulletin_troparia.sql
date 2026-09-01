CREATE TABLE IF NOT EXISTS parish_bulletin_troparia (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'troparion' CHECK(kind IN ('troparion', 'kontakion', 'other')),
  title TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT '',
  text_body TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK(sort_order >= 0 AND sort_order <= 99),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_parish_bulletin_troparia_parish_active_sort
  ON parish_bulletin_troparia(parish_id, active, sort_order);

PRAGMA optimize;
