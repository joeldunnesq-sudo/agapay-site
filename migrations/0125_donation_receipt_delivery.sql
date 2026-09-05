CREATE TABLE IF NOT EXISTS donation_receipt_deliveries (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  message TEXT NOT NULL,
  first_attempt_at INTEGER,
  lease_until INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT NOT NULL DEFAULT '',
  provider_id TEXT NOT NULL DEFAULT '',
  sent_at TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
