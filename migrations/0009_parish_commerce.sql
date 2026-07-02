-- Migration: 0009_parish_commerce
-- Parish Commerce — canonical schema.
--
-- User-facing feature is "Bookstore Payments": donors buy books, prayer
-- ropes, icons, candles, and other devotional items directly from My
-- AGAPAY, with sales tax calculated automatically via Stripe Tax, so
-- nobody has to staff the bookstore table in person to take payment.
--
-- The backend is named commerce_* (not bookstore_*) on purpose: the same
-- order/item/inventory/report shape is meant to support future modules
-- (candles, events, meals, merch, camp, tuition) via the commerce_module
-- column, plus a future catalog/SKU/barcode-driven Scan & Go checkout,
-- without a disruptive table rename later. Right now only the "bookstore"
-- module is wired up in the application code — commerce_products,
-- commerce_product_variants, commerce_checkout_sessions,
-- commerce_product_barcodes, and commerce_registered_devices are schema
-- only; nothing writes to them yet.
--
-- This is a single, from-scratch migration (no bookstore_* intermediate
-- tables, no backfill) because Bookstore Payments has not been deployed
-- to production yet — there's no existing data to migrate.

CREATE TABLE IF NOT EXISTS commerce_orders (
  id TEXT PRIMARY KEY,
  order_number TEXT,
  commerce_module TEXT NOT NULL DEFAULT 'bookstore', -- bookstore | candles | events | meals | merch | camp | tuition | other
  source TEXT NOT NULL DEFAULT 'manual_entry', -- manual_entry | catalog | scan_and_go | kiosk | admin
  parish_id TEXT NOT NULL,
  donor_email TEXT NOT NULL,
  donor_name TEXT,

  product_id TEXT,
  product_sku TEXT,
  variant_id TEXT,
  tax_code TEXT,
  product_snapshot_json TEXT,

  item_category TEXT NOT NULL DEFAULT 'other',
  item_description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,

  unit_price_cents INTEGER NOT NULL,
  subtotal_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  agapay_fee_cents INTEGER NOT NULL DEFAULT 0,
  stripe_fee_cents INTEGER NOT NULL DEFAULT 0,
  cover_fees INTEGER NOT NULL DEFAULT 0,
  total_charged_cents INTEGER NOT NULL DEFAULT 0,
  parish_net_cents INTEGER NOT NULL DEFAULT 0,

  -- Order lifecycle is commerce-wide, not bookstore-specific.
  -- checkout_created | cart | pending_payment | completed | pending | failed | expired | partially_refunded | refunded | disputed | dispute_closed | cancelled
  status TEXT NOT NULL DEFAULT 'checkout_created',
  payment_status TEXT NOT NULL DEFAULT 'pending',

  checkout_session_local_id TEXT,
  checkout_session_id TEXT,
  checkout_url TEXT,
  stripe_customer_id TEXT,
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,

  fulfillment_status TEXT NOT NULL DEFAULT 'pending', -- pending | ready | picked_up | shipped | fulfilled | cancelled | none
  fulfilled_at TEXT,
  fulfilled_by TEXT,

  pickup_note TEXT,
  parish_notes TEXT,

  receipt_email_status TEXT,
  receipt_email_id TEXT,
  receipt_email_sent_at TEXT,

  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_commerce_orders_parish ON commerce_orders(parish_id, commerce_module, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_orders_donor ON commerce_orders(donor_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_orders_product ON commerce_orders(parish_id, product_id, variant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_orders_sku ON commerce_orders(parish_id, product_sku, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_commerce_orders_checkout ON commerce_orders(checkout_session_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_commerce_orders_order_number ON commerce_orders(parish_id, order_number) WHERE order_number IS NOT NULL AND order_number <> '';
CREATE INDEX IF NOT EXISTS idx_commerce_orders_fulfillment ON commerce_orders(parish_id, commerce_module, fulfillment_status, created_at DESC);

CREATE TABLE IF NOT EXISTS commerce_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  parish_id TEXT NOT NULL,
  commerce_module TEXT NOT NULL DEFAULT 'bookstore',
  product_id TEXT,
  variant_id TEXT,
  sku TEXT,
  barcode TEXT,
  barcode_type TEXT,
  item_category TEXT NOT NULL DEFAULT 'other',
  item_name TEXT NOT NULL,
  item_description TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  tax_code TEXT,
  cost_basis_cents INTEGER,
  snapshot_json TEXT,
  fulfillment_type TEXT NOT NULL DEFAULT 'physical_pickup', -- physical_pickup | shipped | digital | registration | no_fulfillment | donation_like
  fulfillment_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(order_id) REFERENCES commerce_orders(id)
);

CREATE INDEX IF NOT EXISTS idx_commerce_order_items_order ON commerce_order_items(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_commerce_order_items_variant ON commerce_order_items(parish_id, variant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_order_items_sku ON commerce_order_items(parish_id, sku, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_order_items_module ON commerce_order_items(parish_id, commerce_module, created_at DESC);

CREATE TABLE IF NOT EXISTS commerce_weekly_reports (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  commerce_module TEXT NOT NULL DEFAULT 'bookstore',
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  report_key TEXT NOT NULL,
  recipient_email TEXT,
  subject TEXT,
  order_count INTEGER NOT NULL DEFAULT 0,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_charged_cents INTEGER NOT NULL DEFAULT 0,
  parish_net_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  email_id TEXT,
  error TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_commerce_weekly_reports_key ON commerce_weekly_reports(parish_id, report_key);

CREATE TABLE IF NOT EXISTS commerce_products (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  commerce_module TEXT NOT NULL DEFAULT 'bookstore',
  name TEXT NOT NULL,
  description TEXT,
  item_category TEXT NOT NULL DEFAULT 'other',
  default_sku TEXT,
  default_tax_code TEXT,
  fulfillment_type TEXT NOT NULL DEFAULT 'physical_pickup',
  status TEXT NOT NULL DEFAULT 'active',
  image_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_commerce_products_parish ON commerce_products(parish_id, commerce_module, status, name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_commerce_products_default_sku ON commerce_products(parish_id, default_sku) WHERE default_sku IS NOT NULL AND default_sku <> '';

CREATE TABLE IF NOT EXISTS commerce_product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  parish_id TEXT NOT NULL,
  commerce_module TEXT NOT NULL DEFAULT 'bookstore',
  sku TEXT,
  barcode TEXT,
  variant_name TEXT,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  cost_basis_cents INTEGER NOT NULL DEFAULT 0,
  tax_code TEXT,
  fulfillment_type TEXT NOT NULL DEFAULT 'physical_pickup',
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  reorder_threshold INTEGER NOT NULL DEFAULT 0,
  track_inventory INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(product_id) REFERENCES commerce_products(id)
);
CREATE INDEX IF NOT EXISTS idx_commerce_variants_product ON commerce_product_variants(product_id, status);
CREATE INDEX IF NOT EXISTS idx_commerce_variants_parish ON commerce_product_variants(parish_id, commerce_module, status, sku);
CREATE UNIQUE INDEX IF NOT EXISTS idx_commerce_variants_sku ON commerce_product_variants(parish_id, sku) WHERE sku IS NOT NULL AND sku <> '';

CREATE TABLE IF NOT EXISTS commerce_checkout_sessions (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  user_email TEXT,
  user_name TEXT,
  commerce_module TEXT NOT NULL DEFAULT 'bookstore',
  source TEXT NOT NULL DEFAULT 'scan_and_go',
  status TEXT NOT NULL DEFAULT 'building',
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  order_id TEXT,
  device_id TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(order_id) REFERENCES commerce_orders(id)
);
CREATE INDEX IF NOT EXISTS idx_commerce_checkout_sessions_parish ON commerce_checkout_sessions(parish_id, commerce_module, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_checkout_sessions_user ON commerce_checkout_sessions(user_email, status, created_at DESC);

CREATE TABLE IF NOT EXISTS commerce_inventory_balances (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  commerce_module TEXT NOT NULL DEFAULT 'bookstore',
  product_id TEXT,
  variant_id TEXT,
  sku TEXT,
  location_id TEXT NOT NULL DEFAULT 'default',
  quantity_on_hand INTEGER NOT NULL DEFAULT 0,
  quantity_reserved INTEGER NOT NULL DEFAULT 0,
  reorder_level INTEGER NOT NULL DEFAULT 0,
  reorder_quantity INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(parish_id, variant_id, location_id)
);
CREATE INDEX IF NOT EXISTS idx_commerce_inventory_balances_sku ON commerce_inventory_balances(parish_id, sku, location_id);

CREATE TABLE IF NOT EXISTS commerce_inventory_movements (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  commerce_module TEXT NOT NULL DEFAULT 'bookstore',
  product_id TEXT,
  variant_id TEXT,
  sku TEXT,
  movement_type TEXT NOT NULL,
  quantity_delta INTEGER NOT NULL,
  unit_cost_cents INTEGER,
  order_id TEXT,
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(product_id) REFERENCES commerce_products(id),
  FOREIGN KEY(variant_id) REFERENCES commerce_product_variants(id),
  FOREIGN KEY(order_id) REFERENCES commerce_orders(id)
);
CREATE INDEX IF NOT EXISTS idx_commerce_inventory_movements_variant ON commerce_inventory_movements(parish_id, commerce_module, variant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_inventory_movements_sku ON commerce_inventory_movements(parish_id, sku, created_at DESC);

CREATE TABLE IF NOT EXISTS commerce_product_barcodes (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  commerce_module TEXT NOT NULL DEFAULT 'bookstore',
  product_id TEXT NOT NULL,
  variant_id TEXT,
  barcode TEXT NOT NULL,
  barcode_type TEXT NOT NULL DEFAULT 'unknown',
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(product_id) REFERENCES commerce_products(id),
  FOREIGN KEY(variant_id) REFERENCES commerce_product_variants(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_commerce_barcodes_unique ON commerce_product_barcodes(parish_id, barcode);
CREATE INDEX IF NOT EXISTS idx_commerce_barcodes_variant ON commerce_product_barcodes(parish_id, variant_id);

CREATE TABLE IF NOT EXISTS commerce_registered_devices (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  commerce_module TEXT NOT NULL DEFAULT 'bookstore',
  friendly_name TEXT NOT NULL,
  device_type TEXT NOT NULL DEFAULT 'tablet',
  device_token_hash TEXT,
  permissions_json TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_seen_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_commerce_registered_devices_parish ON commerce_registered_devices(parish_id, commerce_module, status, friendly_name);

CREATE TABLE IF NOT EXISTS parish_commerce_permissions (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  role TEXT NOT NULL, -- priest | treasurer | bookstore_manager | volunteer | inventory_manager | admin
  permissions_json TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(parish_id, user_email, role)
);

CREATE INDEX IF NOT EXISTS idx_parish_commerce_permissions_user
  ON parish_commerce_permissions(user_email, status);

-- Human-friendly receipt/order numbering: BK-2026-000145. This prevents the UI
-- and treasurer reports from needing to expose Stripe IDs.
CREATE TABLE IF NOT EXISTS parish_commerce_receipt_sequences (
  parish_id TEXT NOT NULL,
  commerce_module TEXT NOT NULL DEFAULT 'bookstore',
  year INTEGER NOT NULL,
  next_number INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(parish_id, commerce_module, year)
);
