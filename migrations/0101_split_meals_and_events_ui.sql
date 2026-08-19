-- Keep Meals and Events on the shared commerce_module='events' pipeline,
-- while giving every listing and order an explicit UI/reporting category.
-- Existing combined listings default to Events; parish staff can move a
-- listing to Meals from the dashboard after migration.

UPDATE commerce_products
SET item_category = 'event', updated_at = datetime('now')
WHERE commerce_module = 'events'
  AND LOWER(COALESCE(item_category, '')) NOT IN ('event', 'meal');

UPDATE commerce_orders
SET item_category = 'event', updated_at = datetime('now')
WHERE commerce_module = 'events'
  AND LOWER(COALESCE(item_category, '')) NOT IN ('event', 'meal');

UPDATE commerce_order_items
SET item_category = 'event', updated_at = datetime('now')
WHERE commerce_module = 'events'
  AND LOWER(COALESCE(item_category, '')) NOT IN ('event', 'meal');

CREATE INDEX IF NOT EXISTS idx_commerce_products_events_kind
  ON commerce_products(parish_id, item_category, status, event_date)
  WHERE commerce_module = 'events';

CREATE INDEX IF NOT EXISTS idx_commerce_orders_events_kind
  ON commerce_orders(parish_id, item_category, payment_status, completed_at)
  WHERE commerce_module = 'events';
