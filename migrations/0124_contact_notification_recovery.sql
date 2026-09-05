CREATE TABLE IF NOT EXISTS contact_leads (
  id TEXT PRIMARY KEY,
  submission_key TEXT NOT NULL UNIQUE,
  payload_hash TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  notification_status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  generation INTEGER NOT NULL DEFAULT 0,
  provider_id TEXT,
  last_error TEXT,
  first_attempt_at INTEGER,
  last_attempt_at INTEGER,
  sent_at TEXT,
  lease_token TEXT,
  lease_until INTEGER,
  notification_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_contact_leads_created ON contact_leads(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_contact_leads_status ON contact_leads(notification_status, created_at DESC);

-- Preserve existing leads. Their historical delivery result is unknown: do not
-- blindly resend them. Original app_settings rows are retained for rollback.
INSERT OR IGNORE INTO contact_leads(id, submission_key, payload_hash, data, created_at, notification_status)
SELECT substr(key, 9), 'legacy:' || key, '', value,
       COALESCE(json_extract(value, '$.submittedAt'), updated_at), 'legacy_unknown'
FROM app_settings
WHERE key LIKE 'contact:%' AND json_valid(value);
