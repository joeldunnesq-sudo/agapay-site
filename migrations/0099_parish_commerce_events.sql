-- Migration: 0099_parish_commerce_events
-- Additive only. Adds the columns Meals & Fundraiser Events needs on top of
-- the existing Parish Commerce schema (commerce_products / commerce_orders
-- etc. from 0009_parish_commerce). No existing table is renamed, dropped,
-- or has a column removed, and nothing here changes Bookstore behavior --
-- every new column defaults such that commerce_module = 'bookstore' rows
-- are unaffected.
--
-- Scope: lets a parish list a dinner/festival item with an event date,
-- location, and a per-order quantity cap (so one buyer can't take all the
-- plates), reusing the same commerce_products / commerce_product_variants /
-- commerce_orders / commerce_order_items tables and the same
-- stock_quantity sell-out mechanism Bookstore already uses.

ALTER TABLE commerce_products ADD COLUMN event_date TEXT;
ALTER TABLE commerce_products ADD COLUMN event_location TEXT;
ALTER TABLE commerce_products ADD COLUMN event_details TEXT;
-- Optional hard cutoff -- after this timestamp the event no longer accepts
-- new orders even if stock remains (e.g. "no more pre-orders after Friday
-- noon so the kitchen can finalize headcount").
ALTER TABLE commerce_products ADD COLUMN sales_close_at TEXT;

ALTER TABLE commerce_product_variants ADD COLUMN max_quantity_per_order INTEGER;

CREATE INDEX IF NOT EXISTS idx_commerce_products_event_date
  ON commerce_products(parish_id, commerce_module, event_date)
  WHERE commerce_module = 'events';
