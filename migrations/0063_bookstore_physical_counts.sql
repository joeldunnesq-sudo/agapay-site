CREATE TABLE IF NOT EXISTS commerce_inventory_count_sessions (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
  items_json TEXT NOT NULL DEFAULT '[]',
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_commerce_inventory_count_sessions_parish
  ON commerce_inventory_count_sessions(parish_id, started_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_commerce_inventory_count_sessions_open
  ON commerce_inventory_count_sessions(parish_id)
  WHERE status = 'draft';

ALTER TABLE commerce_inventory_movements ADD COLUMN count_session_id TEXT
  REFERENCES commerce_inventory_count_sessions(id);

CREATE INDEX IF NOT EXISTS idx_commerce_inventory_movements_count_session
  ON commerce_inventory_movements(parish_id, count_session_id, created_at, id);
