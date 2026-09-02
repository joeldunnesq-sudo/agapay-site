-- Daily, priest-specific routine pastoral-care digest delivery ledger.
-- Stores only delivery metadata; pastoral notes and person names remain in
-- their source records and are never copied into this table.

CREATE TABLE IF NOT EXISTS sacrament_pastoral_digest_deliveries (
  id                    TEXT PRIMARY KEY,
  parish_id             TEXT NOT NULL,
  recipient_key         TEXT NOT NULL,
  recipient_masked      TEXT NOT NULL,
  digest_date           TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'sent', 'failed')),
  item_count            INTEGER NOT NULL DEFAULT 0,
  overdue_count         INTEGER NOT NULL DEFAULT 0,
  due_today_count       INTEGER NOT NULL DEFAULT 0,
  upcoming_count        INTEGER NOT NULL DEFAULT 0,
  provider_message_id   TEXT,
  error                 TEXT,
  attempted_at          TEXT NOT NULL,
  sent_at               TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (parish_id, recipient_key, digest_date)
);

CREATE INDEX IF NOT EXISTS idx_sacrament_pastoral_digest_deliveries_date
  ON sacrament_pastoral_digest_deliveries(digest_date, status);
