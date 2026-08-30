CREATE TABLE IF NOT EXISTS operational_job_heartbeats (
  job_name TEXT PRIMARY KEY,
  cron TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  run_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER,
  error_summary TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_operational_job_heartbeats_status_updated
  ON operational_job_heartbeats(status, updated_at);
