DROP TABLE IF EXISTS accounting_attachment_metadata;

CREATE TABLE IF NOT EXISTS accounting_attachments (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256_hex TEXT NOT NULL,
  storage_status TEXT NOT NULL DEFAULT 'stored',
  uploaded_by_actor_type TEXT NOT NULL,
  uploaded_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  CHECK(entity_type IN ('journal_entry','bill','reconciliation_session')),
  CHECK(storage_status IN ('stored','deleted')),
  CHECK(size_bytes > 0 AND size_bytes <= 10485760)
);
CREATE INDEX IF NOT EXISTS idx_accounting_attachments_entity ON accounting_attachments(entity_type, entity_id) WHERE deleted_at IS NULL;
