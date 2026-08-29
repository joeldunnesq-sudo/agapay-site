-- Private import progress. Raw workbooks and invitation tokens are never stored.
CREATE TABLE IF NOT EXISTS directory_import_batches (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  filename TEXT NOT NULL,
  send_invitations INTEGER NOT NULL CHECK (send_invitations IN (0, 1)),
  request_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(parish_id, request_key)
);
CREATE INDEX IF NOT EXISTS idx_directory_import_batches_parish ON directory_import_batches(parish_id, created_at);
CREATE TABLE IF NOT EXISTS directory_import_rows (
  batch_id TEXT NOT NULL REFERENCES directory_import_batches(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'imported', 'skipped', 'invalid')),
  message TEXT NOT NULL DEFAULT '',
  person_id TEXT,
  household_id TEXT,
  invitation_id TEXT,
  email_status TEXT NOT NULL DEFAULT 'not_requested'
    CHECK (email_status IN ('not_requested', 'ineligible', 'pending', 'sending', 'sent', 'failed', 'unknown')),
  PRIMARY KEY(batch_id, row_number)
);
CREATE INDEX IF NOT EXISTS idx_directory_import_rows_pending ON directory_import_rows(batch_id, status, email_status);
-- Serialize imports within a parish, with bounded processing and recovery after
-- an interrupted request. Never resend a row whose delivery is uncertain.
CREATE TABLE IF NOT EXISTS directory_import_leases (
  parish_id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
