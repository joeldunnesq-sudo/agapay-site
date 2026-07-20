export const ACCOUNTING_FOUNDATION_MIGRATION = Object.freeze({
  schemaVersion: 1,
  version: "0001_accounting_database_foundation",
  checksum: "sha256:2dd980d1cffdce1897b6d59268d5de3b2dd24b988417d58f1b1ebb1771d8b95b",
  statements: Object.freeze([
    `CREATE TABLE IF NOT EXISTS accounting_database_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS accounting_migrations (version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS accounting_health_checks (id TEXT PRIMARY KEY, check_name TEXT NOT NULL, status TEXT NOT NULL, checked_at TEXT NOT NULL DEFAULT (datetime('now')), CHECK (status IN ('healthy', 'unhealthy')))`,
    `CREATE TABLE IF NOT EXISTS accounting_idempotency_keys (idempotency_key TEXT PRIMARY KEY, operation TEXT NOT NULL, result_hash TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`
  ])
});

export const ACCOUNTING_FOUNDATION_TABLES = Object.freeze([
  "accounting_database_metadata", "accounting_migrations", "accounting_health_checks", "accounting_idempotency_keys"
]);

export const FORBIDDEN_PHASE_1B_TABLE_FRAGMENTS = Object.freeze([
  "ledger", "journal", "account", "fund", "balance", "payable", "reconciliation", "posting"
]);
