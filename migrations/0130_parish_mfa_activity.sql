CREATE TABLE IF NOT EXISTS parish_mfa_activity (
  session_id TEXT PRIMARY KEY,
  verified_at_ms INTEGER NOT NULL,
  last_activity_ms INTEGER NOT NULL
);
