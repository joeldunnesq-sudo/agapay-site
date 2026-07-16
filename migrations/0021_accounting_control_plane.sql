-- ============================================================
-- AGAPAY Accounting Phase 1A -- Control Plane Registry
--
-- Central registry only. These tables track which parish owns which future
-- accounting database, lifecycle state, schema/migration state, and health.
-- They do NOT store ledgers, journals, accounts, funds, balances, reports,
-- AP, reconciliation, or posting data.
-- ============================================================

CREATE TABLE IF NOT EXISTS accounting_entities (
  id                    TEXT PRIMARY KEY,
  parish_id             TEXT NOT NULL,
  entity_status         TEXT NOT NULL DEFAULT 'not_enabled',
  activation_status     TEXT NOT NULL DEFAULT 'inactive',
  subscription_tier     TEXT NOT NULL DEFAULT 'none',
  enabled_at            TEXT,
  suspended_at          TEXT,
  archived_at           TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (entity_status IN ('not_enabled', 'provisioning', 'provisioned', 'migrating', 'ready', 'suspended', 'archived')),
  CHECK (activation_status IN ('inactive', 'active', 'suspended', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_entities_parish_id
  ON accounting_entities(parish_id);
CREATE INDEX IF NOT EXISTS idx_accounting_entities_status
  ON accounting_entities(entity_status, activation_status);

CREATE TABLE IF NOT EXISTS accounting_schema_versions (
  id                    TEXT PRIMARY KEY,
  schema_version        INTEGER NOT NULL,
  migration_version     TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'planned',
  description           TEXT,
  released_at           TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (schema_version >= 0),
  CHECK (status IN ('planned', 'active', 'deprecated', 'blocked'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_schema_versions_unique
  ON accounting_schema_versions(schema_version, migration_version);
CREATE INDEX IF NOT EXISTS idx_accounting_schema_versions_status
  ON accounting_schema_versions(status);

CREATE TABLE IF NOT EXISTS accounting_databases (
  id                    TEXT PRIMARY KEY,
  accounting_entity_id  TEXT NOT NULL,
  environment           TEXT NOT NULL,
  database_identifier   TEXT NOT NULL,
  schema_version_id     TEXT,
  schema_version        INTEGER NOT NULL DEFAULT 0,
  migration_version     TEXT NOT NULL DEFAULT 'none',
  provisioning_status   TEXT NOT NULL DEFAULT 'pending',
  health_status         TEXT NOT NULL DEFAULT 'unknown',
  provisioned_at        TEXT,
  last_validated_at     TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (environment IN ('local', 'test', 'staging', 'production')),
  CHECK (schema_version >= 0),
  CHECK (provisioning_status IN ('pending', 'provisioning', 'provisioned', 'migration_pending', 'migrating', 'ready', 'failed')),
  CHECK (health_status IN ('unknown', 'healthy', 'degraded', 'unhealthy', 'blocked')),
  FOREIGN KEY (accounting_entity_id) REFERENCES accounting_entities(id),
  FOREIGN KEY (schema_version_id) REFERENCES accounting_schema_versions(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_databases_entity_environment
  ON accounting_databases(accounting_entity_id, environment);
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_databases_identifier
  ON accounting_databases(environment, database_identifier);
CREATE INDEX IF NOT EXISTS idx_accounting_databases_status
  ON accounting_databases(environment, provisioning_status, health_status);

CREATE TABLE IF NOT EXISTS accounting_lifecycle_events (
  id                    TEXT PRIMARY KEY,
  accounting_entity_id  TEXT NOT NULL,
  accounting_database_id TEXT,
  event_type            TEXT NOT NULL,
  from_state            TEXT,
  to_state              TEXT,
  actor_user_id         TEXT,
  actor_type            TEXT NOT NULL DEFAULT 'system',
  reason                TEXT,
  correlation_id        TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (accounting_entity_id) REFERENCES accounting_entities(id),
  FOREIGN KEY (accounting_database_id) REFERENCES accounting_databases(id)
);

CREATE INDEX IF NOT EXISTS idx_accounting_lifecycle_events_entity
  ON accounting_lifecycle_events(accounting_entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_accounting_lifecycle_events_database
  ON accounting_lifecycle_events(accounting_database_id, created_at);
CREATE INDEX IF NOT EXISTS idx_accounting_lifecycle_events_type
  ON accounting_lifecycle_events(event_type);
