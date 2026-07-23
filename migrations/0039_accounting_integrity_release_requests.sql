CREATE TABLE IF NOT EXISTS accounting_integrity_release_requests (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  expected_version INTEGER NOT NULL,
  reason TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  result_json TEXT,
  CHECK (status IN ('pending', 'completed', 'rejected', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_accounting_release_requests_pending
  ON accounting_integrity_release_requests(status, parish_id, requested_at);
