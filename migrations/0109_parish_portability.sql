-- Export/closure control records contain no exported parish payloads.
CREATE TABLE IF NOT EXISTS parish_portability_jobs (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('export', 'close')),
  status TEXT NOT NULL CHECK (status IN ('preparing', 'ready', 'deleting', 'active_data_deleted', 'failed', 'cancelled')),
  request_key TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  manifest_json TEXT,
  manifest_sha256 TEXT,
  archive_key TEXT,
  archive_sha256 TEXT,
  archive_bytes INTEGER,
  expires_at INTEGER NOT NULL,
  confirmed_at INTEGER,
  completed_at INTEGER,
  error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(parish_id, request_key)
);
CREATE INDEX IF NOT EXISTS idx_parish_portability_jobs_parish ON parish_portability_jobs(parish_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parish_portability_jobs_work ON parish_portability_jobs(status, updated_at);

CREATE TABLE IF NOT EXISTS parish_portability_steps (
  job_id TEXT NOT NULL REFERENCES parish_portability_jobs(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'completed')),
  result_json TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(job_id, step_key)
);

CREATE TABLE IF NOT EXISTS parish_portability_leases (
  parish_id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS parish_data_closures (
  parish_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES parish_portability_jobs(id),
  state TEXT NOT NULL CHECK(state IN ('preparing', 'deleting', 'closed')),
  policy_version TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
