-- Migration: 0100_commerce_events_ministry_ownership
-- Additive only. Lets a Meals & Events listing (commerce_module = 'events',
-- from 0099_parish_commerce_events.sql) be attributed to the ministry that
-- created it, so ministry leaders can manage their own festal event pricing
-- from the Ministries workspace in My AGAPAY -- without needing parish
-- dashboard credentials. NULL ministry_id means the listing was created by
-- full parish-dashboard staff, not delegated to a ministry; this is the
-- default and does not change any existing Bookstore or parish-admin-created
-- Events behavior.

ALTER TABLE commerce_products ADD COLUMN ministry_id TEXT;
ALTER TABLE commerce_products ADD COLUMN created_by_person_id TEXT;

CREATE INDEX IF NOT EXISTS idx_commerce_products_ministry
  ON commerce_products(parish_id, commerce_module, ministry_id)
  WHERE commerce_module = 'events' AND ministry_id IS NOT NULL;
