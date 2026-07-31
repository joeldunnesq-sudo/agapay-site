CREATE TABLE IF NOT EXISTS parish_email_credentials (
  parish_id TEXT PRIMARY KEY,
  resend_api_key TEXT NOT NULL,
  configured_at TEXT NOT NULL DEFAULT (datetime('now')),
  configured_by TEXT NOT NULL
);
