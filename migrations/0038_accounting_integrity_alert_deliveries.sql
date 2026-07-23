CREATE TABLE IF NOT EXISTS accounting_integrity_alert_deliveries (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  scan_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  delivery_status TEXT NOT NULL,
  recipient_masked TEXT,
  provider_message_id TEXT,
  correlation_id TEXT,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (severity IN ('informational', 'warning', 'error', 'critical')),
  CHECK (delivery_status IN ('sent', 'failed', 'error', 'not_configured'))
);

CREATE INDEX IF NOT EXISTS idx_accounting_alert_delivery_scan
  ON accounting_integrity_alert_deliveries(parish_id, scan_id, attempted_at);
