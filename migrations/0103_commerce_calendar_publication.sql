ALTER TABLE commerce_products ADD COLUMN event_start_time TEXT;
ALTER TABLE commerce_products ADD COLUMN event_end_time TEXT;
ALTER TABLE commerce_products ADD COLUMN event_timezone TEXT;
ALTER TABLE commerce_products ADD COLUMN show_on_calendar INTEGER NOT NULL DEFAULT 1;
ALTER TABLE commerce_products ADD COLUMN published_at TEXT;

UPDATE commerce_products
SET published_at = COALESCE(published_at, created_at, datetime('now'))
WHERE commerce_module = 'events' AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_commerce_products_calendar
  ON commerce_products(parish_id, status, show_on_calendar, event_date);
