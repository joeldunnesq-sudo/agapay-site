-- Phase 1B central provisioning operation journal and retry lease.
CREATE TABLE IF NOT EXISTS accounting_provisioning_operations (
  id TEXT PRIMARY KEY,
  accounting_entity_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  operation TEXT NOT NULL DEFAULT 'provision',
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_expires_at TEXT,
  failure_code TEXT,
  failure_message TEXT,
  correlation_id TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (environment IN ('local', 'test', 'staging', 'production')),
  CHECK (status IN ('pending', 'running', 'ready', 'failed')),
  FOREIGN KEY (accounting_entity_id) REFERENCES accounting_entities(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_provisioning_idempotency
  ON accounting_provisioning_operations(accounting_entity_id, environment, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_accounting_provisioning_status
  ON accounting_provisioning_operations(status, lease_expires_at);

INSERT OR IGNORE INTO accounting_schema_versions
  (id, schema_version, migration_version, status, description, released_at)
VALUES
  ('acct_schema_1', 1, '0001_accounting_database_foundation', 'active',
   'Per-parish technical metadata, migration, health, and idempotency tables.', datetime('now'));
