-- Named Accounting operators beneath the parish's shared dashboard login.
CREATE TABLE IF NOT EXISTS accounting_staff_profiles (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role_template TEXT NOT NULL,
  capabilities_json TEXT NOT NULL,
  pin_record TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_by_actor_type TEXT NOT NULL,
  created_by_actor_id TEXT,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  last_authenticated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_accounting_staff_profiles_parish ON accounting_staff_profiles(parish_id,status,display_name);

CREATE TABLE IF NOT EXISTS accounting_staff_sessions (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  parish_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  token_salt TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  revoked_at TEXT,
  FOREIGN KEY(profile_id) REFERENCES accounting_staff_profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_accounting_staff_sessions_lookup ON accounting_staff_sessions(profile_id,parish_id,revoked_at,expires_at);

