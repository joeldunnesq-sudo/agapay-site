CREATE TABLE IF NOT EXISTS parish_feature_requests (
  parish_id TEXT NOT NULL,
  feature_id TEXT NOT NULL,
  donor_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (parish_id, feature_id, donor_hash)
);

CREATE INDEX IF NOT EXISTS idx_parish_feature_requests_parish
  ON parish_feature_requests (parish_id, feature_id, created_at);

CREATE TABLE IF NOT EXISTS parish_feature_request_dismissals (
  parish_id TEXT NOT NULL,
  feature_id TEXT NOT NULL,
  dismissed_at TEXT NOT NULL,
  PRIMARY KEY (parish_id, feature_id)
);
-- Original filename retained because D1 identifies applied migrations by filename.
