-- Control metadata is separate from parish payloads. No cascading registration FK.
CREATE TABLE IF NOT EXISTS parish_portability_objects (
  binding TEXT NOT NULL,
  object_key TEXT NOT NULL,
  parish_id TEXT NOT NULL,
  disposition TEXT NOT NULL DEFAULT 'delete' CHECK(disposition IN ('delete','financial','support')),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','stored','deleted')),
  etag TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(binding,object_key)
);
CREATE INDEX IF NOT EXISTS idx_portability_objects_parish ON parish_portability_objects(parish_id);

CREATE TABLE IF NOT EXISTS parish_portability_legacy_keys (
  object_key TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','stored','deleted')),
  updated_at INTEGER NOT NULL
);

-- No automatic lease expiry: a timed-out provider request can still finish.
-- Uncertain operations require recovery with writers stopped, not a TTL guess.
CREATE TABLE IF NOT EXISTS parish_portability_storage_operations (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  binding TEXT NOT NULL,
  object_key TEXT NOT NULL,
  operation TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  UNIQUE(binding,object_key)
);

CREATE TABLE IF NOT EXISTS parish_portability_retention (
  job_id TEXT NOT NULL REFERENCES parish_portability_jobs(id),
  resource TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('financial','support','accounting')),
  retain_until INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('restricted','review_due','disposed')),
  evidence_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(job_id,resource)
);

CREATE TABLE IF NOT EXISTS parish_portability_inventory_reviews (
  binding TEXT PRIMARY KEY,
  policy_version TEXT NOT NULL,
  reviewed_at INTEGER NOT NULL,
  evidence_sha256 TEXT NOT NULL
);
