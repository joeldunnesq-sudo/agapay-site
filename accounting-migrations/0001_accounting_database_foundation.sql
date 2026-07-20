-- AGAPAY Accounting Phase 1B: per-parish technical foundation only.
-- Financial/ledger tables are intentionally forbidden in this phase.
CREATE TABLE IF NOT EXISTS accounting_database_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounting_migrations (
  version TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounting_health_checks (
  id TEXT PRIMARY KEY,
  check_name TEXT NOT NULL,
  status TEXT NOT NULL,
  checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (status IN ('healthy', 'unhealthy'))
);

CREATE TABLE IF NOT EXISTS accounting_idempotency_keys (
  idempotency_key TEXT PRIMARY KEY,
  operation TEXT NOT NULL,
  result_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
