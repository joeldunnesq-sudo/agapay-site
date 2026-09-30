-- Recovery metadata is never itself rolled back with parish records.
CREATE TABLE IF NOT EXISTS parish_recovery_snapshots (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('parish','accounting')),
  kind TEXT NOT NULL CHECK(kind IN ('manual','safety')),
  status TEXT NOT NULL CHECK(status IN ('preparing','ready','failed','expired')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  verified_at INTEGER,
  manifest_json TEXT,
  manifest_sha256 TEXT,
  actor_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS parish_recovery_latest ON parish_recovery_snapshots(parish_id,scope,status,created_at);
CREATE TABLE IF NOT EXISTS parish_recovery_operations (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('parish','accounting')),
  kind TEXT NOT NULL CHECK(kind IN ('backup','restore')),
  status TEXT NOT NULL CHECK(status IN ('running','paused','completed','cancelled')),
  phase TEXT NOT NULL,
  target_id TEXT,
  safety_id TEXT NOT NULL,
  actor_hash TEXT NOT NULL,
  request_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  guard_hash TEXT,
  rollback INTEGER NOT NULL DEFAULT 0 CHECK(rollback IN (0,1)),
  UNIQUE(parish_id,request_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS parish_recovery_active ON parish_recovery_operations(parish_id) WHERE status IN ('running','paused');
CREATE TABLE IF NOT EXISTS parish_recovery_locks (
  parish_id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('parish','accounting')),
  phase TEXT NOT NULL DEFAULT 'frozen' CHECK(phase IN ('frozen','applying'))
);
CREATE TABLE IF NOT EXISTS parish_recovery_retention (
  operation_id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  review_after INTEGER NOT NULL,
  manifest_key TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS parish_recovery_retention_immutable_update BEFORE UPDATE ON parish_recovery_retention
BEGIN SELECT RAISE(ABORT,'RECOVERY_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS parish_recovery_retention_immutable_delete BEFORE DELETE ON parish_recovery_retention
BEGIN SELECT RAISE(ABORT,'RECOVERY_AUDIT_IMMUTABLE'); END;
-- Close the check/write race for file and legacy writers, including in-flight requests.
CREATE TRIGGER IF NOT EXISTS parish_recovery_storage_fence BEFORE INSERT ON parish_portability_storage_operations
WHEN EXISTS(SELECT 1 FROM parish_recovery_locks l WHERE l.parish_id=NEW.parish_id AND (l.scope='parish' OR NEW.binding='ACCOUNTING_ATTACHMENTS'))
BEGIN SELECT RAISE(ABORT,'PARISH_RECOVERY_WRITE_BLOCKED'); END;
CREATE TRIGGER IF NOT EXISTS parish_recovery_closure_fence BEFORE INSERT ON parish_data_closures
WHEN EXISTS(SELECT 1 FROM parish_recovery_operations WHERE parish_id=NEW.parish_id AND status IN ('running','paused'))
BEGIN SELECT RAISE(ABORT,'PARISH_RECOVERY_WRITE_BLOCKED'); END;
CREATE TRIGGER IF NOT EXISTS parish_recovery_export_fence BEFORE INSERT ON parish_portability_jobs
WHEN EXISTS(SELECT 1 FROM parish_recovery_operations WHERE parish_id=NEW.parish_id AND status IN ('running','paused'))
BEGIN SELECT RAISE(ABORT,'PARISH_RECOVERY_WRITE_BLOCKED'); END;
CREATE TRIGGER IF NOT EXISTS parish_recovery_admission_fence BEFORE INSERT ON parish_recovery_operations
WHEN EXISTS(SELECT 1 FROM parish_portability_jobs WHERE parish_id=NEW.parish_id AND status IN ('preparing','deleting'))
  OR EXISTS(SELECT 1 FROM parish_data_closures WHERE parish_id=NEW.parish_id)
BEGIN SELECT RAISE(ABORT,'PARISH_RECOVERY_ADMISSION_BLOCKED'); END;
