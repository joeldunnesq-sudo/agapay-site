PRAGMA defer_foreign_keys=ON;
CREATE TABLE academic_years (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (household_id) REFERENCES learn_households(id) ON DELETE CASCADE,
  UNIQUE (household_id, name)
);
CREATE TABLE account_deletion_requests (
  id TEXT PRIMARY KEY,
  donor_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
  source TEXT NOT NULL DEFAULT 'myagapay-account-settings',
  requested_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  completion_notes TEXT
);
CREATE TABLE accounting_databases (
  id                    TEXT PRIMARY KEY,
  accounting_entity_id  TEXT NOT NULL,
  environment           TEXT NOT NULL,
  database_identifier   TEXT NOT NULL,
  schema_version_id     TEXT,
  schema_version        INTEGER NOT NULL DEFAULT 0,
  migration_version     TEXT NOT NULL DEFAULT 'none',
  provisioning_status   TEXT NOT NULL DEFAULT 'pending',
  health_status         TEXT NOT NULL DEFAULT 'unknown',
  provisioned_at        TEXT,
  last_validated_at     TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (environment IN ('local', 'test', 'staging', 'production')),
  CHECK (schema_version >= 0),
  CHECK (provisioning_status IN ('pending', 'provisioning', 'provisioned', 'migration_pending', 'migrating', 'ready', 'failed')),
  CHECK (health_status IN ('unknown', 'healthy', 'degraded', 'unhealthy', 'blocked')),
  FOREIGN KEY (accounting_entity_id) REFERENCES accounting_entities(id),
  FOREIGN KEY (schema_version_id) REFERENCES accounting_schema_versions(id)
);
CREATE TABLE accounting_entities (
  id                    TEXT PRIMARY KEY,
  parish_id             TEXT NOT NULL,
  entity_status         TEXT NOT NULL DEFAULT 'not_enabled',
  activation_status     TEXT NOT NULL DEFAULT 'inactive',
  subscription_tier     TEXT NOT NULL DEFAULT 'none',
  enabled_at            TEXT,
  suspended_at          TEXT,
  archived_at           TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (entity_status IN ('not_enabled', 'provisioning', 'provisioned', 'migrating', 'ready', 'suspended', 'archived')),
  CHECK (activation_status IN ('inactive', 'active', 'suspended', 'archived'))
);
CREATE TABLE accounting_integrity_alert_deliveries (
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
CREATE TABLE accounting_integrity_release_requests (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  expected_version INTEGER NOT NULL,
  reason TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  result_json TEXT,
  CHECK (status IN ('pending', 'completed', 'rejected', 'failed'))
);
CREATE TABLE accounting_lifecycle_events (
  id                    TEXT PRIMARY KEY,
  accounting_entity_id  TEXT NOT NULL,
  accounting_database_id TEXT,
  event_type            TEXT NOT NULL,
  from_state            TEXT,
  to_state              TEXT,
  actor_user_id         TEXT,
  actor_type            TEXT NOT NULL DEFAULT 'system',
  reason                TEXT,
  correlation_id        TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (accounting_entity_id) REFERENCES accounting_entities(id),
  FOREIGN KEY (accounting_database_id) REFERENCES accounting_databases(id)
);
CREATE TABLE accounting_provisioning_operations (
  id TEXT PRIMARY KEY,
  accounting_entity_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  operation TEXT NOT NULL DEFAULT 'provision',
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_expires_at TEXT,
  failure_code TEXT,
  failure_message TEXT,
  correlation_id TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (environment IN ('local', 'test', 'staging', 'production')),
  CHECK (status IN ('pending', 'running', 'ready', 'failed')),
  FOREIGN KEY (accounting_entity_id) REFERENCES accounting_entities(id)
);
CREATE TABLE accounting_schema_versions (
  id                    TEXT PRIMARY KEY,
  schema_version        INTEGER NOT NULL,
  migration_version     TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'planned',
  description           TEXT,
  released_at           TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (schema_version >= 0),
  CHECK (status IN ('planned', 'active', 'deprecated', 'blocked'))
);
CREATE TABLE accounting_staff_profiles (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role_template TEXT NOT NULL,
  capabilities_json TEXT NOT NULL,
  pin_record TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_by_actor_type TEXT NOT NULL,
  created_by_actor_id TEXT,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  last_authenticated_at TEXT
);
CREATE TABLE accounting_staff_sessions (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  parish_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  token_salt TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  revoked_at TEXT,
  FOREIGN KEY(profile_id) REFERENCES accounting_staff_profiles(id)
);
CREATE TABLE app_settings (   key TEXT PRIMARY KEY,   value TEXT NOT NULL,   updated_at TEXT NOT NULL );
CREATE TABLE audit_log (   id TEXT PRIMARY KEY,   actor_user_id TEXT,   actor_type TEXT NOT NULL DEFAULT 'admin',   actor_role TEXT,   action TEXT NOT NULL,   target_type TEXT,   target_id TEXT,   organization_id TEXT,   household_id TEXT,   request_id TEXT,   ip_hash TEXT,   reason TEXT,   before_summary_json TEXT,   after_summary_json TEXT,   metadata_json TEXT,   created_at TEXT NOT NULL DEFAULT (datetime('now')) );
CREATE TABLE commemorations (   id TEXT PRIMARY KEY,   parish_id TEXT NOT NULL,   source_id TEXT,   donor_email TEXT,   created_at TEXT NOT NULL,   data TEXT NOT NULL );
CREATE TABLE commerce_checkout_sessions (
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
CREATE TABLE commerce_inventory_balances (
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
CREATE TABLE commerce_inventory_count_sessions (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
  items_json TEXT NOT NULL DEFAULT '[]',
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  created_by TEXT
);
CREATE TABLE commerce_inventory_movements (
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')), count_session_id TEXT
  REFERENCES commerce_inventory_count_sessions(id),
  FOREIGN KEY(product_id) REFERENCES commerce_products(id),
  FOREIGN KEY(variant_id) REFERENCES commerce_product_variants(id),
  FOREIGN KEY(order_id) REFERENCES commerce_orders(id)
);
CREATE TABLE commerce_order_items (
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
  fulfillment_type TEXT NOT NULL DEFAULT 'physical_pickup',
  fulfillment_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(order_id) REFERENCES commerce_orders(id)
);
CREATE TABLE commerce_orders (
  id TEXT PRIMARY KEY,
  order_number TEXT,
  commerce_module TEXT NOT NULL DEFAULT 'bookstore',
  source TEXT NOT NULL DEFAULT 'manual_entry',
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



  status TEXT NOT NULL DEFAULT 'checkout_created',
  payment_status TEXT NOT NULL DEFAULT 'pending',

  checkout_session_local_id TEXT,
  checkout_session_id TEXT,
  checkout_url TEXT,
  stripe_customer_id TEXT,
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,

  fulfillment_status TEXT NOT NULL DEFAULT 'pending',
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
, settlement_profile_id TEXT);
CREATE TABLE commerce_product_barcodes (
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
CREATE TABLE commerce_product_variants (
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
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), sale_price_cents INTEGER, max_quantity_per_order INTEGER,
  FOREIGN KEY(product_id) REFERENCES commerce_products(id)
);
CREATE TABLE commerce_products (
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
, event_date TEXT, event_location TEXT, event_details TEXT, sales_close_at TEXT, ministry_id TEXT, created_by_person_id TEXT, event_start_time TEXT, event_end_time TEXT, event_timezone TEXT, show_on_calendar INTEGER NOT NULL DEFAULT 1, published_at TEXT);
CREATE TABLE commerce_registered_devices (
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
CREATE TABLE commerce_weekly_reports (
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
CREATE TABLE consumer_passkey_accounts (
  id           TEXT PRIMARY KEY,
  donor_email  TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE consumer_passkey_transactions (
  id                   TEXT PRIMARY KEY,
  purpose              TEXT NOT NULL CHECK (purpose IN ('authentication', 'registration')),
  account_id           TEXT,
  token_hash           TEXT NOT NULL,
  token_salt           TEXT NOT NULL,
  webauthn_challenge   TEXT NOT NULL,
  attempts             INTEGER NOT NULL DEFAULT 0,
  expires_at           TEXT NOT NULL,
  consumed_at          TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (account_id) REFERENCES consumer_passkey_accounts(id) ON DELETE CASCADE
);
CREATE TABLE consumer_webauthn_credentials (
  credential_id          TEXT PRIMARY KEY,
  account_id             TEXT NOT NULL,
  credential_public_key  TEXT NOT NULL,
  counter                INTEGER NOT NULL DEFAULT 0,
  transports_json        TEXT NOT NULL DEFAULT '[]',
  device_type            TEXT,
  backed_up               INTEGER NOT NULL DEFAULT 0,
  label                   TEXT NOT NULL DEFAULT 'Passkey',
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at            TEXT,
  FOREIGN KEY (account_id) REFERENCES consumer_passkey_accounts(id) ON DELETE CASCADE
);
CREATE TABLE courses (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  academic_year_id TEXT NOT NULL,
  course_title TEXT NOT NULL,
  grade_level INTEGER NOT NULL CHECK (grade_level BETWEEN 9 AND 12),
  credit_hours REAL NOT NULL DEFAULT 0 CHECK (credit_hours >= 0),
  subject_category TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (household_id) REFERENCES learn_households(id) ON DELETE CASCADE,
  FOREIGN KEY (child_id) REFERENCES learn_children(id) ON DELETE CASCADE,
  FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE,
  UNIQUE (child_id, academic_year_id, course_title)
);
CREATE TABLE directory_addresses (
  id                TEXT    PRIMARY KEY,
  parish_id         TEXT    NOT NULL,
  owner_type        TEXT    NOT NULL CHECK (owner_type IN ('person', 'household')),
  owner_id          TEXT    NOT NULL,
  address_type      TEXT    NOT NULL CHECK (address_type IN ('residential', 'mailing', 'alternate')),
  line1             TEXT    NOT NULL,
  line2             TEXT,
  city              TEXT    NOT NULL,
  region            TEXT,
  postal_code       TEXT,
  country           TEXT    NOT NULL DEFAULT 'US',
  normalized_value  TEXT    NOT NULL,
  is_primary        INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  protected_address INTEGER NOT NULL DEFAULT 0 CHECK (protected_address IN (0, 1)),
  visibility        TEXT    NOT NULL DEFAULT 'staff'
                               CHECK (visibility IN ('private', 'household', 'clergy', 'staff', 'leadership', 'directory_members')),
  active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  UNIQUE (owner_type, owner_id, address_type, normalized_value)
);
CREATE TABLE directory_change_requests (
  id                    TEXT    PRIMARY KEY,
  parish_id             TEXT    NOT NULL,
  requester_user_id      TEXT    NOT NULL,
  requester_person_id    TEXT    NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  target_type            TEXT    NOT NULL CHECK (target_type IN ('person', 'household')),
  target_id              TEXT    NOT NULL,
  household_id           TEXT,
  request_type           TEXT    NOT NULL CHECK (request_type IN (
                            'person_profile_review',
                            'household_membership_add',
                            'household_membership_remove',
                            'household_relationship_change',
                            'household_move_request',
                            'household_merge_review'
                          )),
  status                 TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN (
                            'pending', 'approved', 'denied', 'cancelled', 'completed'
                          )),
  summary                TEXT    NOT NULL,
  requested_payload_json TEXT    NOT NULL,
  decision_reason_code   TEXT,
  reviewed_by_user_id    TEXT,
  reviewed_at            INTEGER,
  cancelled_at           INTEGER,
  completed_at           INTEGER,
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL
);
CREATE TABLE directory_child_publication_requests (
  id                      TEXT    PRIMARY KEY,
  parish_id               TEXT    NOT NULL,
  household_id            TEXT    NOT NULL,
  child_person_id         TEXT    NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  requester_user_id       TEXT    NOT NULL,
  requester_person_id     TEXT,
  status                  TEXT    NOT NULL DEFAULT 'draft'
                              CHECK (status IN (
                                'draft', 'submitted', 'under_review', 'returned',
                                'approved', 'rejected', 'withdrawn', 'revoked', 'stale', 'superseded'
                              )),




  requested_fields_json   TEXT    NOT NULL DEFAULT '[]',
  approved_fields_json    TEXT    NOT NULL DEFAULT '[]',
  requested_photo         INTEGER NOT NULL DEFAULT 0 CHECK (requested_photo IN (0, 1)),
  approved_photo          INTEGER NOT NULL DEFAULT 0 CHECK (approved_photo IN (0, 1)),


  request_revision        INTEGER NOT NULL DEFAULT 1,
  child_revision           TEXT,
  household_revision       TEXT,
  policy_revision          TEXT    NOT NULL DEFAULT 'child-publication-v1',
  review_item_id           TEXT,
  reason_code               TEXT,
  parent_note                TEXT,
  reviewer_note               TEXT,
  reviewed_by_user_id          TEXT,
  created_at                    INTEGER NOT NULL,
  updated_at                    INTEGER NOT NULL,
  submitted_at                  INTEGER,
  approved_at                   INTEGER,
  withdrawn_at                  INTEGER,
  revoked_at                    INTEGER
);
CREATE TABLE directory_claims (
  id                    TEXT    PRIMARY KEY,
  parish_id             TEXT    NOT NULL,
  invitation_id         TEXT    NOT NULL REFERENCES directory_invitations(id) ON DELETE RESTRICT,
  claimant_user_id       TEXT    NOT NULL,
  requested_person_id    TEXT    NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  requested_household_id TEXT    REFERENCES directory_households(id) ON DELETE CASCADE,
  requested_authority    TEXT    NOT NULL CHECK (requested_authority IN (
                            'link_person', 'grant_household_admin', 'link_and_grant_household_admin'
                          )),
  claim_method          TEXT    NOT NULL DEFAULT 'exact_invitation' CHECK (claim_method IN (
                            'exact_invitation', 'parish_assisted'
                          )),
  status                TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN (
                            'pending', 'requires_review', 'approved', 'denied',
                            'cancelled', 'completed', 'conflicted'
                          )),
  conflict_codes_json   TEXT,
  submitted_at          INTEGER NOT NULL,
  reviewed_at           INTEGER,
  reviewed_by_user_id    TEXT,
  decision_reason_code  TEXT,
  review_note           TEXT,
  completed_at          INTEGER,
  cancelled_at          INTEGER,
  correlation_id        TEXT,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);
CREATE TABLE directory_contact_methods (
  id               TEXT    PRIMARY KEY,
  parish_id        TEXT    NOT NULL,
  owner_type       TEXT    NOT NULL CHECK (owner_type IN ('person', 'household')),
  owner_id         TEXT    NOT NULL,
  contact_type     TEXT    NOT NULL CHECK (contact_type IN ('email', 'phone')),
  label            TEXT    NOT NULL CHECK (label IN ('personal', 'work', 'household', 'mobile', 'home', 'other')),
  value            TEXT    NOT NULL,
  normalized_value TEXT    NOT NULL,
  is_primary       INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  verified         INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  sms_capable      INTEGER CHECK (sms_capable IN (0, 1)),
  visibility       TEXT    NOT NULL DEFAULT 'private'
                              CHECK (visibility IN ('private', 'household', 'clergy', 'staff', 'leadership', 'directory_members')),
  active           INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  UNIQUE (owner_type, owner_id, contact_type, normalized_value)
);
CREATE TABLE directory_duplicate_candidates (
  id                      TEXT    PRIMARY KEY,
  parish_id               TEXT    NOT NULL,
  entity_type             TEXT    NOT NULL CHECK (entity_type IN ('person', 'household')),
  left_entity_id          TEXT    NOT NULL,
  right_entity_id         TEXT    NOT NULL,
  normalized_pair_key     TEXT    NOT NULL,
  candidate_status        TEXT    NOT NULL DEFAULT 'open'
                                      CHECK (candidate_status IN (
                                        'open', 'assigned', 'in_review', 'deferred',
                                        'not_duplicate', 'confirmed_duplicate',
                                        'merge_planned', 'merge_ready', 'merged',
                                        'blocked', 'stale', 'cancelled'
                                      )),
  confidence_band         TEXT    NOT NULL DEFAULT 'low' CHECK (confidence_band IN ('low', 'medium', 'high', 'critical_identity_conflict')),
  score                   INTEGER NOT NULL DEFAULT 0,
  detection_source        TEXT    NOT NULL DEFAULT 'manual_scan',
  signal_summary_json     TEXT    NOT NULL,
  detection_version       TEXT    NOT NULL,
  decision                TEXT,
  decision_reason_code    TEXT,
  decided_by_user_id      TEXT,
  decided_at              INTEGER,
  suppression_until       INTEGER,
  left_revision_at_detection  TEXT,
  right_revision_at_detection TEXT,
  merge_plan_json         TEXT,
  merge_status            TEXT    NOT NULL DEFAULT 'none' CHECK (merge_status IN ('none', 'planned', 'ready', 'executed', 'blocked', 'failed')),
  merged_by_user_id       TEXT,
  merged_at               INTEGER,
  merge_event_id          TEXT,
  first_detected_at       INTEGER NOT NULL,
  last_detected_at        INTEGER NOT NULL,
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL,
  UNIQUE (parish_id, entity_type, normalized_pair_key, detection_version)
);
CREATE TABLE directory_field_privacy_preferences (
  id                   TEXT    PRIMARY KEY,
  parish_id            TEXT    NOT NULL,
  owner_type           TEXT    NOT NULL CHECK (owner_type IN ('person', 'household')),
  owner_id             TEXT    NOT NULL,
  field_key            TEXT    NOT NULL,
  visibility           TEXT    NOT NULL CHECK (visibility IN ('private', 'household', 'clergy', 'staff', 'leadership', 'directory_members')),
  publication_eligible INTEGER NOT NULL DEFAULT 0 CHECK (publication_eligible IN (0, 1)),
  active               INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL,
  UNIQUE (parish_id, owner_type, owner_id, field_key)
);
CREATE TABLE directory_household_admins (
  id            TEXT    PRIMARY KEY,
  household_id  TEXT    NOT NULL REFERENCES directory_households(id) ON DELETE CASCADE,
  person_id     TEXT    NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  start_date    TEXT,
  end_date      TEXT,
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE (household_id, person_id)
);
CREATE TABLE directory_household_invitations (
  id                 TEXT PRIMARY KEY,
  parish_id          TEXT NOT NULL,
  household_id       TEXT NOT NULL REFERENCES directory_households(id) ON DELETE CASCADE,
  person_id          TEXT NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  token              TEXT NOT NULL UNIQUE,
  created_by_user_id TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'claimed', 'expired', 'cancelled')),
  claimed_by_user_id TEXT,
  claimed_at         TEXT,
  created_at         TEXT NOT NULL,
  expires_at         TEXT NOT NULL
);
CREATE TABLE directory_household_members (
  id            TEXT    PRIMARY KEY,
  household_id  TEXT    NOT NULL REFERENCES directory_households(id) ON DELETE CASCADE,
  person_id     TEXT    NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  relationship  TEXT    NOT NULL CHECK (relationship IN ('head', 'spouse', 'child', 'grandparent', 'other')),
  start_date    TEXT,
  end_date      TEXT,
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE (household_id, person_id)
);
CREATE TABLE directory_household_namedays (
  id                  TEXT    PRIMARY KEY,
  parish_id           TEXT    NOT NULL,
  household_id        TEXT    NOT NULL REFERENCES directory_households(id) ON DELETE CASCADE,
  person_id           TEXT,
  display_name        TEXT    NOT NULL,
  saint_name          TEXT    NOT NULL,
  feast_month_day     TEXT    NOT NULL CHECK (length(feast_month_day) = 5),
  visibility          TEXT    NOT NULL DEFAULT 'private'
                              CHECK (visibility IN ('private', 'household', 'staff', 'directory_members')),
  active              INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by_user_id  TEXT    NOT NULL,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
CREATE TABLE directory_household_verifications (
  household_id                 TEXT    PRIMARY KEY REFERENCES directory_households(id) ON DELETE CASCADE,
  parish_id                    TEXT    NOT NULL,
  verification_status          TEXT    NOT NULL DEFAULT 'due'
                                      CHECK (verification_status IN ('current', 'due', 'overdue', 'in_progress', 'staff_review')),
  verification_due_at          INTEGER,
  last_verified_at             INTEGER,
  verification_started_at      INTEGER,
  verified_by_user_id          TEXT,
  verification_version         INTEGER NOT NULL DEFAULT 1,
  verification_policy_version  TEXT    NOT NULL DEFAULT 'phase5b-v1',
  created_at                   INTEGER NOT NULL,
  updated_at                   INTEGER NOT NULL
);
CREATE TABLE directory_households (
  id             TEXT    PRIMARY KEY,
  parish_id      TEXT    NOT NULL,
  display_name   TEXT    NOT NULL,
  active         INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
, anniversary_date TEXT);
CREATE TABLE directory_import_batches (
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
CREATE TABLE directory_import_leases (
  parish_id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE directory_import_rows (
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
CREATE TABLE directory_internal_notes (
  id                  TEXT    PRIMARY KEY,
  parish_id           TEXT    NOT NULL,
  target_type         TEXT    NOT NULL CHECK (target_type IN ('person', 'household', 'review_item', 'claim_conflict')),
  target_id           TEXT    NOT NULL,
  category            TEXT    NOT NULL DEFAULT 'general'
                                CHECK (category IN (
                                  'general', 'verification', 'household', 'contact',
                                  'publication', 'identity', 'protected', 'follow_up'
                                )),
  visibility_class    TEXT    NOT NULL DEFAULT 'staff' CHECK (visibility_class IN ('staff', 'protected')),
  body                TEXT    NOT NULL,
  created_by_user_id  TEXT    NOT NULL,
  updated_by_user_id  TEXT,
  archived_at         INTEGER,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
CREATE TABLE directory_invitations (
  id                  TEXT    PRIMARY KEY,
  parish_id           TEXT    NOT NULL,
  invitation_type     TEXT    NOT NULL CHECK (invitation_type IN (
                         'person_claim', 'household_admin', 'additional_household_admin'
                       )),
  intended_person_id     TEXT    REFERENCES directory_people(id) ON DELETE CASCADE,
  intended_household_id  TEXT    REFERENCES directory_households(id) ON DELETE CASCADE,
  intended_authority  TEXT    NOT NULL CHECK (intended_authority IN (
                         'link_person', 'grant_household_admin', 'link_and_grant_household_admin'
                       )),
  recipient_email     TEXT,
  recipient_phone     TEXT,
  recipient_label     TEXT,
  issued_by_user_id   TEXT    NOT NULL,
  token_hash          TEXT    NOT NULL,
  token_purpose       TEXT    NOT NULL DEFAULT 'directory_invitation',
  status              TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN (
                         'pending', 'sent', 'opened', 'accepted', 'completed',
                         'expired', 'revoked', 'cancelled'
                       )),
  requires_review     INTEGER NOT NULL DEFAULT 0 CHECK (requires_review IN (0, 1)),
  internal_reason     TEXT,
  resend_count        INTEGER NOT NULL DEFAULT 0,
  last_sent_at        INTEGER,
  correlation_id      TEXT,
  created_at          INTEGER NOT NULL,
  expires_at          INTEGER NOT NULL,
  accepted_at         INTEGER,
  revoked_at          INTEGER,
  completed_at        INTEGER,
  updated_at          INTEGER NOT NULL,



  CHECK (
    (invitation_type = 'person_claim' AND intended_person_id IS NOT NULL)
    OR (invitation_type IN ('household_admin', 'additional_household_admin')
        AND intended_person_id IS NOT NULL AND intended_household_id IS NOT NULL)
  )
);
CREATE TABLE "directory_media_assets" (
  id                        TEXT    PRIMARY KEY,
  parish_id                 TEXT    NOT NULL,
  owner_type                TEXT    NOT NULL CHECK (owner_type IN ('person', 'household')),
  owner_id                  TEXT    NOT NULL,
  media_purpose             TEXT    NOT NULL CHECK (media_purpose IN ('person_profile_photo', 'household_profile_photo')),
  lifecycle_status          TEXT    NOT NULL CHECK (lifecycle_status IN (
                                'uploading', 'ready', 'pending_approval', 'approved',
                                'rejected', 'replaced', 'deleted', 'failed'
                              )),
  -- Technical processing status -- separate from lifecycle_status (editorial/
  -- publication state, Part 2's "do not collapse technical security and
  -- editorial approval"). 'ready' is deliberately removed from this set: a
  -- generic "ready" flag is exactly what Part 1 prohibits relying on.
  processing_status         TEXT    NOT NULL DEFAULT 'pending' CHECK (processing_status IN (
                                'pending', 'source_validated', 'processing',
                                'securely_transformed', 'reprocessing_required', 'failed'
                              )),
  visibility                TEXT    NOT NULL DEFAULT 'private'
                                CHECK (visibility IN ('private', 'household', 'clergy', 'staff', 'leadership', 'directory_members')),
  publication_eligible      INTEGER NOT NULL DEFAULT 0 CHECK (publication_eligible IN (0, 1)),
  source_filename           TEXT,
  detected_mime_type        TEXT    NOT NULL,
  original_byte_size        INTEGER NOT NULL,
  original_width            INTEGER NOT NULL,
  original_height           INTEGER NOT NULL,
  decoded_pixel_count       INTEGER NOT NULL,
  content_hash              TEXT    NOT NULL,
  original_object_key       TEXT,
  -- Part 15: whether the original private source object is still available
  -- to serve as a reprocessing input. Existing Phase 2B rows retain their
  -- original object (source retention was never disabled), so this
  -- defaults to 1 for the backfill below; a future cleanup that removes an
  -- original must set this to 0 first.
  source_retained           INTEGER NOT NULL DEFAULT 1 CHECK (source_retained IN (0, 1)),
  reupload_required         INTEGER NOT NULL DEFAULT 0 CHECK (reupload_required IN (0, 1)),
  uploaded_by_user_id       TEXT    NOT NULL,
  active_assignment_id      TEXT,
  processing_error_code     TEXT,
  processing_attempt_count  INTEGER NOT NULL DEFAULT 0,
  -- Centralized pipeline-version policy (Part 18) -- which pipeline version
  -- last attempted processing on this asset, if any.
  pipeline_version           TEXT,
  correlation_id             TEXT,
  created_at                 INTEGER NOT NULL,
  updated_at                 INTEGER NOT NULL,
  deleted_at                 INTEGER
);
CREATE TABLE directory_media_assignments (
  id                  TEXT    PRIMARY KEY,
  parish_id           TEXT    NOT NULL,
  owner_type          TEXT    NOT NULL CHECK (owner_type IN ('person', 'household')),
  owner_id            TEXT    NOT NULL,
  media_purpose       TEXT    NOT NULL CHECK (media_purpose IN ('person_profile_photo', 'household_profile_photo')),
  media_asset_id      TEXT    NOT NULL REFERENCES directory_media_assets(id) ON DELETE RESTRICT,
  assignment_status   TEXT    NOT NULL CHECK (assignment_status IN ('candidate', 'active', 'replaced', 'deleted')),
  assigned_by_user_id TEXT    NOT NULL,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  replaced_at         INTEGER,
  deleted_at          INTEGER
);
CREATE TABLE directory_media_upload_sessions (
  id                  TEXT    PRIMARY KEY,
  parish_id           TEXT    NOT NULL,
  owner_type          TEXT    NOT NULL CHECK (owner_type IN ('person', 'household')),
  owner_id            TEXT    NOT NULL,
  media_purpose       TEXT    NOT NULL CHECK (media_purpose IN ('person_profile_photo', 'household_profile_photo')),
  requested_visibility TEXT   NOT NULL DEFAULT 'private',
  created_by_user_id  TEXT    NOT NULL,
  status              TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired', 'cancelled', 'failed')),
  expires_at          INTEGER NOT NULL,
  completed_at        INTEGER,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
CREATE TABLE directory_media_variants (
  id             TEXT    PRIMARY KEY,
  media_asset_id TEXT    NOT NULL REFERENCES directory_media_assets(id) ON DELETE CASCADE,
  variant_type   TEXT    NOT NULL CHECK (variant_type IN ('avatar_small', 'avatar_medium', 'avatar_large', 'household_card', 'review_preview')),
  width          INTEGER NOT NULL,
  height         INTEGER NOT NULL,
  mime_type      TEXT    NOT NULL,
  byte_size      INTEGER NOT NULL,
  r2_object_key  TEXT    NOT NULL,
  content_hash   TEXT    NOT NULL,
  ready          INTEGER NOT NULL DEFAULT 1 CHECK (ready IN (0, 1)),
  created_at     INTEGER NOT NULL, secure_transform_status TEXT NOT NULL DEFAULT 'unverified', transformer_name TEXT, transformer_version TEXT, pipeline_version TEXT, secure_transformed_at INTEGER, orientation_normalized INTEGER NOT NULL DEFAULT 0, crop_applied INTEGER NOT NULL DEFAULT 0, metadata_stripped INTEGER NOT NULL DEFAULT 0, output_content_hash TEXT, verified_at INTEGER,
  UNIQUE (media_asset_id, variant_type)
);
CREATE TABLE directory_merge_aliases (
  id                   TEXT    PRIMARY KEY,
  parish_id            TEXT    NOT NULL,
  entity_type          TEXT    NOT NULL CHECK (entity_type IN ('person', 'household')),
  old_entity_id        TEXT    NOT NULL,
  survivor_entity_id   TEXT    NOT NULL,
  merge_event_id       TEXT    NOT NULL,
  active               INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at           INTEGER NOT NULL,
  UNIQUE (parish_id, entity_type, old_entity_id)
);
CREATE TABLE directory_merge_events (
  id                    TEXT    PRIMARY KEY,
  parish_id             TEXT    NOT NULL,
  entity_type           TEXT    NOT NULL CHECK (entity_type IN ('person', 'household')),
  candidate_id          TEXT    NOT NULL,
  survivor_entity_id    TEXT    NOT NULL,
  retired_entity_id     TEXT    NOT NULL,
  executed_by_user_id   TEXT    NOT NULL,
  snapshot_json         TEXT    NOT NULL,
  reversible_metadata_json TEXT,
  created_at            INTEGER NOT NULL
);
CREATE TABLE directory_ministries (
  id                              TEXT    PRIMARY KEY,
  parish_id                       TEXT    NOT NULL,
  canonical_name                  TEXT    NOT NULL,
  display_name                    TEXT    NOT NULL,
  slug                            TEXT    NOT NULL,
  short_description               TEXT,
  detailed_description            TEXT,
  category                        TEXT    NOT NULL DEFAULT 'other'
                                      CHECK (category IN (
                                        'liturgical', 'educational', 'charitable',
                                        'hospitality', 'administrative', 'maintenance',
                                        'youth', 'fellowship', 'outreach',
                                        'bookstore', 'committee', 'other'
                                      )),
  status                          TEXT    NOT NULL DEFAULT 'draft'
                                      CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  visibility                      TEXT    NOT NULL DEFAULT 'parish_members'
                                      CHECK (visibility IN ('staff_only', 'parish_members', 'participants_only', 'hidden')),
  request_policy                  TEXT    NOT NULL DEFAULT 'closed'
                                      CHECK (request_policy IN ('closed', 'request_interest', 'administrator_assignment_only')),
  participant_publication_policy  TEXT    NOT NULL DEFAULT 'opt_in_reviewed'
                                      CHECK (participant_publication_policy IN ('hidden', 'opt_in_reviewed', 'leaders_only')),
  leader_publication_policy       TEXT    NOT NULL DEFAULT 'reviewed'
                                      CHECK (leader_publication_policy IN ('hidden', 'reviewed')),
  child_participation_policy      TEXT    NOT NULL DEFAULT 'excluded'
                                      CHECK (child_participation_policy = 'excluded'),
  display_order                   INTEGER NOT NULL DEFAULT 100,
  created_by_user_id              TEXT    NOT NULL,
  updated_by_user_id              TEXT    NOT NULL,
  created_at                      INTEGER NOT NULL,
  updated_at                      INTEGER NOT NULL,
  archived_at                     INTEGER,
  revision                        INTEGER NOT NULL DEFAULT 1, image_storage_key TEXT, image_content_type TEXT, image_updated_at INTEGER,
  UNIQUE (parish_id, slug)
);
CREATE TABLE directory_ministry_interest_requests (
  id                         TEXT    PRIMARY KEY,
  parish_id                  TEXT    NOT NULL,
  ministry_id                TEXT    NOT NULL REFERENCES directory_ministries(id) ON DELETE CASCADE,
  person_id                  TEXT    NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  requester_user_id           TEXT    NOT NULL,
  requester_person_id         TEXT    NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  interest_type              TEXT    NOT NULL DEFAULT 'participant'
                                  CHECK (interest_type IN ('participant', 'volunteer', 'member', 'helper', 'advisor')),
  member_note                TEXT,
  reviewer_note              TEXT,
  status                     TEXT    NOT NULL DEFAULT 'submitted'
                                  CHECK (status IN ('submitted', 'under_review', 'returned', 'approved', 'rejected', 'withdrawn', 'cancelled')),
  reviewed_by_user_id         TEXT,
  submitted_at               INTEGER,
  resolved_at                INTEGER,
  withdrawn_at               INTEGER,
  review_item_id             TEXT,
  created_at                 INTEGER NOT NULL,
  updated_at                 INTEGER NOT NULL,
  revision                   INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE directory_ministry_leaders (
  id                  TEXT    PRIMARY KEY,
  parish_id           TEXT    NOT NULL,
  ministry_id         TEXT    NOT NULL REFERENCES directory_ministries(id) ON DELETE CASCADE,
  person_id           TEXT    NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  assignment_type     TEXT    NOT NULL DEFAULT 'leader'
                            CHECK (assignment_type IN ('leader', 'assistant_leader', 'clergy_liaison', 'coordinator', 'administrator')),
  publication_state   TEXT    NOT NULL DEFAULT 'hidden'
                            CHECK (publication_state IN ('hidden', 'published')),
  active              INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  effective_at        INTEGER,
  ended_at            INTEGER,
  assigned_by_user_id TEXT    NOT NULL,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  revision            INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE directory_ministry_participants (
  id                     TEXT    PRIMARY KEY,
  parish_id              TEXT    NOT NULL,
  ministry_id            TEXT    NOT NULL REFERENCES directory_ministries(id) ON DELETE CASCADE,
  person_id              TEXT    NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  source                 TEXT    NOT NULL DEFAULT 'administrator_assigned'
                               CHECK (source IN ('administrator_assigned', 'member_requested', 'restored')),
  status                 TEXT    NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'paused', 'removed', 'withdrawn', 'ended')),
  participation_type     TEXT    NOT NULL DEFAULT 'participant'
                               CHECK (participation_type IN ('participant', 'volunteer', 'member', 'helper', 'advisor')),
  publication_preference TEXT    NOT NULL DEFAULT 'hidden'
                               CHECK (publication_preference IN ('hidden', 'directory')),
  approved_publication   INTEGER NOT NULL DEFAULT 0 CHECK (approved_publication IN (0, 1)),
  start_at               INTEGER,
  end_at                 INTEGER,
  assigned_by_user_id    TEXT    NOT NULL,
  request_id             TEXT,
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL,
  revision               INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE directory_notification_events (
  id             TEXT    PRIMARY KEY,
  parish_id      TEXT    NOT NULL,
  recipient_user_id TEXT,
  actor_user_id  TEXT,
  event_type     TEXT    NOT NULL,
  target_type    TEXT    NOT NULL,
  target_id      TEXT    NOT NULL,
  household_id   TEXT,
  safe_message   TEXT    NOT NULL,
  metadata_json  TEXT,
  read_at        INTEGER,
  created_at     INTEGER NOT NULL
);
CREATE TABLE directory_parish_affiliations (
  id          TEXT    PRIMARY KEY,
  person_id   TEXT    NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  parish_id   TEXT    NOT NULL,
  status      TEXT    NOT NULL CHECK (status IN ('member', 'catechumen', 'visitor', 'clergy', 'monastic', 'former_member')),
  joined_date TEXT,
  left_date   TEXT,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE (person_id, parish_id, status)
);
CREATE TABLE directory_parish_settings (
  parish_id                            TEXT    PRIMARY KEY,
  directory_enabled                    INTEGER NOT NULL DEFAULT 0 CHECK (directory_enabled IN (0, 1)),
  publication_approval_required        INTEGER NOT NULL DEFAULT 1 CHECK (publication_approval_required IN (0, 1)),
  child_names_allowed                  INTEGER NOT NULL DEFAULT 0 CHECK (child_names_allowed IN (0, 1)),
  child_photos_allowed                 INTEGER NOT NULL DEFAULT 0 CHECK (child_photos_allowed IN (0, 1)),
  address_max_visibility               TEXT    NOT NULL DEFAULT 'staff'
                                             CHECK (address_max_visibility IN ('private', 'household', 'clergy', 'staff', 'leadership', 'directory_members')),
  contact_max_visibility               TEXT    NOT NULL DEFAULT 'directory_members'
                                             CHECK (contact_max_visibility IN ('private', 'household', 'clergy', 'staff', 'leadership', 'directory_members')),
  ordinary_member_access_enabled       INTEGER NOT NULL DEFAULT 0 CHECK (ordinary_member_access_enabled IN (0, 1)),
  clergy_staff_access_policy           TEXT    NOT NULL DEFAULT 'capability_required'
                                             CHECK (clergy_staff_access_policy IN ('capability_required')),
  reconfirmation_interval_days         INTEGER NOT NULL DEFAULT 365,
  default_household_publication_status TEXT    NOT NULL DEFAULT 'draft'
                                             CHECK (default_household_publication_status IN ('not_configured', 'draft', 'pending_approval')),
  created_at                           INTEGER NOT NULL,
  updated_at                           INTEGER NOT NULL
, skills_directory_enabled INTEGER NOT NULL DEFAULT 1 CHECK (skills_directory_enabled IN (0, 1)), skills_member_search_enabled INTEGER NOT NULL DEFAULT 1 CHECK (skills_member_search_enabled IN (0, 1)), skills_staff_only_mode INTEGER NOT NULL DEFAULT 0 CHECK (skills_staff_only_mode IN (0, 1)), skills_custom_entries_enabled INTEGER NOT NULL DEFAULT 1 CHECK (skills_custom_entries_enabled IN (0, 1)), skills_disclaimer_text TEXT NOT NULL DEFAULT 'Skills and experience are self-reported. AGAPAY and the parish do not verify licenses, credentials, insurance, background checks, or suitability.', skills_contact_fallback TEXT NOT NULL DEFAULT 'Contact the parish office if a direct published contact is unavailable.', skills_last_reviewed_at INTEGER, household_verification_interval_days INTEGER NOT NULL DEFAULT 365);
CREATE TABLE directory_people (
  id                   TEXT    PRIMARY KEY,
  created_by_parish_id TEXT    NOT NULL,
  preferred_name       TEXT    NOT NULL,
  legal_name           TEXT,
  middle_name          TEXT,
  suffix               TEXT,
  date_of_birth        TEXT,
  biological_sex       TEXT    NOT NULL DEFAULT 'unknown'
                                  CHECK (biological_sex IN ('unknown', 'female', 'male')),
  deceased             INTEGER NOT NULL DEFAULT 0 CHECK (deceased IN (0, 1)),
  active               INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  notes                TEXT,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);
CREATE TABLE directory_person_links (
  id          TEXT    PRIMARY KEY,
  person_id   TEXT    NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  link_type   TEXT    NOT NULL,
  external_id TEXT    NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL, source TEXT NOT NULL DEFAULT 'manual', claim_id TEXT,
  UNIQUE (link_type, external_id),
  UNIQUE (person_id, link_type, external_id)
);
CREATE TABLE directory_person_privacy_flags (
  id               TEXT    PRIMARY KEY,
  parish_id        TEXT    NOT NULL,
  person_id        TEXT    NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  is_child         INTEGER NOT NULL DEFAULT 0 CHECK (is_child IN (0, 1)),
  protected_person INTEGER NOT NULL DEFAULT 0 CHECK (protected_person IN (0, 1)),
  active           INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  UNIQUE (parish_id, person_id)
);
CREATE TABLE directory_person_skill_listings (
  id                         TEXT    PRIMARY KEY,
  parish_id                  TEXT    NOT NULL,
  person_id                  TEXT    NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  skill_id                   TEXT    NOT NULL REFERENCES directory_skill_catalog(id),
  custom_display_label       TEXT,
  experience_level           TEXT    NOT NULL DEFAULT 'willing_to_help'
                                  CHECK (experience_level IN ('willing_to_help', 'experienced', 'professional', 'retired_professional', 'other')),
  service_mode               TEXT    NOT NULL DEFAULT 'informal_parishioner_help'
                                  CHECK (service_mode IN ('parish_projects', 'informal_parishioner_help', 'advice_or_guidance', 'transportation', 'teaching_or_tutoring', 'emergency_assistance', 'professional_services', 'other')),
  availability_note          TEXT,
  contact_preference         TEXT    NOT NULL DEFAULT 'parish_office'
                                  CHECK (contact_preference IN ('published_email', 'published_phone', 'parish_office', 'ask_in_person', 'no_direct_contact')),
  visibility                 TEXT    NOT NULL DEFAULT 'private'
                                  CHECK (visibility IN ('private', 'parish_staff', 'directory_members')),
  status                     TEXT    NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft', 'active', 'paused', 'hidden_by_parish', 'withdrawn', 'archived')),
  consent_recorded_at        INTEGER,
  consent_withdrawn_at       INTEGER,
  consent_policy_version     TEXT,
  consent_source             TEXT,
  reviewed_at                INTEGER,
  reviewed_by_actor_type     TEXT,
  reviewed_by_actor_id       TEXT,
  parish_hidden_reason       TEXT,
  parish_hidden_at           INTEGER,
  created_by_user_id         TEXT    NOT NULL,
  created_at                 INTEGER NOT NULL,
  updated_at                 INTEGER NOT NULL,
  version                    INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE directory_publication_profiles (
  id              TEXT    PRIMARY KEY,
  parish_id       TEXT    NOT NULL,
  owner_type      TEXT    NOT NULL CHECK (owner_type IN ('person', 'household')),
  owner_id        TEXT    NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'not_configured'
                              CHECK (status IN ('not_configured', 'draft', 'pending_approval', 'approved', 'paused', 'archived')),
  approval_status TEXT    NOT NULL DEFAULT 'not_submitted'
                              CHECK (approval_status IN ('not_submitted', 'pending', 'approved', 'rejected')),
  approved_by_user_id TEXT,
  approved_at     INTEGER,
  active          INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  UNIQUE (parish_id, owner_type, owner_id)
);
CREATE TABLE directory_review_correspondence (
  id                  TEXT PRIMARY KEY,
  parish_id           TEXT NOT NULL,
  source_type         TEXT NOT NULL,
  source_id           TEXT NOT NULL,
  direction           TEXT NOT NULL CHECK (direction IN ('staff_to_member', 'member_to_staff')),
  body                TEXT NOT NULL,
  created_by_user_id  TEXT NOT NULL,
  created_at          INTEGER NOT NULL
);
CREATE TABLE "directory_review_metadata" (
  id                    TEXT    PRIMARY KEY,
  parish_id             TEXT    NOT NULL,
  source_type           TEXT    NOT NULL CHECK (source_type IN (
                            'change_request', 'publication_profile', 'media_asset',
                            'duplicate_candidate', 'child_publication', 'ministry_interest'
                          )),
  source_id             TEXT    NOT NULL,
  queue_status          TEXT    NOT NULL DEFAULT 'pending_review'
                                  CHECK (queue_status IN (
                                    'pending_review', 'assigned', 'in_review', 'returned',
                                    'approved', 'denied', 'cancelled', 'completed',
                                    'failed_resolution'
                                  )),
  priority              TEXT    NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'elevated', 'urgent')),
  assigned_to_user_id   TEXT,
  assigned_by_user_id   TEXT,
  assigned_at           INTEGER,
  review_started_at     INTEGER,
  returned_at           INTEGER,
  completed_at          INTEGER,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  UNIQUE (source_type, source_id)
);
CREATE TABLE directory_skill_catalog (
  id                    TEXT    PRIMARY KEY,
  code                  TEXT    NOT NULL,
  name                  TEXT    NOT NULL,
  description           TEXT,
  category              TEXT    NOT NULL CHECK (category IN (
                            'home_and_repairs', 'transportation', 'hospitality_and_food',
                            'education_and_tutoring', 'technology', 'language_and_translation',
                            'professional_knowledge', 'care_and_assistance', 'arts_and_media',
                            'parish_service', 'agriculture_and_outdoors', 'other'
                          )),
  is_platform_default   INTEGER NOT NULL DEFAULT 0 CHECK (is_platform_default IN (0, 1)),
  parish_id             TEXT,
  is_active             INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  replacement_skill_id  TEXT,
  sort_order            INTEGER NOT NULL DEFAULT 100,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  created_by_actor_type TEXT    NOT NULL DEFAULT 'system',
  created_by_actor_id   TEXT    NOT NULL DEFAULT 'system',
  version               INTEGER NOT NULL DEFAULT 1,
  UNIQUE (parish_id, code)
);
CREATE TABLE donor_custom_news_feeds (
  id TEXT PRIMARY KEY,
  donor_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  source_label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (donor_id, feed_url)
);
CREATE TABLE donor_external_feed_subscriptions (
  donor_id TEXT NOT NULL,
  feed_key TEXT NOT NULL CHECK (feed_key IN ('orthochristian')),
  subscribed INTEGER NOT NULL DEFAULT 0 CHECK (subscribed IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (donor_id, feed_key)
);
CREATE TABLE donor_news_source_subscriptions (
  donor_id TEXT NOT NULL,
  source_key TEXT NOT NULL CHECK (source_key IN ('parish_blog', 'oca', 'orthochristian', 'spzh', 'orthodoxtimes', 'orthodoxethos')),
  subscribed INTEGER NOT NULL DEFAULT 0 CHECK (subscribed IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (donor_id, source_key)
);
CREATE TABLE donor_notifications (   id              TEXT PRIMARY KEY,   donor_email     TEXT NOT NULL,   parish_id       TEXT NOT NULL,   type            TEXT NOT NULL DEFAULT 'pledge_nudge',   fiscal_year     INTEGER NOT NULL,   pledge_cents    INTEGER NOT NULL DEFAULT 0,   given_cents     INTEGER NOT NULL DEFAULT 0,   message         TEXT,   sent_at         TEXT NOT NULL DEFAULT (datetime('now')),   dismissed_at    TEXT );
CREATE TABLE donor_offerings (   id TEXT PRIMARY KEY,   donor_email TEXT NOT NULL,   parish_id TEXT,   checkout_session_id TEXT,   payment_intent_id TEXT,   stripe_subscription_id TEXT,   status TEXT,   payment_status TEXT,   created_at TEXT,   updated_at TEXT NOT NULL,   data TEXT NOT NULL , settlement_profile_id TEXT);
CREATE TABLE donor_podcast_preferences (
  donor_id TEXT PRIMARY KEY,
  playback_rate REAL NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE donor_podcast_progress (
  donor_id TEXT NOT NULL,
  episode_key TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  show_title TEXT,
  episode_title TEXT,
  position_seconds INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (donor_id, episode_key)
);
CREATE TABLE donor_podcast_subscriptions (
  donor_id TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  show_title TEXT NOT NULL,
  artwork_url TEXT,
  website_url TEXT,
  author TEXT,
  subscribed_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (donor_id, feed_url)
);
CREATE TABLE donors (   email TEXT PRIMARY KEY,   default_parish_id TEXT,   email_verified_at TEXT,   created_at TEXT,   updated_at TEXT NOT NULL,   data TEXT NOT NULL );
CREATE TABLE giving_funds (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  parish_id   TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  code        TEXT    NOT NULL,
  is_default  INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(parish_id, code)
);
CREATE TABLE giving_statement_jobs (
  id                TEXT    PRIMARY KEY,
  parish_id         TEXT    NOT NULL,
  fiscal_year       INTEGER NOT NULL,
  -- pending | running | completed | completed_with_errors | failed
  status            TEXT    NOT NULL DEFAULT 'pending',
  total_donors      INTEGER NOT NULL DEFAULT 0,
  processed_donors  INTEGER NOT NULL DEFAULT 0,
  sent_count        INTEGER NOT NULL DEFAULT 0,
  failed_count      INTEGER NOT NULL DEFAULT 0,
  triggered_by      TEXT,
  error             TEXT,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  completed_at      TEXT
);
CREATE TABLE giving_statements (
  id             TEXT    PRIMARY KEY,
  job_id         TEXT    REFERENCES giving_statement_jobs(id),
  parish_id      TEXT    NOT NULL,
  donor_email    TEXT    NOT NULL,
  fiscal_year    INTEGER NOT NULL,
  total_cents    INTEGER NOT NULL,
  gift_count     INTEGER NOT NULL,
  storage_key    TEXT,                             -- R2 object key in GIVING_STATEMENTS
  -- pending | sent | failed | skipped
  email_status   TEXT    NOT NULL DEFAULT 'pending',
  email_error    TEXT,
  generated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  sent_at        TEXT,
  UNIQUE(parish_id, donor_email, fiscal_year)
);
CREATE TABLE grades_and_progress (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  term_index INTEGER NOT NULL CHECK (term_index IN (1, 2, 3)),
  numeric_score REAL CHECK (numeric_score IS NULL OR (numeric_score >= 0 AND numeric_score <= 100)),
  letter_grade TEXT,
  teacher_notes TEXT,
  attendance_days INTEGER NOT NULL DEFAULT 0 CHECK (attendance_days >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  UNIQUE (course_id, term_index)
);
CREATE TABLE "household_pledges" (   donor_email         TEXT    NOT NULL,   parish_id           TEXT    NOT NULL,   fiscal_year         INTEGER NOT NULL,   target_amount_cents INTEGER NOT NULL DEFAULT 0,   created_at          TEXT    NOT NULL DEFAULT (datetime('now')),   updated_at          TEXT    NOT NULL DEFAULT (datetime('now')),   PRIMARY KEY (donor_email, parish_id, fiscal_year) );
CREATE TABLE koinonia_community_tool_views (
  parish_id      TEXT    NOT NULL,
  person_id      TEXT    NOT NULL,
  tool           TEXT    NOT NULL CHECK (tool IN ('signups', 'exchange')),
  last_opened_at INTEGER NOT NULL,
  PRIMARY KEY (parish_id, person_id, tool)
);
CREATE TABLE koinonia_exchange_listings (
  id                    TEXT    PRIMARY KEY,
  parish_id             TEXT    NOT NULL,
  household_id          TEXT,
  posted_by_person_id   TEXT    NOT NULL,
  listing_type          TEXT    NOT NULL CHECK (listing_type IN ('offer', 'request')),
  category              TEXT    NOT NULL DEFAULT 'other'
                          CHECK (category IN (
                            'household_goods', 'furniture', 'clothing', 'books',
                            'children_baby', 'tools', 'services', 'other'
                          )),
  title                 TEXT    NOT NULL,
  description           TEXT,
  price_cents           INTEGER,
  status                TEXT    NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'completed', 'expired', 'removed')),
  expires_at            INTEGER,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  completed_at          INTEGER,
  revision              INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE koinonia_exchange_messages (
  id                TEXT    PRIMARY KEY,
  thread_id         TEXT    NOT NULL REFERENCES koinonia_exchange_threads(id) ON DELETE CASCADE,
  parish_id         TEXT    NOT NULL,
  sender_person_id  TEXT    NOT NULL,
  body              TEXT,
  message_type      TEXT    NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image')),
  attachment_url    TEXT,
  created_at        INTEGER NOT NULL
);
CREATE TABLE koinonia_exchange_photos (
  id             TEXT    PRIMARY KEY,
  listing_id     TEXT    NOT NULL REFERENCES koinonia_exchange_listings(id) ON DELETE CASCADE,
  storage_key    TEXT    NOT NULL,
  display_order  INTEGER NOT NULL DEFAULT 100,
  created_at     INTEGER NOT NULL
);
CREATE TABLE koinonia_exchange_threads (
  id                    TEXT    PRIMARY KEY,
  listing_id            TEXT    NOT NULL REFERENCES koinonia_exchange_listings(id) ON DELETE CASCADE,
  parish_id             TEXT    NOT NULL,
  requester_person_id   TEXT    NOT NULL,
  status                TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  closed_at             INTEGER,
  closed_reason         TEXT CHECK (closed_reason IN ('listing_completed', 'manual', NULL)),
  revision              INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE koinonia_ministry_availability (
  parish_id TEXT NOT NULL, ministry_id TEXT NOT NULL, person_id TEXT NOT NULL, availability_note TEXT,
  updated_at INTEGER NOT NULL, PRIMARY KEY(parish_id,ministry_id,person_id)
);
CREATE TABLE koinonia_ministry_event_attendance (
  event_id TEXT NOT NULL REFERENCES koinonia_ministry_events(id) ON DELETE CASCADE, person_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('present','absent','excused')), recorded_by_person_id TEXT NOT NULL, recorded_at INTEGER NOT NULL,
  PRIMARY KEY(event_id,person_id)
);
CREATE TABLE koinonia_ministry_events (
  id TEXT PRIMARY KEY, parish_id TEXT NOT NULL, ministry_id TEXT NOT NULL REFERENCES directory_ministries(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT, location TEXT, starts_at INTEGER NOT NULL, ends_at INTEGER,
  recurrence_group_id TEXT, created_by_person_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE koinonia_ministry_resources (
  id TEXT PRIMARY KEY, parish_id TEXT NOT NULL, ministry_id TEXT NOT NULL REFERENCES directory_ministries(id) ON DELETE CASCADE,
  title TEXT NOT NULL, resource_type TEXT NOT NULL CHECK(resource_type IN ('link','document','checklist','training')),
  url TEXT, notes TEXT, created_by_person_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE koinonia_prayer_acknowledgements (
  request_id       TEXT    NOT NULL REFERENCES koinonia_prayer_requests(id) ON DELETE CASCADE,
  parish_id        TEXT    NOT NULL,
  person_id        TEXT    NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  created_at       INTEGER NOT NULL,
  PRIMARY KEY (request_id, person_id)
);
CREATE TABLE koinonia_prayer_activity (
  id               TEXT    PRIMARY KEY,
  parish_id        TEXT    NOT NULL,
  request_id       TEXT    NOT NULL REFERENCES koinonia_prayer_requests(id) ON DELETE CASCADE,
  actor_type       TEXT    NOT NULL CHECK (actor_type IN ('member', 'parish_dashboard', 'system')),
  actor_person_id  TEXT,
  action           TEXT    NOT NULL,
  detail           TEXT,
  created_at       INTEGER NOT NULL
);
CREATE TABLE koinonia_prayer_reports (
  id                 TEXT    PRIMARY KEY,
  request_id         TEXT    NOT NULL REFERENCES koinonia_prayer_requests(id) ON DELETE CASCADE,
  parish_id          TEXT    NOT NULL,
  reporter_person_id TEXT    NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  reason             TEXT,
  created_at         INTEGER NOT NULL,
  resolved_at        INTEGER,
  UNIQUE (request_id, reporter_person_id)
);
CREATE TABLE koinonia_prayer_requests (
  id                       TEXT    PRIMARY KEY,
  parish_id                TEXT    NOT NULL,
  household_id             TEXT,
  submitted_by_person_id   TEXT    NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  body                     TEXT    NOT NULL,
  visibility               TEXT    NOT NULL DEFAULT 'parish_members'
                                  CHECK (visibility IN ('parish_members', 'clergy_only')),
  anonymous_to_parish      INTEGER NOT NULL DEFAULT 0 CHECK (anonymous_to_parish IN (0, 1)),
  status                   TEXT    NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'active', 'answered', 'flagged', 'declined', 'archived')),
  moderation_note          TEXT,
  decline_reason           TEXT,
  created_at               INTEGER NOT NULL,
  updated_at               INTEGER NOT NULL,
  published_at             INTEGER,
  expires_at               INTEGER,
  answered_at              INTEGER,
  archived_at              INTEGER,
  revision                 INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE koinonia_prayer_settings (
  parish_id            TEXT    PRIMARY KEY,
  approval_required    INTEGER NOT NULL DEFAULT 1 CHECK (approval_required IN (0, 1)),
  allow_anonymous      INTEGER NOT NULL DEFAULT 1 CHECK (allow_anonymous IN (0, 1)),
  auto_archive_days    INTEGER NOT NULL DEFAULT 30 CHECK (auto_archive_days BETWEEN 7 AND 365),
  notification_mode    TEXT    NOT NULL DEFAULT 'immediate'
                              CHECK (notification_mode IN ('immediate', 'daily_digest', 'off')),
  pastoral_notice      TEXT,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);
CREATE TABLE koinonia_prayer_views (
  parish_id      TEXT    NOT NULL,
  person_id      TEXT    NOT NULL,
  last_opened_at INTEGER NOT NULL,
  PRIMARY KEY (parish_id, person_id)
);
CREATE TABLE koinonia_signup_activity (
  id TEXT PRIMARY KEY, parish_id TEXT NOT NULL, sheet_id TEXT, slot_id TEXT, actor_person_id TEXT NOT NULL,
  action TEXT NOT NULL, summary TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE koinonia_signup_coverage_requests (
  id TEXT PRIMARY KEY, parish_id TEXT NOT NULL, entry_id TEXT NOT NULL REFERENCES koinonia_signup_entries(id) ON DELETE CASCADE,
  requester_person_id TEXT NOT NULL, replacement_person_id TEXT, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','accepted','cancelled')),
  note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE koinonia_signup_entries (
  id             TEXT    PRIMARY KEY,
  slot_id        TEXT    NOT NULL REFERENCES koinonia_signup_slots(id) ON DELETE CASCADE,
  parish_id      TEXT    NOT NULL,
  household_id   TEXT,
  person_id      TEXT    NOT NULL,
  comment        TEXT,
  status         TEXT    NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('confirmed', 'cancelled')),
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE TABLE koinonia_signup_notification_log (
  entry_id TEXT NOT NULL, notification_type TEXT NOT NULL, sent_at INTEGER NOT NULL,
  PRIMARY KEY(entry_id,notification_type)
);
CREATE TABLE koinonia_signup_service_records (
  entry_id TEXT PRIMARY KEY REFERENCES koinonia_signup_entries(id) ON DELETE CASCADE, parish_id TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0, attended INTEGER, completed_by_person_id TEXT, completed_at INTEGER, thanked_at INTEGER
);
CREATE TABLE koinonia_signup_sheets (
  id                  TEXT    PRIMARY KEY,
  parish_id           TEXT    NOT NULL,
  ministry_id         TEXT    NOT NULL REFERENCES directory_ministries(id) ON DELETE CASCADE,
  title               TEXT    NOT NULL,
  description         TEXT,
  category             TEXT    NOT NULL DEFAULT 'general'
                          CHECK (category IN (
                            'meal_train', 'cleaning', 'event', 'volunteer', 'general'
                          )),
  status              TEXT    NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'open', 'closed', 'archived')),
  visibility          TEXT    NOT NULL DEFAULT 'parish_members'
                          CHECK (visibility IN ('parish_members', 'ministry_participants_only')),
  created_by_person_id TEXT   NOT NULL,
  updated_by_person_id TEXT   NOT NULL,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  archived_at         INTEGER,
  revision            INTEGER NOT NULL DEFAULT 1
, published_at INTEGER);
CREATE TABLE koinonia_signup_slots (
  id             TEXT    PRIMARY KEY,
  sheet_id       TEXT    NOT NULL REFERENCES koinonia_signup_sheets(id) ON DELETE CASCADE,
  parish_id      TEXT    NOT NULL,
  label          TEXT    NOT NULL,
  notes          TEXT,
  needed_count   INTEGER NOT NULL DEFAULT 1 CHECK (needed_count > 0),
  slot_date      INTEGER,
  display_order  INTEGER NOT NULL DEFAULT 100,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  revision       INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE koinonia_signup_templates (
  id TEXT PRIMARY KEY, parish_id TEXT NOT NULL, ministry_id TEXT NOT NULL, name TEXT NOT NULL,
  title TEXT NOT NULL, description TEXT, category TEXT NOT NULL, slots_json TEXT NOT NULL,
  created_by_person_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE koinonia_signup_waitlist (
  id TEXT PRIMARY KEY, parish_id TEXT NOT NULL, slot_id TEXT NOT NULL REFERENCES koinonia_signup_slots(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','offered','claimed','withdrawn')),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE learn_academic_records (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  occurred_on TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES learn_households(id),
  FOREIGN KEY (child_id) REFERENCES learn_children(id)
);
CREATE TABLE learn_attendance_days (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  academic_year_id TEXT NOT NULL,
  attendance_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'excused', 'holiday')),
  minutes INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (household_id) REFERENCES learn_households(id) ON DELETE CASCADE,
  FOREIGN KEY (child_id) REFERENCES learn_children(id) ON DELETE CASCADE,
  FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE,
  UNIQUE (child_id, academic_year_id, attendance_date)
);
CREATE TABLE learn_book_assignments (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  assignment_type TEXT NOT NULL,
  assignee_id TEXT NOT NULL,
  progress_percent INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (book_id) REFERENCES learn_books(id)
);
CREATE TABLE learn_books (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  category TEXT NOT NULL,
  audience_label TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES learn_households(id)
);
CREATE TABLE learn_catechesis_cycles (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  cycle_year_id TEXT NOT NULL,
  title TEXT NOT NULL,
  current_lesson TEXT NOT NULL,
  lesson_number INTEGER NOT NULL,
  total_lessons INTEGER NOT NULL,
  doctrinal_topic TEXT NOT NULL,
  evaluation_model TEXT NOT NULL DEFAULT 'narrative-only',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (household_id) REFERENCES learn_households(id),
  FOREIGN KEY (cycle_year_id) REFERENCES learn_cycle_years(id)
);
CREATE TABLE learn_child_lesson_blocks (
  id TEXT PRIMARY KEY,
  lesson_day_id TEXT NOT NULL,
  child_track_id TEXT NOT NULL,
  status TEXT NOT NULL,
  minutes_planned INTEGER NOT NULL DEFAULT 0,
  minutes_actual INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (lesson_day_id) REFERENCES learn_lesson_days(id),
  FOREIGN KEY (child_track_id) REFERENCES learn_child_tracks(id)
);
CREATE TABLE learn_child_tracks (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  title TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (child_id) REFERENCES learn_children(id)
);
CREATE TABLE learn_children (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  first_name TEXT NOT NULL,
  age_years INTEGER NOT NULL,
  grade_label TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES learn_households(id)
);
CREATE TABLE learn_church_rhythm_practices (
  id TEXT PRIMARY KEY,
  lesson_day_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (lesson_day_id) REFERENCES learn_lesson_days(id)
);
CREATE TABLE learn_co_op_announcements (
  id TEXT PRIMARY KEY,
  co_op_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  posted_at TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (co_op_id) REFERENCES learn_co_ops(id)
);
CREATE TABLE learn_co_op_meetings (
  id TEXT PRIMARY KEY,
  co_op_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  location_label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (co_op_id) REFERENCES learn_co_ops(id)
);
CREATE TABLE learn_co_op_members (
  id TEXT PRIMARY KEY,
  co_op_id TEXT NOT NULL,
  household_name TEXT NOT NULL,
  children_count INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (co_op_id) REFERENCES learn_co_ops(id)
);
CREATE TABLE learn_co_op_schedule_blocks (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  teacher_household_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (meeting_id) REFERENCES learn_co_op_meetings(id)
);
CREATE TABLE learn_co_ops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  affiliation TEXT NOT NULL,
  learning_cycle_label TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE learn_curriculum_mappings (
  id TEXT PRIMARY KEY,
  curriculum_package_id TEXT NOT NULL,
  curriculum_resource_id TEXT NOT NULL,
  mapping_scope TEXT NOT NULL,
  target_id TEXT NOT NULL,
  cycle_framework_id TEXT,
  cycle_year_id TEXT,
  term_id TEXT,
  priority INTEGER NOT NULL DEFAULT 3,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (curriculum_package_id) REFERENCES learn_curriculum_packages(id),
  FOREIGN KEY (curriculum_resource_id) REFERENCES learn_curriculum_resources(id),
  FOREIGN KEY (cycle_framework_id) REFERENCES learn_cycle_frameworks(id),
  FOREIGN KEY (cycle_year_id) REFERENCES learn_cycle_years(id),
  FOREIGN KEY (term_id) REFERENCES learn_terms(id)
);
CREATE TABLE learn_curriculum_packages (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  title TEXT NOT NULL,
  vendor TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES learn_households(id)
);
CREATE TABLE learn_curriculum_resources (
  id TEXT PRIMARY KEY,
  curriculum_package_id TEXT NOT NULL,
  curriculum_subject_id TEXT,
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  resource_type TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (curriculum_package_id) REFERENCES learn_curriculum_packages(id),
  FOREIGN KEY (curriculum_subject_id) REFERENCES learn_curriculum_subjects(id)
);
CREATE TABLE learn_curriculum_subjects (
  id TEXT PRIMARY KEY,
  curriculum_package_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (curriculum_package_id) REFERENCES learn_curriculum_packages(id)
);
CREATE TABLE learn_cycle_frameworks (
  id TEXT PRIMARY KEY,
  framework_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE learn_cycle_topics (
  id TEXT PRIMARY KEY,
  cycle_year_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  title TEXT NOT NULL,
  season_label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (cycle_year_id) REFERENCES learn_cycle_years(id)
);
CREATE TABLE learn_cycle_years (
  id TEXT PRIMARY KEY,
  cycle_framework_id TEXT NOT NULL,
  year_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (cycle_framework_id) REFERENCES learn_cycle_frameworks(id)
);
CREATE TABLE learn_enrichment_blocks (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  term_id TEXT NOT NULL,
  block_type TEXT NOT NULL,
  title TEXT NOT NULL,
  minutes_planned INTEGER NOT NULL DEFAULT 0,
  cadence_label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (household_id) REFERENCES learn_households(id),
  FOREIGN KEY (term_id) REFERENCES learn_terms(id)
);
CREATE TABLE learn_grace_mode_rules (
  id TEXT PRIMARY KEY,
  season_adjustment_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  preserve_church_rhythms INTEGER NOT NULL DEFAULT 1,
  preserve_morning_basket INTEGER NOT NULL DEFAULT 1,
  reduce_priority_threshold INTEGER NOT NULL DEFAULT 4,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (season_adjustment_id) REFERENCES learn_season_adjustments(id)
);
CREATE TABLE learn_household_lesson_blocks (
  id TEXT PRIMARY KEY,
  lesson_day_id TEXT NOT NULL,
  household_stream_id TEXT NOT NULL,
  status TEXT NOT NULL,
  minutes_planned INTEGER NOT NULL DEFAULT 0,
  minutes_actual INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (lesson_day_id) REFERENCES learn_lesson_days(id),
  FOREIGN KEY (household_stream_id) REFERENCES learn_household_streams(id)
);
CREATE TABLE learn_household_pace_profiles (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  title TEXT NOT NULL,
  pace_mode TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES learn_households(id)
);
CREATE TABLE learn_household_streams (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  stream_type TEXT NOT NULL,
  title TEXT NOT NULL,
  cadence_label TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES learn_households(id)
);
CREATE TABLE learn_households (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  household_size INTEGER NOT NULL DEFAULT 0,
  liturgical_calendar_type TEXT NOT NULL,
  pace_mode TEXT NOT NULL,
  grace_mode_active INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
, stripe_customer_id TEXT, stripe_customer_created_at TEXT, stripe_subscription_id TEXT, stripe_subscription_status TEXT, last_stripe_sync_at TEXT);
CREATE TABLE learn_hymn_studies (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  term_id TEXT NOT NULL,
  title TEXT NOT NULL,
  tone TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (household_id) REFERENCES learn_households(id),
  FOREIGN KEY (term_id) REFERENCES learn_terms(id)
);
CREATE TABLE learn_lesson_days (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  civil_date TEXT NOT NULL,
  calendar_type TEXT NOT NULL,
  liturgical_day_id TEXT,
  cycle_year_id TEXT,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES learn_households(id),
  FOREIGN KEY (liturgical_day_id) REFERENCES learn_liturgical_days(id)
);
CREATE TABLE learn_liturgical_days (
  id TEXT PRIMARY KEY,
  civil_date TEXT NOT NULL,
  calendar_type TEXT NOT NULL,
  feast_title TEXT NOT NULL,
  feast_rank TEXT NOT NULL,
  fasting_rule TEXT NOT NULL,
  tone TEXT NOT NULL,
  old_style_date_label TEXT NOT NULL,
  epistle_ref TEXT NOT NULL,
  gospel_ref TEXT NOT NULL,
  troparion_tone TEXT NOT NULL,
  kontakion_tone TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE learn_narration_logs (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL,
  lesson_day_id TEXT,
  narration_type TEXT NOT NULL,
  subject_title TEXT NOT NULL,
  source_title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  logged_at TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (child_id) REFERENCES learn_children(id),
  FOREIGN KEY (lesson_day_id) REFERENCES learn_lesson_days(id)
);
CREATE TABLE learn_nature_journal_entries (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL,
  observed_on TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT NOT NULL,
  notes TEXT NOT NULL,
  media_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (child_id) REFERENCES learn_children(id)
);
CREATE TABLE learn_print_jobs (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  template_id TEXT,
  status TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES learn_households(id),
  FOREIGN KEY (template_id) REFERENCES learn_print_templates(id)
);
CREATE TABLE learn_print_templates (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  title TEXT NOT NULL,
  template_type TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES learn_households(id)
);
CREATE TABLE learn_recitation_tracks (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  child_id TEXT,
  title TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  progress_percent INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'memorizing',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (household_id) REFERENCES learn_households(id),
  FOREIGN KEY (child_id) REFERENCES learn_children(id)
);
CREATE TABLE learn_report_cards (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  school_year_id TEXT NOT NULL,
  status TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES learn_households(id),
  FOREIGN KEY (child_id) REFERENCES learn_children(id),
  FOREIGN KEY (school_year_id) REFERENCES learn_school_years(id)
);
CREATE TABLE learn_report_exports (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  export_type TEXT NOT NULL,
  format TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  generated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (household_id) REFERENCES learn_households(id)
);
CREATE TABLE learn_rotations (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  term_id TEXT NOT NULL,
  rotation_type TEXT NOT NULL,
  title TEXT NOT NULL,
  current_selection TEXT NOT NULL,
  week_range_label TEXT NOT NULL,
  minutes_per_week INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (household_id) REFERENCES learn_households(id),
  FOREIGN KEY (term_id) REFERENCES learn_terms(id)
);
CREATE TABLE learn_school_years (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  label TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  current_term_id TEXT,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES learn_households(id)
);
CREATE TABLE learn_season_adjustments (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  pace_profile_id TEXT,
  title TEXT NOT NULL,
  adjustment_kind TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES learn_households(id),
  FOREIGN KEY (pace_profile_id) REFERENCES learn_household_pace_profiles(id)
);
CREATE TABLE learn_terms (
  id TEXT PRIMARY KEY,
  school_year_id TEXT NOT NULL,
  label TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  pace_mode TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (school_year_id) REFERENCES learn_school_years(id)
);
CREATE TABLE learn_test_scores (   id TEXT PRIMARY KEY,   household_id TEXT NOT NULL,   child_id TEXT NOT NULL,   test_type TEXT NOT NULL CHECK (test_type IN ('ACT', 'SAT')),   test_date TEXT,   composite_score REAL,         total_score REAL,              english_score REAL,          math_score REAL,               reading_score REAL,            science_score REAL,            writing_score REAL,           reading_writing_score REAL,    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,   updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,   FOREIGN KEY (household_id) REFERENCES learn_households(id) ON DELETE CASCADE,   FOREIGN KEY (child_id) REFERENCES learn_children(id) ON DELETE CASCADE );
CREATE TABLE learn_transcripts (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  status TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES learn_households(id),
  FOREIGN KEY (child_id) REFERENCES learn_children(id)
);
CREATE TABLE legal_acceptances (
  id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL,
  subject_user_id TEXT,
  organization_id TEXT,
  actor_name TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  terms_sha256 TEXT NOT NULL,
  disclosure_text TEXT NOT NULL,
  acceptance_source TEXT NOT NULL,
  transaction_reference TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  dispute_resolution_mode TEXT NOT NULL DEFAULT 'courts_no_mandatory_arbitration',
  created_at TEXT NOT NULL,
  FOREIGN KEY (terms_version) REFERENCES legal_terms_versions(version)
);
CREATE TABLE legal_terms_versions (
  version TEXT PRIMARY KEY,
  content_sha256 TEXT NOT NULL,
  snapshot_path TEXT NOT NULL,
  effective_for_new_users_at TEXT NOT NULL,
  effective_for_existing_users_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE manual_income_entries (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  entry_date TEXT NOT NULL,        -- date the income was received/deposited (YYYY-MM-DD)
  source TEXT NOT NULL,            -- 'cash_and_checks' | 'tithely' | 'paypal' | 'other'
  source_label TEXT,               -- free-text label, used when source = 'other'
  amount_cents INTEGER NOT NULL,
  fund_code TEXT,                  -- optional: which giving fund this counts toward
  notes TEXT,
  entered_by TEXT,                 -- email of the treasurer/admin who logged it
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
, contribution_eligible INTEGER NOT NULL DEFAULT 0, batch_reference TEXT);
CREATE TABLE membership_capabilities (
  id                    TEXT PRIMARY KEY,
  membership_id         TEXT NOT NULL,
  capability            TEXT NOT NULL,
  granted_by_user_id    TEXT,
  granted_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE membership_invitations (
  id                    TEXT PRIMARY KEY,
  parish_id             TEXT NOT NULL,
  email                 TEXT NOT NULL,
  role_template         TEXT,
  invited_capabilities  TEXT,
  invited_by_user_id    TEXT,
  invited_by_legacy_bearer INTEGER NOT NULL DEFAULT 0,
  token_hash            TEXT NOT NULL,
  token_salt            TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending',
  expires_at            TEXT NOT NULL,
  accepted_at           TEXT,
  accepted_by_user_id   TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE nonprofit_pricing_applications (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  registration_reference TEXT NOT NULL,
  stripe_account_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'collecting_information',
  policy_version TEXT NOT NULL,
  measurement_period_start TEXT,
  reported_donation_percent REAL,
  attestation_version TEXT,
  attested_by_name TEXT,
  attested_by_title TEXT,
  attested_by_email TEXT,
  attested_at TEXT,
  ein_last_four TEXT,
  confirms_registered_nonprofit INTEGER NOT NULL DEFAULT 0,
  confirms_over_80_percent INTEGER NOT NULL DEFAULT 0,
  confirms_tax_deductible_donations INTEGER NOT NULL DEFAULT 0,
  confirms_account_owner_submission INTEGER NOT NULL DEFAULT 0,
  stripe_support_case_id TEXT,
  submitted_at TEXT,
  stripe_decision TEXT,
  stripe_decision_at TEXT,
  stripe_effective_date TEXT,
  approved_card_rate_basis_points INTEGER,
  approved_card_fixed_fee_cents INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (parish_id, stripe_account_id)
);
CREATE TABLE nonprofit_pricing_audit_log (
  id TEXT PRIMARY KEY,
  application_id TEXT,
  parish_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_user_id TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE nonprofit_pricing_documents (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  sanitized_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  uploaded_by_type TEXT NOT NULL,
  uploaded_by_user_id TEXT,
  is_current INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  replaced_at TEXT,
  FOREIGN KEY (application_id) REFERENCES nonprofit_pricing_applications(id)
);
CREATE TABLE nonprofit_pricing_threshold_alerts (
  parish_id TEXT NOT NULL,
  risk_band TEXT NOT NULL,
  threshold_exposure_percent REAL NOT NULL,
  donation_percent REAL NOT NULL,
  notified_at TEXT NOT NULL,
  resolved_at TEXT,
  last_observed_at TEXT NOT NULL,
  PRIMARY KEY (parish_id, risk_band)
);
CREATE TABLE parish_announcement_digest_subscriptions (
  parish_id TEXT NOT NULL,
  donor_id TEXT NOT NULL,
  subscribed_at TEXT,
  unsubscribed_at TEXT,
  unsubscribe_token TEXT NOT NULL,
  last_digest_sent_at TEXT,
  PRIMARY KEY (parish_id, donor_id)
);
CREATE TABLE parish_announcements (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  published_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
, hero_image_url TEXT, category TEXT NOT NULL DEFAULT 'general'
  CHECK (category IN ('services', 'events', 'youth', 'outreach', 'education', 'general')));
CREATE TABLE parish_bulletins (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  title TEXT NOT NULL,
  service_date TEXT NOT NULL CHECK (date(service_date) IS NOT NULL AND service_date = date(service_date)),
  template TEXT NOT NULL DEFAULT 'heritage' CHECK (template IN ('heritage', 'quiet', 'folded')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  content_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE parish_bulletin_troparia (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'troparion' CHECK(kind IN ('troparion', 'kontakion', 'other')),
  title TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT '',
  text_body TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK(sort_order >= 0 AND sort_order <= 99),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE parish_availability_blackouts (
  id         TEXT NOT NULL PRIMARY KEY,
  parish_id  TEXT NOT NULL,
  date       TEXT NOT NULL,                 -- 'YYYY-MM-DD', parish-local
  reason     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
, priest_name TEXT, priest_email TEXT, end_date TEXT);
CREATE TABLE parish_availability_rules (
  id             TEXT    PRIMARY KEY,
  parish_id      TEXT    NOT NULL,
  sacrament_type TEXT    NOT NULL,          -- house_blessing | confession | home_visit
  day_of_week    INTEGER NOT NULL,          -- 0=Sunday..6=Saturday, parish-local
  start_time     TEXT    NOT NULL,          -- 'HH:MM' 24h, parish-local
  end_time       TEXT    NOT NULL,
  slot_minutes   INTEGER NOT NULL DEFAULT 30,
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
, priest_name TEXT, priest_email TEXT);
CREATE TABLE parish_blog_feeds (
  parish_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  source_url TEXT NOT NULL DEFAULT '',
  feed_url TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE parish_commerce_permissions (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  role TEXT NOT NULL,
  permissions_json TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(parish_id, user_email, role)
);
CREATE TABLE parish_commerce_receipt_sequences (
  parish_id TEXT NOT NULL,
  commerce_module TEXT NOT NULL DEFAULT 'bookstore',
  year INTEGER NOT NULL,
  next_number INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(parish_id, commerce_module, year)
);
CREATE TABLE "parish_content_reads" (
  parish_id TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('announcement', 'group_message', 'teaching', 'video')),
  content_id TEXT NOT NULL,
  donor_id TEXT NOT NULL,
  read_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (content_type, content_id, donor_id)
);
CREATE TABLE parish_data_closures (
  parish_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES parish_portability_jobs(id),
  state TEXT NOT NULL CHECK(state IN ('preparing', 'deleting', 'closed')),
  policy_version TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE parish_email_credentials (
  parish_id TEXT PRIMARY KEY,
  resend_api_key TEXT NOT NULL,
  configured_at TEXT NOT NULL DEFAULT (datetime('now')),
  configured_by TEXT NOT NULL
);
CREATE TABLE parish_feature_request_dismissals (
  parish_id TEXT NOT NULL,
  feature_id TEXT NOT NULL,
  dismissed_at TEXT NOT NULL,
  PRIMARY KEY (parish_id, feature_id)
);
CREATE TABLE parish_feature_requests (
  parish_id TEXT NOT NULL,
  feature_id TEXT NOT NULL,
  donor_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (parish_id, feature_id, donor_hash)
);
CREATE TABLE "parish_group_messages" (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  ministry_id TEXT NOT NULL REFERENCES directory_ministries(id),
  author_person_id TEXT NOT NULL REFERENCES directory_people(id),
  body TEXT,
  message_type TEXT NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'voice', 'image')),
  attachment_url TEXT,
  attachment_duration_seconds INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE parish_library_resources (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'parish_life'
    CHECK (category IN ('prayer_worship', 'faith_formation', 'newcomers', 'ministries', 'forms_policies', 'pastoral_letters', 'parish_life')),
  resource_type TEXT NOT NULL CHECK (resource_type IN ('link', 'pdf')),
  external_url TEXT,
  object_key TEXT,
  file_name TEXT,
  file_size INTEGER,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  published_at TEXT,
  expires_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (resource_type = 'link' AND external_url IS NOT NULL AND object_key IS NULL)
    OR (resource_type = 'pdf' AND external_url IS NULL)
  )
);
CREATE TABLE parish_library_settings (
  parish_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE parish_memberships (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL,
  parish_id             TEXT NOT NULL,
  role_template         TEXT,
  status                TEXT NOT NULL DEFAULT 'invited',
  invited_by_user_id    TEXT,
  invited_at            TEXT,
  accepted_at           TEXT,
  joined_at             TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE parish_portability_inventory_reviews (
  binding TEXT PRIMARY KEY,
  policy_version TEXT NOT NULL,
  reviewed_at INTEGER NOT NULL,
  evidence_sha256 TEXT NOT NULL
);
CREATE TABLE parish_portability_jobs (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('export', 'close')),
  status TEXT NOT NULL CHECK (status IN ('preparing', 'ready', 'deleting', 'active_data_deleted', 'failed', 'cancelled')),
  request_key TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  manifest_json TEXT,
  manifest_sha256 TEXT,
  archive_key TEXT,
  archive_sha256 TEXT,
  archive_bytes INTEGER,
  expires_at INTEGER NOT NULL,
  confirmed_at INTEGER,
  completed_at INTEGER,
  error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(parish_id, request_key)
);
CREATE TABLE parish_portability_leases (
  parish_id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE parish_portability_legacy_keys (
  object_key TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','stored','deleted')),
  updated_at INTEGER NOT NULL
);
CREATE TABLE parish_portability_objects (
  binding TEXT NOT NULL,
  object_key TEXT NOT NULL,
  parish_id TEXT NOT NULL,
  disposition TEXT NOT NULL DEFAULT 'delete' CHECK(disposition IN ('delete','financial','support')),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','stored','deleted')),
  etag TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(binding,object_key)
);
CREATE TABLE parish_portability_retention (
  job_id TEXT NOT NULL REFERENCES parish_portability_jobs(id),
  resource TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('financial','support','accounting')),
  retain_until INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('restricted','review_due','disposed')),
  evidence_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(job_id,resource)
);
CREATE TABLE parish_portability_steps (
  job_id TEXT NOT NULL REFERENCES parish_portability_jobs(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'completed')),
  result_json TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(job_id, step_key)
);
CREATE TABLE parish_portability_storage_operations (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  binding TEXT NOT NULL,
  object_key TEXT NOT NULL,
  operation TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  UNIQUE(binding,object_key)
);
CREATE TABLE parish_stewardship_settings (
  parish_id                   TEXT PRIMARY KEY,
  has_stewardship_suite        INTEGER NOT NULL DEFAULT 0,
  stripe_subscription_item_id  TEXT,
  fiscal_year_start_month      INTEGER NOT NULL DEFAULT 1,
  headcount_delegate_ministry_id TEXT,
  updated_at                   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE parish_weekly_headcounts (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  week_of TEXT NOT NULL CHECK (date(week_of) IS NOT NULL AND week_of = date(week_of) AND strftime('%w', week_of) = '0'),
  headcount INTEGER NOT NULL CHECK (headcount >= 0),
  submitted_by_actor_type TEXT NOT NULL CHECK (submitted_by_actor_type IN ('parish_staff', 'ministry_leader')),
  submitted_by_actor_id TEXT NOT NULL,
  submitted_by_ministry_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (submitted_by_actor_type = 'parish_staff' AND submitted_by_ministry_id IS NULL)
    OR
    (submitted_by_actor_type = 'ministry_leader' AND submitted_by_ministry_id IS NOT NULL AND length(trim(submitted_by_ministry_id)) > 0)
  ),
  UNIQUE (parish_id, week_of)
);
CREATE INDEX idx_parish_weekly_headcounts_trend
  ON parish_weekly_headcounts(parish_id, week_of);
CREATE TABLE parish_teaching_posts (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audio_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
, category TEXT NOT NULL DEFAULT 'homilies'
  CHECK (category IN ('homilies', 'catechism', 'liturgical', 'choir', 'special_events')), pinned INTEGER NOT NULL DEFAULT 0, audio_source TEXT NOT NULL DEFAULT 'upload'
  CHECK (audio_source IN ('upload', 'external')));
CREATE TABLE parish_video_posts (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  stream_video_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  published_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE parish_youtube_channels (
  parish_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  channel_url TEXT NOT NULL,
  channel_title TEXT NOT NULL DEFAULT '',
  added_by TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE parish_youtube_links (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  youtube_url TEXT NOT NULL,
  title TEXT,
  thumbnail_url TEXT,
  added_by TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
, pinned INTEGER NOT NULL DEFAULT 0);
CREATE TABLE platform_users (
  id                    TEXT PRIMARY KEY,
  email                 TEXT NOT NULL,
  display_name          TEXT,
  email_verified_at     TEXT,
  password_record       TEXT,
  session_token_hash    TEXT,
  session_salt          TEXT,
  session_expires_at    TEXT,
  status                TEXT NOT NULL DEFAULT 'active',
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
, session_mfa_verified_at TEXT);
CREATE TABLE privileged_mfa_profiles (
  principal_type              TEXT NOT NULL,
  principal_id                TEXT NOT NULL,
  totp_secret_ciphertext      TEXT,
  totp_secret_iv              TEXT,
  totp_confirmed_at           TEXT,
  recovery_code_hashes_json   TEXT NOT NULL DEFAULT '[]',
  recovery_codes_generated_at TEXT,
  required_at                 TEXT,
  created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (principal_type, principal_id)
);
CREATE TABLE privileged_mfa_transactions (
  id                   TEXT PRIMARY KEY,
  principal_type       TEXT NOT NULL,
  principal_id         TEXT NOT NULL,
  purpose              TEXT NOT NULL,
  token_hash           TEXT NOT NULL,
  token_salt           TEXT NOT NULL,
  webauthn_challenge   TEXT,
  selected_method      TEXT,
  metadata_json        TEXT NOT NULL DEFAULT '{}',
  attempts             INTEGER NOT NULL DEFAULT 0,
  expires_at           TEXT NOT NULL,
  consumed_at          TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE privileged_webauthn_credentials (
  credential_id          TEXT PRIMARY KEY,
  principal_type         TEXT NOT NULL,
  principal_id           TEXT NOT NULL,
  credential_public_key  TEXT NOT NULL,
  counter                INTEGER NOT NULL DEFAULT 0,
  transports_json        TEXT NOT NULL DEFAULT '[]',
  device_type            TEXT,
  backed_up               INTEGER NOT NULL DEFAULT 0,
  label                   TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at            TEXT
);
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  donor_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE registrations (   reference TEXT PRIMARY KEY,   parish_id TEXT,   status TEXT NOT NULL DEFAULT 'pending',   parish_name TEXT,   community_type TEXT,   stripe_account_id TEXT,   stripe_subscription_id TEXT,   received_at TEXT,   updated_at TEXT NOT NULL,   data TEXT NOT NULL , tax_exemption_status TEXT, tax_exemption_expiration_date TEXT, current_tax_exemption_id TEXT);
CREATE TABLE sacrament_baptism_details (   request_id                    TEXT PRIMARY KEY                                    REFERENCES sacrament_requests(id) ON DELETE CASCADE,   candidate_name                TEXT NOT NULL,   candidate_dob                 TEXT,   candidate_is_adult            INTEGER NOT NULL DEFAULT 0,   parent_names                  TEXT,   patron_saint                  TEXT,    godparent_1_name              TEXT,   godparent_1_home_parish       TEXT,   godparent_1_orthodox_attested INTEGER NOT NULL DEFAULT 0,    godparent_2_name              TEXT,   godparent_2_home_parish       TEXT,   godparent_2_orthodox_attested INTEGER NOT NULL DEFAULT 0 );
CREATE TABLE sacrament_requests (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  donor_email TEXT NOT NULL,
  sacrament_type TEXT NOT NULL,
  other_type_label TEXT,
  status TEXT NOT NULL DEFAULT 'requested',
  requested_date TEXT,
  requested_time_window TEXT,
  participant_names TEXT,
  location_type TEXT,
  location_address TEXT,
  notes TEXT,
  phone TEXT,
  confirmed_date TEXT,
  confirmed_time TEXT,
  clergy_assigned TEXT,
  parish_notes TEXT,
  decline_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE sacrament_wedding_details (   request_id                    TEXT PRIMARY KEY                                    REFERENCES sacrament_requests(id) ON DELETE CASCADE,   party_a_name                  TEXT NOT NULL,   party_a_orthodox              INTEGER NOT NULL DEFAULT 0,   party_a_prior_marriage        INTEGER NOT NULL DEFAULT 0,    party_b_name                  TEXT NOT NULL,   party_b_orthodox              INTEGER NOT NULL DEFAULT 0,   party_b_prior_marriage        INTEGER NOT NULL DEFAULT 0,    koumbaro_name                 TEXT,   koumbaro_home_parish          TEXT,    marriage_license_status       TEXT CHECK (marriage_license_status IN (                                    'not_started', 'applied', 'obtained'                                  )) DEFAULT 'not_started',   premarital_counsel_complete   INTEGER NOT NULL DEFAULT 0 );
CREATE TABLE settlement_profile_modules (
  parish_id TEXT NOT NULL,
  module_key TEXT NOT NULL,
  settlement_profile_id TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (parish_id, module_key),
  FOREIGN KEY (settlement_profile_id) REFERENCES settlement_profiles(id)
);
CREATE TABLE settlement_profiles (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  name TEXT NOT NULL,
  profile_type TEXT NOT NULL DEFAULT 'general_giving',
  stripe_account_id TEXT,
  stripe_external_account_id TEXT,
  payout_destination_label TEXT,
  accounting_category TEXT,
  is_default_giving INTEGER NOT NULL DEFAULT 0,
  is_default_commerce INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE sms_keywords (
    id               TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    parish_id        TEXT    NOT NULL,
    destination_type TEXT    NOT NULL DEFAULT 'fund',
    destination_id   TEXT    NOT NULL,
    fund_id          TEXT    NOT NULL DEFAULT '',
    label            TEXT    NOT NULL DEFAULT '',
    keyword          TEXT    NOT NULL,
    is_active        INTEGER NOT NULL DEFAULT 1,
    created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    CHECK (destination_type IN ('parish', 'fund', 'campaign', 'feast'))
);
CREATE TABLE stewardship_agenda_items (
  id               TEXT PRIMARY KEY,
  annual_meeting_id TEXT NOT NULL REFERENCES stewardship_annual_meetings(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  duration_minutes INTEGER,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE stewardship_annual_meetings (
  id                TEXT PRIMARY KEY,
  parish_id         TEXT NOT NULL,
  title             TEXT NOT NULL,
  fiscal_year       INTEGER NOT NULL,
  meeting_date      TEXT,
  meeting_time      TEXT,
  location          TEXT,
  parish_name_override TEXT,
  jurisdiction      TEXT,
  address           TEXT,
  status            TEXT NOT NULL DEFAULT 'draft',
  created_by        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
, signature_line_count INTEGER NOT NULL DEFAULT 24, note_line_count INTEGER NOT NULL DEFAULT 12);
CREATE TABLE stewardship_authoritative_financial_snapshots (
  id                            TEXT PRIMARY KEY,
  parish_id                     TEXT NOT NULL,
  fiscal_year                   INTEGER NOT NULL,
  title                         TEXT NOT NULL,
  agapay_contributions_cents    INTEGER NOT NULL DEFAULT 0,
  outside_contributions_cents   INTEGER NOT NULL DEFAULT 0,
  other_revenue_cents           INTEGER NOT NULL DEFAULT 0,
  total_income_cents            INTEGER NOT NULL DEFAULT 0,
  total_expense_cents           INTEGER NOT NULL DEFAULT 0,
  net_cents                     INTEGER NOT NULL DEFAULT 0,
  restricted_funds_json         TEXT NOT NULL DEFAULT '[]',
  notes                         TEXT,
  version                       INTEGER NOT NULL DEFAULT 1,
  created_by                    TEXT,
  updated_by                    TEXT,
  created_at                    TEXT NOT NULL,
  updated_at                    TEXT NOT NULL, external_assets_json TEXT NOT NULL DEFAULT '[]', restricted_fund_adjustments_json TEXT NOT NULL DEFAULT '[]', restricted_fund_balances_json TEXT NOT NULL DEFAULT '[]',
  UNIQUE (parish_id, fiscal_year)
);
CREATE TABLE stewardship_financial_snapshot_revisions (
  id                            TEXT PRIMARY KEY,
  snapshot_id                   TEXT NOT NULL REFERENCES stewardship_authoritative_financial_snapshots(id) ON DELETE CASCADE,
  parish_id                     TEXT NOT NULL,
  fiscal_year                   INTEGER NOT NULL,
  version                       INTEGER NOT NULL,
  title                         TEXT NOT NULL,
  agapay_contributions_cents    INTEGER NOT NULL DEFAULT 0,
  outside_contributions_cents   INTEGER NOT NULL DEFAULT 0,
  other_revenue_cents           INTEGER NOT NULL DEFAULT 0,
  total_income_cents            INTEGER NOT NULL DEFAULT 0,
  total_expense_cents           INTEGER NOT NULL DEFAULT 0,
  net_cents                     INTEGER NOT NULL DEFAULT 0,
  restricted_funds_json         TEXT NOT NULL DEFAULT '[]',
  notes                         TEXT,
  changed_by                    TEXT,
  created_at                    TEXT NOT NULL, external_assets_json TEXT NOT NULL DEFAULT '[]', restricted_fund_adjustments_json TEXT NOT NULL DEFAULT '[]', restricted_fund_balances_json TEXT NOT NULL DEFAULT '[]',
  UNIQUE (snapshot_id, version)
);
CREATE TABLE stewardship_financial_summaries (
  id               TEXT PRIMARY KEY,
  annual_meeting_id TEXT NOT NULL UNIQUE REFERENCES stewardship_annual_meetings(id) ON DELETE CASCADE,
  total_income_cents     INTEGER NOT NULL DEFAULT 0,
  total_expense_cents    INTEGER NOT NULL DEFAULT 0,
  net_cents              INTEGER NOT NULL DEFAULT 0,
  notes                  TEXT,
  snapshot_taken_at      TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
, imported_from_accounting_at TEXT);
CREATE TABLE stewardship_generated_packets (
  id               TEXT PRIMARY KEY,
  annual_meeting_id TEXT NOT NULL REFERENCES stewardship_annual_meetings(id) ON DELETE CASCADE,
  generated_by     TEXT,
  storage_key      TEXT,
  generated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE stewardship_nominees (
  id               TEXT PRIMARY KEY,
  annual_meeting_id TEXT NOT NULL REFERENCES stewardship_annual_meetings(id) ON DELETE CASCADE,
  full_name        TEXT NOT NULL,
  position         TEXT,
  bio              TEXT,
  nominated_by     TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE stewardship_reports (
  id               TEXT PRIMARY KEY,
  annual_meeting_id TEXT NOT NULL REFERENCES stewardship_annual_meetings(id) ON DELETE CASCADE,
  report_type      TEXT NOT NULL,
  title            TEXT NOT NULL,
  body             TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
, created_by TEXT);
CREATE TABLE stewardship_resolutions (
  id               TEXT PRIMARY KEY,
  annual_meeting_id TEXT NOT NULL REFERENCES stewardship_annual_meetings(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  body             TEXT,
  resolved_text    TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE stewardship_restricted_fund_snapshots (
  id               TEXT PRIMARY KEY,
  annual_meeting_id TEXT NOT NULL REFERENCES stewardship_annual_meetings(id) ON DELETE CASCADE,
  fund_name        TEXT NOT NULL,
  beginning_balance_cents  INTEGER NOT NULL DEFAULT 0,
  total_received_cents     INTEGER NOT NULL DEFAULT 0,
  total_disbursed_cents    INTEGER NOT NULL DEFAULT 0,
  ending_balance_cents     INTEGER NOT NULL DEFAULT 0,
  notes            TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE stripe_events (   id TEXT PRIMARY KEY,   received_at TEXT NOT NULL , event_type TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'processed', processed_at TEXT DEFAULT '', error_message TEXT DEFAULT '');
CREATE TABLE stripe_payment_volume_records (
  stripe_account_id TEXT NOT NULL,
  stripe_charge_id TEXT NOT NULL,
  parish_id TEXT NOT NULL,
  payment_class TEXT NOT NULL,
  classification_source TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  gross_cents INTEGER NOT NULL DEFAULT 0,
  refunded_cents INTEGER NOT NULL DEFAULT 0,
  net_cents INTEGER NOT NULL DEFAULT 0,
  charge_status TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (stripe_account_id, stripe_charge_id)
);
CREATE TABLE stripe_payment_volume_scans (
  parish_id TEXT NOT NULL,
  stripe_account_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  starting_after TEXT NOT NULL DEFAULT '',
  scanned_count INTEGER NOT NULL DEFAULT 0,
  pass_started_at TEXT NOT NULL,
  last_completed_at TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (parish_id, period_start)
);
CREATE TABLE subscription_early_adopter_slots (
  slot INTEGER PRIMARY KEY CHECK (slot BETWEEN 1 AND 20),
  registration_reference TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'active', 'retired')),
  reserved_at TEXT,
  activated_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE tax_exemption_audit_log (   id TEXT PRIMARY KEY,   tax_exemption_id TEXT,   document_id TEXT,   registration_reference TEXT NOT NULL,   action TEXT NOT NULL,   actor_type TEXT NOT NULL,   actor_user_id TEXT,   metadata_json TEXT,   created_at TEXT NOT NULL DEFAULT (datetime('now')) );
CREATE TABLE tax_exemption_documents (   id TEXT PRIMARY KEY,   tax_exemption_id TEXT NOT NULL,   registration_reference TEXT NOT NULL,    storage_key TEXT NOT NULL UNIQUE,   original_filename TEXT NOT NULL,   sanitized_filename TEXT NOT NULL,   mime_type TEXT NOT NULL,   file_size INTEGER NOT NULL,   sha256 TEXT NOT NULL,    uploaded_by_user_id TEXT,   uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),   is_current INTEGER NOT NULL DEFAULT 1,   replaces_document_id TEXT,   archived_at TEXT,   deleted_at TEXT,    FOREIGN KEY (tax_exemption_id) REFERENCES tax_exemptions(id),   FOREIGN KEY (registration_reference) REFERENCES registrations(reference),   FOREIGN KEY (replaces_document_id) REFERENCES tax_exemption_documents(id) );
CREATE TABLE tax_exemption_notes (   id TEXT PRIMARY KEY,   tax_exemption_id TEXT NOT NULL,   actor_user_id TEXT NOT NULL,   note TEXT NOT NULL,   created_at TEXT NOT NULL DEFAULT (datetime('now')),   FOREIGN KEY (tax_exemption_id) REFERENCES tax_exemptions(id) );
CREATE TABLE tax_exemption_stripe_syncs (   id TEXT PRIMARY KEY,   tax_exemption_id TEXT NOT NULL,   registration_reference TEXT NOT NULL,   stripe_customer_id TEXT NOT NULL,   customer_role TEXT NOT NULL,    desired_tax_exempt_status TEXT NOT NULL,   previous_tax_exempt_status TEXT,   agapay_owned_change INTEGER NOT NULL DEFAULT 1,    sync_status TEXT NOT NULL DEFAULT 'not_started',   stripe_request_id TEXT,   idempotency_key TEXT,   last_error TEXT,   attempt_count INTEGER NOT NULL DEFAULT 0,   attempted_at TEXT,   synced_at TEXT,    created_at TEXT NOT NULL DEFAULT (datetime('now')),   updated_at TEXT NOT NULL DEFAULT (datetime('now')),    FOREIGN KEY (tax_exemption_id) REFERENCES tax_exemptions(id),   FOREIGN KEY (registration_reference) REFERENCES registrations(reference),   UNIQUE (tax_exemption_id, stripe_customer_id) );
CREATE TABLE tax_exemptions (   id TEXT PRIMARY KEY,   registration_reference TEXT NOT NULL,   parish_id TEXT,    jurisdiction TEXT NOT NULL,   exemption_type TEXT NOT NULL,   certificate_number TEXT,   effective_date TEXT,   expiration_date TEXT,    status TEXT NOT NULL DEFAULT 'pending',   internal_review_status TEXT,    authorized_representative_name TEXT NOT NULL,   authorized_representative_title TEXT NOT NULL,   certified_at TEXT NOT NULL,    approved_at TEXT,   approved_by TEXT,    rejected_at TEXT,   rejected_by TEXT,   rejection_reason TEXT,    replacement_requested_at TEXT,   replacement_requested_by TEXT,   replacement_reason TEXT,   keep_active_during_replacement INTEGER NOT NULL DEFAULT 0,    revoked_at TEXT,   revoked_by TEXT,   revocation_reason TEXT,    supersedes_tax_exemption_id TEXT,    created_at TEXT NOT NULL DEFAULT (datetime('now')),   updated_at TEXT NOT NULL DEFAULT (datetime('now')), upload_token_hash TEXT, upload_token_expires_at TEXT,    FOREIGN KEY (registration_reference) REFERENCES registrations(reference),   FOREIGN KEY (supersedes_tax_exemption_id) REFERENCES tax_exemptions(id) );
CREATE INDEX donor_custom_news_feeds_donor_idx
  ON donor_custom_news_feeds (donor_id, created_at DESC);
CREATE INDEX idx_academic_years_household_id
  ON academic_years(household_id);
CREATE INDEX idx_account_deletion_requests_email_status
  ON account_deletion_requests (donor_email, status, requested_at DESC);
CREATE INDEX idx_accounting_alert_delivery_scan
  ON accounting_integrity_alert_deliveries(parish_id, scan_id, attempted_at);
CREATE UNIQUE INDEX idx_accounting_databases_entity_environment
  ON accounting_databases(accounting_entity_id, environment);
CREATE UNIQUE INDEX idx_accounting_databases_identifier
  ON accounting_databases(environment, database_identifier);
CREATE INDEX idx_accounting_databases_status
  ON accounting_databases(environment, provisioning_status, health_status);
CREATE UNIQUE INDEX idx_accounting_entities_parish_id
  ON accounting_entities(parish_id);
CREATE INDEX idx_accounting_entities_status
  ON accounting_entities(entity_status, activation_status);
CREATE INDEX idx_accounting_lifecycle_events_database
  ON accounting_lifecycle_events(accounting_database_id, created_at);
CREATE INDEX idx_accounting_lifecycle_events_entity
  ON accounting_lifecycle_events(accounting_entity_id, created_at);
CREATE INDEX idx_accounting_lifecycle_events_type
  ON accounting_lifecycle_events(event_type);
CREATE UNIQUE INDEX idx_accounting_provisioning_idempotency
  ON accounting_provisioning_operations(accounting_entity_id, environment, idempotency_key);
CREATE INDEX idx_accounting_provisioning_status
  ON accounting_provisioning_operations(status, lease_expires_at);
CREATE INDEX idx_accounting_release_requests_pending
  ON accounting_integrity_release_requests(status, parish_id, requested_at);
CREATE INDEX idx_accounting_schema_versions_status
  ON accounting_schema_versions(status);
CREATE UNIQUE INDEX idx_accounting_schema_versions_unique
  ON accounting_schema_versions(schema_version, migration_version);
CREATE INDEX idx_accounting_staff_profiles_parish ON accounting_staff_profiles(parish_id,status,display_name);
CREATE INDEX idx_accounting_staff_sessions_lookup ON accounting_staff_sessions(profile_id,parish_id,revoked_at,expires_at);
CREATE INDEX idx_audit_log_action   ON audit_log(action);
CREATE INDEX idx_audit_log_actor   ON audit_log(actor_user_id);
CREATE INDEX idx_audit_log_created_at   ON audit_log(created_at);
CREATE INDEX idx_audit_log_organization   ON audit_log(organization_id);
CREATE INDEX idx_audit_log_target   ON audit_log(target_type, target_id);
CREATE INDEX idx_commemorations_donor_email_created_at ON commemorations(donor_email, created_at);
CREATE INDEX idx_commemorations_parish_id_created_at ON commemorations(parish_id, created_at);
CREATE INDEX idx_commemorations_source_id ON commemorations(source_id);
CREATE UNIQUE INDEX idx_commerce_barcodes_unique ON commerce_product_barcodes(parish_id, barcode);
CREATE INDEX idx_commerce_barcodes_variant ON commerce_product_barcodes(parish_id, variant_id);
CREATE INDEX idx_commerce_checkout_sessions_parish ON commerce_checkout_sessions(parish_id, commerce_module, status, created_at DESC);
CREATE INDEX idx_commerce_checkout_sessions_user ON commerce_checkout_sessions(user_email, status, created_at DESC);
CREATE INDEX idx_commerce_inventory_balances_sku ON commerce_inventory_balances(parish_id, sku, location_id);
CREATE UNIQUE INDEX idx_commerce_inventory_count_sessions_open
  ON commerce_inventory_count_sessions(parish_id)
  WHERE status = 'draft';
CREATE INDEX idx_commerce_inventory_count_sessions_parish
  ON commerce_inventory_count_sessions(parish_id, started_at DESC);
CREATE INDEX idx_commerce_inventory_movements_count_session
  ON commerce_inventory_movements(parish_id, count_session_id, created_at, id);
CREATE INDEX idx_commerce_inventory_movements_sku ON commerce_inventory_movements(parish_id, sku, created_at DESC);
CREATE INDEX idx_commerce_inventory_movements_variant ON commerce_inventory_movements(parish_id, commerce_module, variant_id, created_at DESC);
CREATE INDEX idx_commerce_order_items_module ON commerce_order_items(parish_id, commerce_module, created_at DESC);
CREATE INDEX idx_commerce_order_items_order ON commerce_order_items(order_id, created_at);
CREATE INDEX idx_commerce_order_items_sku ON commerce_order_items(parish_id, sku, created_at DESC);
CREATE INDEX idx_commerce_order_items_variant ON commerce_order_items(parish_id, variant_id, created_at DESC);
CREATE UNIQUE INDEX idx_commerce_orders_checkout ON commerce_orders(checkout_session_id);
CREATE INDEX idx_commerce_orders_donor ON commerce_orders(donor_email, created_at DESC);
CREATE INDEX idx_commerce_orders_events_kind
  ON commerce_orders(parish_id, item_category, payment_status, completed_at)
  WHERE commerce_module = 'events';
CREATE INDEX idx_commerce_orders_fulfillment ON commerce_orders(parish_id, commerce_module, fulfillment_status, created_at DESC);
CREATE UNIQUE INDEX idx_commerce_orders_order_number ON commerce_orders(parish_id, order_number) WHERE order_number IS NOT NULL AND order_number <> '';
CREATE INDEX idx_commerce_orders_parish ON commerce_orders(parish_id, commerce_module, status, created_at DESC);
CREATE INDEX idx_commerce_orders_product ON commerce_orders(parish_id, product_id, variant_id, created_at DESC);
CREATE INDEX idx_commerce_orders_settlement_profile ON commerce_orders(settlement_profile_id);
CREATE INDEX idx_commerce_orders_sku ON commerce_orders(parish_id, product_sku, created_at DESC);
CREATE INDEX idx_commerce_products_calendar
  ON commerce_products(parish_id, status, show_on_calendar, event_date);
CREATE UNIQUE INDEX idx_commerce_products_default_sku ON commerce_products(parish_id, default_sku) WHERE default_sku IS NOT NULL AND default_sku <> '';
CREATE INDEX idx_commerce_products_event_date
  ON commerce_products(parish_id, commerce_module, event_date)
  WHERE commerce_module = 'events';
CREATE INDEX idx_commerce_products_events_kind
  ON commerce_products(parish_id, item_category, status, event_date)
  WHERE commerce_module = 'events';
CREATE INDEX idx_commerce_products_ministry
  ON commerce_products(parish_id, commerce_module, ministry_id)
  WHERE commerce_module = 'events' AND ministry_id IS NOT NULL;
CREATE INDEX idx_commerce_products_parish ON commerce_products(parish_id, commerce_module, status, name);
CREATE INDEX idx_commerce_registered_devices_parish ON commerce_registered_devices(parish_id, commerce_module, status, friendly_name);
CREATE INDEX idx_commerce_variants_parish ON commerce_product_variants(parish_id, commerce_module, status, sku);
CREATE INDEX idx_commerce_variants_product ON commerce_product_variants(product_id, status);
CREATE UNIQUE INDEX idx_commerce_variants_sku ON commerce_product_variants(parish_id, sku) WHERE sku IS NOT NULL AND sku <> '';
CREATE UNIQUE INDEX idx_commerce_weekly_reports_key ON commerce_weekly_reports(parish_id, report_key);
CREATE INDEX idx_consumer_passkey_transactions_expiry
  ON consumer_passkey_transactions(expires_at, consumed_at);
CREATE INDEX idx_consumer_webauthn_account
  ON consumer_webauthn_credentials(account_id, created_at);
CREATE INDEX idx_courses_household_child_year
  ON courses(household_id, child_id, academic_year_id);
CREATE INDEX idx_courses_transcript_grouping
  ON courses(child_id, grade_level, subject_category);
CREATE INDEX idx_digest_active_subscriptions
  ON parish_announcement_digest_subscriptions(parish_id, unsubscribed_at, subscribed_at);
CREATE UNIQUE INDEX idx_digest_unsubscribe_token
  ON parish_announcement_digest_subscriptions(unsubscribe_token);
CREATE INDEX idx_directory_addresses_owner
  ON directory_addresses(owner_type, owner_id, active);
CREATE INDEX idx_directory_addresses_parish
  ON directory_addresses(parish_id, active, protected_address);
CREATE INDEX idx_directory_change_requests_parish_status
  ON directory_change_requests(parish_id, status, created_at);
CREATE INDEX idx_directory_change_requests_requester
  ON directory_change_requests(requester_person_id, status);
CREATE INDEX idx_directory_change_requests_target
  ON directory_change_requests(parish_id, target_type, target_id, status);
CREATE INDEX idx_directory_child_pub_requests_child
  ON directory_child_publication_requests(parish_id, child_person_id, status);
CREATE INDEX idx_directory_child_pub_requests_household
  ON directory_child_publication_requests(parish_id, household_id, status);
CREATE INDEX idx_directory_child_pub_requests_review
  ON directory_child_publication_requests(parish_id, status, created_at);
CREATE UNIQUE INDEX idx_directory_claims_active_claimant_invitation
  ON directory_claims(claimant_user_id, invitation_id)
  WHERE status IN ('pending', 'requires_review');
CREATE INDEX idx_directory_claims_claimant
  ON directory_claims(claimant_user_id, status);
CREATE INDEX idx_directory_claims_invitation
  ON directory_claims(invitation_id);
CREATE INDEX idx_directory_claims_parish_status
  ON directory_claims(parish_id, status);
CREATE INDEX idx_directory_claims_person
  ON directory_claims(requested_person_id, status);
CREATE INDEX idx_directory_claims_review_queue
  ON directory_claims(parish_id, submitted_at)
  WHERE status = 'requires_review';
CREATE INDEX idx_directory_contact_methods_owner
  ON directory_contact_methods(owner_type, owner_id, contact_type, active);
CREATE INDEX idx_directory_contact_methods_parish
  ON directory_contact_methods(parish_id, contact_type, active);
CREATE INDEX idx_directory_duplicate_candidates_pair
  ON directory_duplicate_candidates(parish_id, entity_type, left_entity_id, right_entity_id);
CREATE INDEX idx_directory_duplicate_candidates_queue
  ON directory_duplicate_candidates(parish_id, candidate_status, confidence_band, updated_at);
CREATE INDEX idx_directory_field_privacy_owner
  ON directory_field_privacy_preferences(parish_id, owner_type, owner_id, active);
CREATE INDEX idx_directory_household_admins_household
  ON directory_household_admins(household_id, active);
CREATE INDEX idx_directory_household_admins_person
  ON directory_household_admins(person_id, active);
CREATE INDEX idx_directory_household_invitations_household
  ON directory_household_invitations(household_id, person_id, status);
CREATE INDEX idx_directory_household_invitations_token
  ON directory_household_invitations(token);
CREATE INDEX idx_directory_household_members_household
  ON directory_household_members(household_id, active);
CREATE INDEX idx_directory_household_members_person
  ON directory_household_members(person_id, active);
CREATE INDEX idx_directory_household_namedays_household
  ON directory_household_namedays(parish_id, household_id, active, feast_month_day);
CREATE INDEX idx_directory_household_namedays_today
  ON directory_household_namedays(parish_id, feast_month_day, visibility, active);
CREATE INDEX idx_directory_household_verifications_status
  ON directory_household_verifications(parish_id, verification_status, verification_due_at);
CREATE INDEX idx_directory_households_anniversary
  ON directory_households(parish_id, anniversary_date, active);
CREATE INDEX idx_directory_households_parish
  ON directory_households(parish_id, active);
CREATE INDEX idx_directory_import_batches_parish ON directory_import_batches(parish_id, created_at);
CREATE INDEX idx_directory_import_rows_pending ON directory_import_rows(batch_id, status, email_status);
CREATE INDEX idx_directory_internal_notes_target
  ON directory_internal_notes(parish_id, target_type, target_id, archived_at, created_at);
CREATE UNIQUE INDEX idx_directory_invitations_active_person_purpose
  ON directory_invitations(intended_person_id, invitation_type)
  WHERE status IN ('pending', 'sent', 'opened', 'accepted');
CREATE INDEX idx_directory_invitations_expiry
  ON directory_invitations(status, expires_at);
CREATE INDEX idx_directory_invitations_household
  ON directory_invitations(intended_household_id, status);
CREATE INDEX idx_directory_invitations_parish_status
  ON directory_invitations(parish_id, status);
CREATE INDEX idx_directory_invitations_person
  ON directory_invitations(intended_person_id, status);
CREATE UNIQUE INDEX idx_directory_invitations_token_hash
  ON directory_invitations(token_hash);
CREATE INDEX idx_directory_media_assets_hash
  ON directory_media_assets(content_hash);
CREATE INDEX idx_directory_media_assets_owner
  ON directory_media_assets(parish_id, owner_type, owner_id, media_purpose, lifecycle_status);
CREATE INDEX idx_directory_media_assets_processing_status
  ON directory_media_assets(processing_status, updated_at);
CREATE INDEX idx_directory_media_assets_review
  ON directory_media_assets(parish_id, lifecycle_status, created_at);
CREATE INDEX idx_directory_media_assignments_owner
  ON directory_media_assignments(parish_id, owner_type, owner_id, media_purpose, assignment_status);
CREATE INDEX idx_directory_media_upload_sessions_expiry
  ON directory_media_upload_sessions(status, expires_at);
CREATE INDEX idx_directory_media_upload_sessions_user
  ON directory_media_upload_sessions(created_by_user_id, status, expires_at);
CREATE INDEX idx_directory_media_variants_asset
  ON directory_media_variants(media_asset_id, ready);
CREATE INDEX idx_directory_media_variants_secure_status
  ON directory_media_variants(secure_transform_status, pipeline_version);
CREATE INDEX idx_directory_merge_aliases_survivor
  ON directory_merge_aliases(parish_id, entity_type, survivor_entity_id, active);
CREATE INDEX idx_directory_merge_events_candidate
  ON directory_merge_events(candidate_id);
CREATE INDEX idx_directory_ministries_parish_status
  ON directory_ministries(parish_id, status, visibility, display_order, display_name);
CREATE INDEX idx_directory_ministry_interest_person
  ON directory_ministry_interest_requests(parish_id, person_id, status);
CREATE INDEX idx_directory_ministry_interest_queue
  ON directory_ministry_interest_requests(parish_id, status, submitted_at);
CREATE INDEX idx_directory_ministry_leaders_person
  ON directory_ministry_leaders(parish_id, person_id, active);
CREATE INDEX idx_directory_ministry_participants_ministry
  ON directory_ministry_participants(parish_id, ministry_id, status, approved_publication);
CREATE INDEX idx_directory_ministry_participants_person
  ON directory_ministry_participants(parish_id, person_id, status);
CREATE INDEX idx_directory_notification_events_parish
  ON directory_notification_events(parish_id, event_type, created_at);
CREATE INDEX idx_directory_notification_events_recipient
  ON directory_notification_events(recipient_user_id, created_at);
CREATE INDEX idx_directory_parish_affiliations_parish
  ON directory_parish_affiliations(parish_id, active, status);
CREATE INDEX idx_directory_parish_affiliations_person
  ON directory_parish_affiliations(person_id, active);
CREATE INDEX idx_directory_people_active
  ON directory_people(active);
CREATE INDEX idx_directory_people_created_by_parish
  ON directory_people(created_by_parish_id);
CREATE INDEX idx_directory_person_links_person
  ON directory_person_links(person_id, active);
CREATE INDEX idx_directory_person_links_type
  ON directory_person_links(link_type, external_id);
CREATE INDEX idx_directory_person_privacy_flags_person
  ON directory_person_privacy_flags(person_id, parish_id, active);
CREATE INDEX idx_directory_person_skill_search
  ON directory_person_skill_listings(parish_id, status, visibility, skill_id, person_id);
CREATE INDEX idx_directory_publication_profiles_owner
  ON directory_publication_profiles(parish_id, owner_type, owner_id, active);
CREATE INDEX idx_directory_publication_profiles_status
  ON directory_publication_profiles(parish_id, status, active);
CREATE INDEX idx_directory_review_correspondence_source
  ON directory_review_correspondence(parish_id, source_type, source_id, created_at);
CREATE INDEX idx_directory_review_metadata_assignee
  ON directory_review_metadata(parish_id, assigned_to_user_id, queue_status);
CREATE INDEX idx_directory_review_metadata_parish
  ON directory_review_metadata(parish_id, queue_status, priority, updated_at);
CREATE INDEX idx_directory_skill_catalog_scope
  ON directory_skill_catalog(parish_id, is_active, category, sort_order, name);
CREATE INDEX idx_donor_notifications_email   ON donor_notifications(donor_email, dismissed_at, sent_at DESC);
CREATE INDEX idx_donor_notifications_parish   ON donor_notifications(parish_id, fiscal_year, sent_at DESC);
CREATE INDEX idx_donor_offerings_checkout_session_id ON donor_offerings(checkout_session_id);
CREATE INDEX idx_donor_offerings_donor_email_created_at ON donor_offerings(donor_email, created_at);
CREATE INDEX idx_donor_offerings_parish_id_created_at ON donor_offerings(parish_id, created_at);
CREATE INDEX idx_donor_offerings_payment_intent_id ON donor_offerings(payment_intent_id);
CREATE INDEX idx_donor_offerings_settlement_profile ON donor_offerings(settlement_profile_id);
CREATE INDEX idx_donor_offerings_stripe_subscription_id ON donor_offerings(stripe_subscription_id);
CREATE INDEX idx_donor_podcast_progress_recent
  ON donor_podcast_progress(donor_id, updated_at DESC);
CREATE INDEX idx_donor_podcast_subscriptions_recent
  ON donor_podcast_subscriptions(donor_id, updated_at DESC);
CREATE INDEX idx_donors_default_parish_id ON donors(default_parish_id);
CREATE INDEX idx_giving_funds_parish ON giving_funds(parish_id);
CREATE INDEX idx_giving_statement_jobs_parish
  ON giving_statement_jobs(parish_id, fiscal_year DESC, created_at DESC);
CREATE INDEX idx_giving_statements_donor_year
  ON giving_statements(donor_email, fiscal_year);
CREATE INDEX idx_giving_statements_parish_year
  ON giving_statements(parish_id, fiscal_year);
CREATE INDEX idx_grades_and_progress_course_term
  ON grades_and_progress(course_id, term_index);
CREATE INDEX idx_household_pledges_parish_year   ON household_pledges(parish_id, fiscal_year);
CREATE INDEX idx_koinonia_community_tool_views_person
  ON koinonia_community_tool_views(parish_id, person_id, tool, last_opened_at);
CREATE INDEX idx_koinonia_exchange_listings_parish_status
  ON koinonia_exchange_listings(parish_id, status, listing_type, category, updated_at DESC);
CREATE INDEX idx_koinonia_exchange_listings_poster
  ON koinonia_exchange_listings(parish_id, posted_by_person_id, status);
CREATE INDEX idx_koinonia_exchange_messages_thread
  ON koinonia_exchange_messages(thread_id, created_at);
CREATE INDEX idx_koinonia_exchange_photos_listing
  ON koinonia_exchange_photos(listing_id, display_order);
CREATE INDEX idx_koinonia_exchange_threads_listing
  ON koinonia_exchange_threads(listing_id, status);
CREATE INDEX idx_koinonia_exchange_threads_requester
  ON koinonia_exchange_threads(parish_id, requester_person_id, status);
CREATE INDEX idx_koinonia_ministry_events_upcoming ON koinonia_ministry_events(parish_id,ministry_id,starts_at);
CREATE INDEX idx_koinonia_ministry_resources ON koinonia_ministry_resources(parish_id,ministry_id,updated_at DESC);
CREATE INDEX idx_koinonia_prayer_acknowledgements_request
  ON koinonia_prayer_acknowledgements(parish_id, request_id, created_at DESC);
CREATE INDEX idx_koinonia_prayer_activity_request
  ON koinonia_prayer_activity(parish_id, request_id, created_at DESC);
CREATE INDEX idx_koinonia_prayer_reports_queue
  ON koinonia_prayer_reports(parish_id, resolved_at, created_at DESC);
CREATE INDEX idx_koinonia_prayer_requests_expiry
  ON koinonia_prayer_requests(parish_id, status, expires_at);
CREATE INDEX idx_koinonia_prayer_requests_parish_status
  ON koinonia_prayer_requests(parish_id, status, visibility, created_at DESC);
CREATE INDEX idx_koinonia_prayer_requests_submitter
  ON koinonia_prayer_requests(parish_id, submitted_by_person_id, created_at DESC);
CREATE INDEX idx_koinonia_signup_activity ON koinonia_signup_activity(parish_id,sheet_id,created_at DESC);
CREATE INDEX idx_koinonia_signup_entries_person
  ON koinonia_signup_entries(parish_id, person_id, status);
CREATE INDEX idx_koinonia_signup_entries_slot
  ON koinonia_signup_entries(slot_id, status);
CREATE INDEX idx_koinonia_signup_sheets_ministry
  ON koinonia_signup_sheets(ministry_id, status);
CREATE INDEX idx_koinonia_signup_sheets_parish_published
  ON koinonia_signup_sheets(parish_id, status, published_at DESC);
CREATE INDEX idx_koinonia_signup_sheets_parish_status
  ON koinonia_signup_sheets(parish_id, status, visibility, updated_at DESC);
CREATE INDEX idx_koinonia_signup_slots_sheet
  ON koinonia_signup_slots(sheet_id, display_order, slot_date);
CREATE INDEX idx_learn_attendance_child_year
  ON learn_attendance_days (child_id, academic_year_id);
CREATE INDEX idx_learn_attendance_household_year_date
  ON learn_attendance_days (household_id, academic_year_id, attendance_date);
CREATE INDEX idx_learn_book_assignments_book_id ON learn_book_assignments(book_id);
CREATE INDEX idx_learn_books_household_id ON learn_books(household_id);
CREATE INDEX idx_learn_child_blocks_day_id ON learn_child_lesson_blocks(lesson_day_id);
CREATE INDEX idx_learn_child_tracks_child_id ON learn_child_tracks(child_id);
CREATE INDEX idx_learn_children_household_id ON learn_children(household_id);
CREATE INDEX idx_learn_church_rhythm_day_id ON learn_church_rhythm_practices(lesson_day_id);
CREATE INDEX idx_learn_co_op_members_co_op_id
  ON learn_co_op_members(co_op_id);
CREATE INDEX idx_learn_curriculum_mappings_package_id
  ON learn_curriculum_mappings(curriculum_package_id, mapping_scope, target_id);
CREATE INDEX idx_learn_curriculum_packages_household_id ON learn_curriculum_packages(household_id);
CREATE INDEX idx_learn_curriculum_resources_package_id
  ON learn_curriculum_resources(curriculum_package_id);
CREATE INDEX idx_learn_curriculum_subjects_package_id
  ON learn_curriculum_subjects(curriculum_package_id, sort_order);
CREATE INDEX idx_learn_cycle_topics_cycle_year_id ON learn_cycle_topics(cycle_year_id);
CREATE INDEX idx_learn_cycle_years_framework_id ON learn_cycle_years(cycle_framework_id);
CREATE INDEX idx_learn_grace_mode_rules_adjustment_id
  ON learn_grace_mode_rules(season_adjustment_id);
CREATE INDEX idx_learn_household_blocks_day_id ON learn_household_lesson_blocks(lesson_day_id);
CREATE INDEX idx_learn_household_streams_household_id ON learn_household_streams(household_id);
CREATE INDEX idx_learn_households_stripe_subscription_id ON learn_households(stripe_subscription_id);
CREATE INDEX idx_learn_lesson_days_household_id ON learn_lesson_days(household_id, civil_date);
CREATE UNIQUE INDEX idx_learn_liturgical_days_unique_date
  ON learn_liturgical_days(civil_date, calendar_type);
CREATE INDEX idx_learn_narration_logs_child_id ON learn_narration_logs(child_id, logged_at DESC);
CREATE INDEX idx_learn_nature_journal_child
  ON learn_nature_journal_entries(child_id, observed_on DESC);
CREATE INDEX idx_learn_pace_profiles_household_id ON learn_household_pace_profiles(household_id);
CREATE INDEX idx_learn_recitation_tracks_household
  ON learn_recitation_tracks(household_id, child_id);
CREATE INDEX idx_learn_rotations_household_term
  ON learn_rotations(household_id, term_id, rotation_type);
CREATE INDEX idx_learn_school_years_household_id ON learn_school_years(household_id);
CREATE INDEX idx_learn_season_adjustments_household_id ON learn_season_adjustments(household_id, starts_on, ends_on);
CREATE INDEX idx_learn_terms_school_year_id ON learn_terms(school_year_id);
CREATE INDEX idx_learn_test_scores_household_child   ON learn_test_scores(household_id, child_id);
CREATE INDEX idx_legal_acceptances_organization
  ON legal_acceptances(organization_id, terms_version, accepted_at DESC);
CREATE INDEX idx_legal_acceptances_subject
  ON legal_acceptances(subject_user_id, terms_version, accepted_at DESC);
CREATE UNIQUE INDEX idx_legal_acceptances_transaction
  ON legal_acceptances(terms_version, acceptance_source, transaction_reference, actor_email);
CREATE INDEX idx_manual_income_eligible_date
  ON manual_income_entries(parish_id, contribution_eligible, entry_date);
CREATE INDEX idx_manual_income_parish_date
  ON manual_income_entries(parish_id, entry_date);
CREATE INDEX idx_membership_capabilities_membership_id ON membership_capabilities(membership_id);
CREATE UNIQUE INDEX idx_membership_capabilities_unique ON membership_capabilities(membership_id, capability);
CREATE INDEX idx_membership_invitations_email ON membership_invitations(email);
CREATE INDEX idx_membership_invitations_parish_id ON membership_invitations(parish_id);
CREATE INDEX idx_membership_invitations_status ON membership_invitations(status);
CREATE INDEX idx_nonprofit_pricing_applications_status
  ON nonprofit_pricing_applications (status, updated_at);
CREATE INDEX idx_nonprofit_pricing_audit_application
  ON nonprofit_pricing_audit_log (application_id, created_at);
CREATE INDEX idx_nonprofit_pricing_documents_application
  ON nonprofit_pricing_documents (application_id, document_type, is_current);
CREATE INDEX idx_parish_announcements_feed ON parish_announcements(parish_id, status, published_at DESC);
CREATE INDEX idx_parish_bulletins_edition ON parish_bulletins(parish_id, status, service_date DESC, updated_at DESC);
CREATE INDEX idx_parish_bulletin_troparia_parish_active_sort ON parish_bulletin_troparia(parish_id, active, sort_order);
CREATE INDEX idx_parish_availability_blackouts_parish_date
  ON parish_availability_blackouts(parish_id, date);
CREATE INDEX idx_parish_availability_blackouts_parish_range
  ON parish_availability_blackouts(parish_id, date, end_date);
CREATE INDEX idx_parish_availability_rules_parish
  ON parish_availability_rules(parish_id, sacrament_type, active);
CREATE INDEX idx_parish_commerce_permissions_user
  ON parish_commerce_permissions(user_email, status);
CREATE INDEX idx_parish_content_reads_lookup
  ON parish_content_reads(parish_id, content_type, donor_id);
CREATE INDEX idx_parish_content_reads_receipts
  ON parish_content_reads(parish_id, content_type, content_id, read_at, donor_id);
CREATE INDEX idx_parish_feature_requests_parish
  ON parish_feature_requests (parish_id, feature_id, created_at);
CREATE INDEX idx_parish_group_messages_ministry
  ON parish_group_messages(parish_id, ministry_id, created_at DESC);
CREATE INDEX idx_parish_group_messages_retention
  ON parish_group_messages(created_at ASC);
CREATE INDEX idx_parish_library_admin
  ON parish_library_resources(parish_id, updated_at DESC);
CREATE INDEX idx_parish_library_member_feed
  ON parish_library_resources(parish_id, status, pinned DESC, published_at DESC);
CREATE INDEX idx_parish_memberships_parish_id ON parish_memberships(parish_id);
CREATE INDEX idx_parish_memberships_status ON parish_memberships(status);
CREATE INDEX idx_parish_memberships_user_id ON parish_memberships(user_id);
CREATE UNIQUE INDEX idx_parish_memberships_user_parish ON parish_memberships(user_id, parish_id);
CREATE INDEX idx_parish_portability_jobs_parish ON parish_portability_jobs(parish_id, created_at DESC);
CREATE INDEX idx_parish_portability_jobs_work ON parish_portability_jobs(status, updated_at);
CREATE INDEX idx_parish_teaching_feed ON parish_teaching_posts(parish_id, status, published_at DESC);
CREATE INDEX idx_parish_teaching_pinned_feed
  ON parish_teaching_posts(parish_id, status, pinned DESC, published_at DESC);
CREATE INDEX idx_parish_video_feed
  ON parish_video_posts(parish_id, status, published_at DESC);
CREATE INDEX idx_parish_youtube_links
  ON parish_youtube_links(parish_id, added_at DESC);
CREATE INDEX idx_parish_youtube_links_pinned
  ON parish_youtube_links(parish_id, pinned DESC, added_at DESC);
CREATE UNIQUE INDEX idx_platform_users_email ON platform_users(email);
CREATE INDEX idx_platform_users_status ON platform_users(status);
CREATE INDEX idx_portability_objects_parish ON parish_portability_objects(parish_id);
CREATE INDEX idx_privileged_mfa_transactions_expiry
  ON privileged_mfa_transactions(expires_at, consumed_at);
CREATE INDEX idx_privileged_webauthn_principal
  ON privileged_webauthn_credentials(principal_type, principal_id);
CREATE INDEX idx_push_subscriptions_parish
  ON push_subscriptions(parish_id, donor_id);
CREATE INDEX idx_registrations_parish_id ON registrations(parish_id);
CREATE INDEX idx_registrations_received_at ON registrations(received_at);
CREATE INDEX idx_registrations_status ON registrations(status);
CREATE INDEX idx_registrations_stripe_account_id ON registrations(stripe_account_id);
CREATE INDEX idx_registrations_stripe_subscription_id ON registrations(stripe_subscription_id);
CREATE INDEX idx_registrations_tax_exemption_expiration_date ON registrations(tax_exemption_expiration_date);
CREATE INDEX idx_registrations_tax_exemption_status ON registrations(tax_exemption_status);
CREATE INDEX idx_sacrament_requests_donor ON sacrament_requests(donor_email, created_at DESC);
CREATE INDEX idx_sacrament_requests_parish ON sacrament_requests(parish_id, status, created_at DESC);
CREATE INDEX idx_settlement_profile_modules_profile ON settlement_profile_modules(settlement_profile_id);
CREATE UNIQUE INDEX idx_settlement_profiles_default_commerce ON settlement_profiles(parish_id) WHERE is_default_commerce = 1;
CREATE UNIQUE INDEX idx_settlement_profiles_default_giving ON settlement_profiles(parish_id) WHERE is_default_giving = 1;
CREATE INDEX idx_settlement_profiles_parish ON settlement_profiles(parish_id, is_active, name);
CREATE INDEX idx_sms_keywords_destination
  ON sms_keywords (destination_type, destination_id);
CREATE INDEX idx_sms_keywords_parish_id
  ON sms_keywords (parish_id);
CREATE INDEX idx_stewardship_agenda_meeting
  ON stewardship_agenda_items(annual_meeting_id, sort_order);
CREATE INDEX idx_stewardship_annual_meetings_parish ON stewardship_annual_meetings(parish_id, fiscal_year DESC);
CREATE INDEX idx_stewardship_authoritative_snapshot_year
  ON stewardship_authoritative_financial_snapshots(parish_id, fiscal_year DESC);
CREATE INDEX idx_stewardship_financial_meeting
  ON stewardship_financial_summaries(annual_meeting_id);
CREATE INDEX idx_stewardship_meetings_parish
  ON stewardship_annual_meetings(parish_id, fiscal_year DESC, created_at DESC);
CREATE INDEX idx_stewardship_nominees_meeting
  ON stewardship_nominees(annual_meeting_id, sort_order);
CREATE INDEX idx_stewardship_packets_meeting
  ON stewardship_generated_packets(annual_meeting_id, generated_at DESC);
CREATE INDEX idx_stewardship_reports_meeting
  ON stewardship_reports(annual_meeting_id, sort_order);
CREATE INDEX idx_stewardship_resolutions_meeting
  ON stewardship_resolutions(annual_meeting_id, sort_order);
CREATE INDEX idx_stewardship_restricted_meeting
  ON stewardship_restricted_fund_snapshots(annual_meeting_id, sort_order);
CREATE INDEX idx_stewardship_snapshot_revisions
  ON stewardship_financial_snapshot_revisions(snapshot_id, version DESC);
CREATE INDEX idx_stripe_events_received_at ON stripe_events(received_at);
CREATE INDEX idx_stripe_events_status ON stripe_events(status);
CREATE INDEX idx_stripe_volume_parish_class
  ON stripe_payment_volume_records (parish_id, payment_class, occurred_at);
CREATE INDEX idx_stripe_volume_parish_occurred
  ON stripe_payment_volume_records (parish_id, occurred_at);
CREATE INDEX idx_tax_exemption_audit_log_created_at ON tax_exemption_audit_log(created_at);
CREATE INDEX idx_tax_exemption_audit_log_registration_reference ON tax_exemption_audit_log(registration_reference);
CREATE INDEX idx_tax_exemption_audit_log_tax_exemption_id ON tax_exemption_audit_log(tax_exemption_id);
CREATE INDEX idx_tax_exemption_documents_registration_reference ON tax_exemption_documents(registration_reference);
CREATE INDEX idx_tax_exemption_documents_tax_exemption_id ON tax_exemption_documents(tax_exemption_id);
CREATE INDEX idx_tax_exemption_notes_tax_exemption_id ON tax_exemption_notes(tax_exemption_id);
CREATE INDEX idx_tax_exemption_stripe_syncs_customer_role ON tax_exemption_stripe_syncs(customer_role);
CREATE INDEX idx_tax_exemption_stripe_syncs_registration_reference ON tax_exemption_stripe_syncs(registration_reference);
CREATE INDEX idx_tax_exemption_stripe_syncs_stripe_customer_id ON tax_exemption_stripe_syncs(stripe_customer_id);
CREATE INDEX idx_tax_exemption_stripe_syncs_sync_status ON tax_exemption_stripe_syncs(sync_status);
CREATE INDEX idx_tax_exemption_stripe_syncs_tax_exemption_id ON tax_exemption_stripe_syncs(tax_exemption_id);
CREATE INDEX idx_tax_exemptions_created_at ON tax_exemptions(created_at);
CREATE INDEX idx_tax_exemptions_expiration_date ON tax_exemptions(expiration_date);
CREATE INDEX idx_tax_exemptions_parish_id ON tax_exemptions(parish_id);
CREATE INDEX idx_tax_exemptions_registration_reference ON tax_exemptions(registration_reference);
CREATE INDEX idx_tax_exemptions_status ON tax_exemptions(status);
CREATE INDEX idx_tax_exemptions_supersedes ON tax_exemptions(supersedes_tax_exemption_id);
CREATE INDEX idx_tax_exemptions_upload_token_hash ON tax_exemptions(upload_token_hash);
CREATE UNIQUE INDEX uq_directory_address_primary_active
  ON directory_addresses(owner_type, owner_id, address_type)
  WHERE active = 1 AND is_primary = 1;
CREATE UNIQUE INDEX uq_directory_change_requests_active_duplicate
  ON directory_change_requests(parish_id, requester_person_id, target_type, target_id, request_type, summary)
  WHERE status = 'pending';
CREATE UNIQUE INDEX uq_directory_child_pub_requests_one_active
  ON directory_child_publication_requests(parish_id, child_person_id)
  WHERE status IN ('draft', 'submitted', 'under_review', 'returned');
CREATE UNIQUE INDEX uq_directory_contact_primary_active
  ON directory_contact_methods(owner_type, owner_id, contact_type)
  WHERE active = 1 AND is_primary = 1;
CREATE UNIQUE INDEX uq_directory_household_share_review
  ON directory_change_requests(json_extract(requested_payload_json, '$.shareToLink.invitationId'))
  WHERE request_type = 'household_membership_add'
    AND json_extract(requested_payload_json, '$.shareToLink.invitationId') IS NOT NULL;
CREATE UNIQUE INDEX uq_directory_media_assignments_one_active
  ON directory_media_assignments(parish_id, owner_type, owner_id, media_purpose)
  WHERE assignment_status = 'active';
CREATE UNIQUE INDEX uq_directory_media_assignments_one_candidate
  ON directory_media_assignments(parish_id, owner_type, owner_id, media_purpose)
  WHERE assignment_status = 'candidate';
CREATE UNIQUE INDEX uq_directory_ministry_active_leader
  ON directory_ministry_leaders(parish_id, ministry_id, person_id, assignment_type)
  WHERE active = 1;
CREATE UNIQUE INDEX uq_directory_ministry_active_participant
  ON directory_ministry_participants(parish_id, ministry_id, person_id)
  WHERE status IN ('active', 'paused');
CREATE UNIQUE INDEX uq_directory_ministry_interest_unresolved
  ON directory_ministry_interest_requests(parish_id, ministry_id, person_id)
  WHERE status IN ('submitted', 'under_review', 'returned');
CREATE UNIQUE INDEX uq_directory_person_skill_active
  ON directory_person_skill_listings(parish_id, person_id, skill_id)
  WHERE status IN ('draft', 'active', 'paused', 'hidden_by_parish');
CREATE UNIQUE INDEX uq_koinonia_exchange_thread_per_requester
  ON koinonia_exchange_threads(listing_id, requester_person_id);
CREATE UNIQUE INDEX uq_koinonia_signup_entry_active
  ON koinonia_signup_entries(slot_id, person_id)
  WHERE status = 'confirmed';
CREATE UNIQUE INDEX uq_koinonia_signup_waiting ON koinonia_signup_waitlist(slot_id,person_id) WHERE status IN ('waiting','offered');
CREATE UNIQUE INDEX uq_learn_households_stripe_customer_id
  ON learn_households(stripe_customer_id);
CREATE UNIQUE INDEX uq_sacrament_requests_scheduled_priest_slot
  ON sacrament_requests(parish_id, confirmed_date, confirmed_time, COALESCE(clergy_assigned, ''))
  WHERE status = 'scheduled';
CREATE UNIQUE INDEX uq_sms_keywords_keyword
  ON sms_keywords (keyword);
CREATE UNIQUE INDEX uq_tax_exemptions_one_approved_per_registration   ON tax_exemptions(registration_reference)   WHERE status = 'approved';
CREATE TRIGGER legal_acceptances_no_delete
BEFORE DELETE ON legal_acceptances
BEGIN
  SELECT RAISE(ABORT, 'legal_acceptances are append-only');
END;
CREATE TRIGGER legal_acceptances_no_update
BEFORE UPDATE ON legal_acceptances
BEGIN
  SELECT RAISE(ABORT, 'legal_acceptances are append-only');
END;
CREATE TRIGGER legal_terms_versions_no_delete
BEFORE DELETE ON legal_terms_versions
BEGIN
  SELECT RAISE(ABORT, 'legal_terms_versions are append-only');
END;
CREATE TRIGGER legal_terms_versions_no_update
BEFORE UPDATE ON legal_terms_versions
BEGIN
  SELECT RAISE(ABORT, 'legal_terms_versions are append-only');
END;
CREATE TRIGGER "portability_accounting_databases_delete" BEFORE DELETE ON "accounting_databases" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD."accounting_entity_id" IN (SELECT p."id" FROM "accounting_entities" p WHERE p.parish_id = c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_accounting_databases_insert" BEFORE INSERT ON "accounting_databases" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((NEW."accounting_entity_id" IN (SELECT p."id" FROM "accounting_entities" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "accounting_entities" p WHERE p."id"=NEW."accounting_entity_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_accounting_databases_update" BEFORE UPDATE ON "accounting_databases" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((OLD."accounting_entity_id" IN (SELECT p."id" FROM "accounting_entities" p WHERE p.parish_id = c.parish_id)) OR (NEW."accounting_entity_id" IN (SELECT p."id" FROM "accounting_entities" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "accounting_entities" p WHERE p."id"=NEW."accounting_entity_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_accounting_entities_delete" BEFORE DELETE ON "accounting_entities" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_accounting_entities_insert" BEFORE INSERT ON "accounting_entities" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_accounting_entities_update" BEFORE UPDATE ON "accounting_entities" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_accounting_integrity_alert_deliveries_delete" BEFORE DELETE ON "accounting_integrity_alert_deliveries" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_accounting_integrity_alert_deliveries_insert" BEFORE INSERT ON "accounting_integrity_alert_deliveries" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_accounting_integrity_alert_deliveries_update" BEFORE UPDATE ON "accounting_integrity_alert_deliveries" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_accounting_integrity_release_requests_delete" BEFORE DELETE ON "accounting_integrity_release_requests" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_accounting_integrity_release_requests_insert" BEFORE INSERT ON "accounting_integrity_release_requests" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_accounting_integrity_release_requests_update" BEFORE UPDATE ON "accounting_integrity_release_requests" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_accounting_lifecycle_events_delete" BEFORE DELETE ON "accounting_lifecycle_events" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD."accounting_entity_id" IN (SELECT p."id" FROM "accounting_entities" p WHERE p.parish_id = c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_accounting_lifecycle_events_insert" BEFORE INSERT ON "accounting_lifecycle_events" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((NEW."accounting_entity_id" IN (SELECT p."id" FROM "accounting_entities" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "accounting_entities" p WHERE p."id"=NEW."accounting_entity_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_accounting_lifecycle_events_update" BEFORE UPDATE ON "accounting_lifecycle_events" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((OLD."accounting_entity_id" IN (SELECT p."id" FROM "accounting_entities" p WHERE p.parish_id = c.parish_id)) OR (NEW."accounting_entity_id" IN (SELECT p."id" FROM "accounting_entities" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "accounting_entities" p WHERE p."id"=NEW."accounting_entity_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_accounting_provisioning_operations_delete" BEFORE DELETE ON "accounting_provisioning_operations" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD."accounting_entity_id" IN (SELECT p."id" FROM "accounting_entities" p WHERE p.parish_id = c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_accounting_provisioning_operations_insert" BEFORE INSERT ON "accounting_provisioning_operations" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((NEW."accounting_entity_id" IN (SELECT p."id" FROM "accounting_entities" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "accounting_entities" p WHERE p."id"=NEW."accounting_entity_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_accounting_provisioning_operations_update" BEFORE UPDATE ON "accounting_provisioning_operations" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((OLD."accounting_entity_id" IN (SELECT p."id" FROM "accounting_entities" p WHERE p.parish_id = c.parish_id)) OR (NEW."accounting_entity_id" IN (SELECT p."id" FROM "accounting_entities" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "accounting_entities" p WHERE p."id"=NEW."accounting_entity_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_accounting_staff_profiles_delete" BEFORE DELETE ON "accounting_staff_profiles" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_accounting_staff_profiles_insert" BEFORE INSERT ON "accounting_staff_profiles" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_accounting_staff_profiles_update" BEFORE UPDATE ON "accounting_staff_profiles" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_accounting_staff_sessions_delete" BEFORE DELETE ON "accounting_staff_sessions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_accounting_staff_sessions_insert" BEFORE INSERT ON "accounting_staff_sessions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_accounting_staff_sessions_update" BEFORE UPDATE ON "accounting_staff_sessions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_app_settings_delete" BEFORE DELETE ON "app_settings" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND (((OLD.key = 'parish-feature-requests:' || c.parish_id OR substr(OLD.key,1,length('reconciliation-close:' || c.parish_id || ':')) = 'reconciliation-close:' || c.parish_id || ':' OR (substr(OLD.key,1,15)<>'__agapay_learn_' AND CASE WHEN json_valid(OLD.value) THEN COALESCE(json_extract(OLD.value,'$.parishId'),json_extract(OLD.value,'$.parish_id'),json_extract(OLD.value,'$.organizationId')) END = c.parish_id))))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_app_settings_insert" BEFORE INSERT ON "app_settings" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((NEW.key = 'parish-feature-requests:' || c.parish_id OR substr(NEW.key,1,length('reconciliation-close:' || c.parish_id || ':')) = 'reconciliation-close:' || c.parish_id || ':' OR (substr(NEW.key,1,15)<>'__agapay_learn_' AND CASE WHEN json_valid(NEW.value) THEN COALESCE(json_extract(NEW.value,'$.parishId'),json_extract(NEW.value,'$.parish_id'),json_extract(NEW.value,'$.organizationId')) END = c.parish_id))))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_app_settings_update" BEFORE UPDATE ON "app_settings" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((OLD.key = 'parish-feature-requests:' || c.parish_id OR substr(OLD.key,1,length('reconciliation-close:' || c.parish_id || ':')) = 'reconciliation-close:' || c.parish_id || ':' OR (substr(OLD.key,1,15)<>'__agapay_learn_' AND CASE WHEN json_valid(OLD.value) THEN COALESCE(json_extract(OLD.value,'$.parishId'),json_extract(OLD.value,'$.parish_id'),json_extract(OLD.value,'$.organizationId')) END = c.parish_id))) OR ((NEW.key = 'parish-feature-requests:' || c.parish_id OR substr(NEW.key,1,length('reconciliation-close:' || c.parish_id || ':')) = 'reconciliation-close:' || c.parish_id || ':' OR (substr(NEW.key,1,15)<>'__agapay_learn_' AND CASE WHEN json_valid(NEW.value) THEN COALESCE(json_extract(NEW.value,'$.parishId'),json_extract(NEW.value,'$.parish_id'),json_extract(NEW.value,'$.organizationId')) END = c.parish_id))))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_audit_log_delete" BEFORE DELETE ON "audit_log" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.organization_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_audit_log_insert" BEFORE INSERT ON "audit_log" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.organization_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_audit_log_update" BEFORE UPDATE ON "audit_log" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.organization_id = c.parish_id) OR (NEW.organization_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commemorations_delete" BEFORE DELETE ON "commemorations" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commemorations_insert" BEFORE INSERT ON "commemorations" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commemorations_update" BEFORE UPDATE ON "commemorations" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_checkout_sessions_delete" BEFORE DELETE ON "commerce_checkout_sessions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_checkout_sessions_insert" BEFORE INSERT ON "commerce_checkout_sessions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_checkout_sessions_update" BEFORE UPDATE ON "commerce_checkout_sessions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_inventory_balances_delete" BEFORE DELETE ON "commerce_inventory_balances" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_inventory_balances_insert" BEFORE INSERT ON "commerce_inventory_balances" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_inventory_balances_update" BEFORE UPDATE ON "commerce_inventory_balances" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_inventory_count_sessions_delete" BEFORE DELETE ON "commerce_inventory_count_sessions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_inventory_count_sessions_insert" BEFORE INSERT ON "commerce_inventory_count_sessions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_inventory_count_sessions_update" BEFORE UPDATE ON "commerce_inventory_count_sessions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_inventory_movements_delete" BEFORE DELETE ON "commerce_inventory_movements" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_inventory_movements_insert" BEFORE INSERT ON "commerce_inventory_movements" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_inventory_movements_update" BEFORE UPDATE ON "commerce_inventory_movements" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_order_items_delete" BEFORE DELETE ON "commerce_order_items" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_order_items_insert" BEFORE INSERT ON "commerce_order_items" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_order_items_update" BEFORE UPDATE ON "commerce_order_items" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_orders_delete" BEFORE DELETE ON "commerce_orders" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_orders_insert" BEFORE INSERT ON "commerce_orders" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_orders_update" BEFORE UPDATE ON "commerce_orders" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_product_barcodes_delete" BEFORE DELETE ON "commerce_product_barcodes" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_product_barcodes_insert" BEFORE INSERT ON "commerce_product_barcodes" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_product_barcodes_update" BEFORE UPDATE ON "commerce_product_barcodes" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_product_variants_delete" BEFORE DELETE ON "commerce_product_variants" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_product_variants_insert" BEFORE INSERT ON "commerce_product_variants" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_product_variants_update" BEFORE UPDATE ON "commerce_product_variants" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_products_delete" BEFORE DELETE ON "commerce_products" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_products_insert" BEFORE INSERT ON "commerce_products" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_products_update" BEFORE UPDATE ON "commerce_products" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_registered_devices_delete" BEFORE DELETE ON "commerce_registered_devices" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_registered_devices_insert" BEFORE INSERT ON "commerce_registered_devices" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_registered_devices_update" BEFORE UPDATE ON "commerce_registered_devices" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_weekly_reports_delete" BEFORE DELETE ON "commerce_weekly_reports" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_weekly_reports_insert" BEFORE INSERT ON "commerce_weekly_reports" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_commerce_weekly_reports_update" BEFORE UPDATE ON "commerce_weekly_reports" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_addresses_delete" BEFORE DELETE ON "directory_addresses" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_addresses_insert" BEFORE INSERT ON "directory_addresses" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_addresses_update" BEFORE UPDATE ON "directory_addresses" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_change_requests_delete" BEFORE DELETE ON "directory_change_requests" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_change_requests_insert" BEFORE INSERT ON "directory_change_requests" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_change_requests_update" BEFORE UPDATE ON "directory_change_requests" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_child_publication_requests_delete" BEFORE DELETE ON "directory_child_publication_requests" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_child_publication_requests_insert" BEFORE INSERT ON "directory_child_publication_requests" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_child_publication_requests_update" BEFORE UPDATE ON "directory_child_publication_requests" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_claims_delete" BEFORE DELETE ON "directory_claims" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_claims_insert" BEFORE INSERT ON "directory_claims" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_claims_update" BEFORE UPDATE ON "directory_claims" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_contact_methods_delete" BEFORE DELETE ON "directory_contact_methods" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_contact_methods_insert" BEFORE INSERT ON "directory_contact_methods" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_contact_methods_update" BEFORE UPDATE ON "directory_contact_methods" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_duplicate_candidates_delete" BEFORE DELETE ON "directory_duplicate_candidates" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_duplicate_candidates_insert" BEFORE INSERT ON "directory_duplicate_candidates" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_duplicate_candidates_update" BEFORE UPDATE ON "directory_duplicate_candidates" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_field_privacy_preferences_delete" BEFORE DELETE ON "directory_field_privacy_preferences" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_field_privacy_preferences_insert" BEFORE INSERT ON "directory_field_privacy_preferences" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_field_privacy_preferences_update" BEFORE UPDATE ON "directory_field_privacy_preferences" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_household_admins_delete" BEFORE DELETE ON "directory_household_admins" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD."household_id" IN (SELECT p."id" FROM "directory_households" p WHERE p.parish_id = c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_household_admins_insert" BEFORE INSERT ON "directory_household_admins" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((NEW."household_id" IN (SELECT p."id" FROM "directory_households" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "directory_households" p WHERE p."id"=NEW."household_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_household_admins_update" BEFORE UPDATE ON "directory_household_admins" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((OLD."household_id" IN (SELECT p."id" FROM "directory_households" p WHERE p.parish_id = c.parish_id)) OR (NEW."household_id" IN (SELECT p."id" FROM "directory_households" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "directory_households" p WHERE p."id"=NEW."household_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_household_invitations_delete" BEFORE DELETE ON "directory_household_invitations" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_household_invitations_insert" BEFORE INSERT ON "directory_household_invitations" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_household_invitations_update" BEFORE UPDATE ON "directory_household_invitations" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_household_members_delete" BEFORE DELETE ON "directory_household_members" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD."household_id" IN (SELECT p."id" FROM "directory_households" p WHERE p.parish_id = c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_household_members_insert" BEFORE INSERT ON "directory_household_members" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((NEW."household_id" IN (SELECT p."id" FROM "directory_households" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "directory_households" p WHERE p."id"=NEW."household_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_household_members_update" BEFORE UPDATE ON "directory_household_members" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((OLD."household_id" IN (SELECT p."id" FROM "directory_households" p WHERE p.parish_id = c.parish_id)) OR (NEW."household_id" IN (SELECT p."id" FROM "directory_households" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "directory_households" p WHERE p."id"=NEW."household_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_household_namedays_delete" BEFORE DELETE ON "directory_household_namedays" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_household_namedays_insert" BEFORE INSERT ON "directory_household_namedays" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_household_namedays_update" BEFORE UPDATE ON "directory_household_namedays" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_household_verifications_delete" BEFORE DELETE ON "directory_household_verifications" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_household_verifications_insert" BEFORE INSERT ON "directory_household_verifications" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_household_verifications_update" BEFORE UPDATE ON "directory_household_verifications" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_households_delete" BEFORE DELETE ON "directory_households" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_households_insert" BEFORE INSERT ON "directory_households" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_households_update" BEFORE UPDATE ON "directory_households" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_import_batches_delete" BEFORE DELETE ON "directory_import_batches" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_import_batches_insert" BEFORE INSERT ON "directory_import_batches" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_import_batches_update" BEFORE UPDATE ON "directory_import_batches" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_import_leases_delete" BEFORE DELETE ON "directory_import_leases" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_import_leases_insert" BEFORE INSERT ON "directory_import_leases" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_import_leases_update" BEFORE UPDATE ON "directory_import_leases" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_import_rows_delete" BEFORE DELETE ON "directory_import_rows" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD."batch_id" IN (SELECT p."id" FROM "directory_import_batches" p WHERE p.parish_id = c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_import_rows_insert" BEFORE INSERT ON "directory_import_rows" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((NEW."batch_id" IN (SELECT p."id" FROM "directory_import_batches" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "directory_import_batches" p WHERE p."id"=NEW."batch_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_import_rows_update" BEFORE UPDATE ON "directory_import_rows" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((OLD."batch_id" IN (SELECT p."id" FROM "directory_import_batches" p WHERE p.parish_id = c.parish_id)) OR (NEW."batch_id" IN (SELECT p."id" FROM "directory_import_batches" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "directory_import_batches" p WHERE p."id"=NEW."batch_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_internal_notes_delete" BEFORE DELETE ON "directory_internal_notes" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_internal_notes_insert" BEFORE INSERT ON "directory_internal_notes" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_internal_notes_update" BEFORE UPDATE ON "directory_internal_notes" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_invitations_delete" BEFORE DELETE ON "directory_invitations" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_invitations_insert" BEFORE INSERT ON "directory_invitations" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_invitations_update" BEFORE UPDATE ON "directory_invitations" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_media_assets_delete" BEFORE DELETE ON "directory_media_assets" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_media_assets_insert" BEFORE INSERT ON "directory_media_assets" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_media_assets_update" BEFORE UPDATE ON "directory_media_assets" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_media_assignments_delete" BEFORE DELETE ON "directory_media_assignments" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_media_assignments_insert" BEFORE INSERT ON "directory_media_assignments" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_media_assignments_update" BEFORE UPDATE ON "directory_media_assignments" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_media_upload_sessions_delete" BEFORE DELETE ON "directory_media_upload_sessions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_media_upload_sessions_insert" BEFORE INSERT ON "directory_media_upload_sessions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_media_upload_sessions_update" BEFORE UPDATE ON "directory_media_upload_sessions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_media_variants_delete" BEFORE DELETE ON "directory_media_variants" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD."media_asset_id" IN (SELECT p."id" FROM "directory_media_assets" p WHERE p.parish_id = c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_media_variants_insert" BEFORE INSERT ON "directory_media_variants" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((NEW."media_asset_id" IN (SELECT p."id" FROM "directory_media_assets" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "directory_media_assets" p WHERE p."id"=NEW."media_asset_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_media_variants_update" BEFORE UPDATE ON "directory_media_variants" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((OLD."media_asset_id" IN (SELECT p."id" FROM "directory_media_assets" p WHERE p.parish_id = c.parish_id)) OR (NEW."media_asset_id" IN (SELECT p."id" FROM "directory_media_assets" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "directory_media_assets" p WHERE p."id"=NEW."media_asset_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_merge_aliases_delete" BEFORE DELETE ON "directory_merge_aliases" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_merge_aliases_insert" BEFORE INSERT ON "directory_merge_aliases" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_merge_aliases_update" BEFORE UPDATE ON "directory_merge_aliases" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_merge_events_delete" BEFORE DELETE ON "directory_merge_events" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_merge_events_insert" BEFORE INSERT ON "directory_merge_events" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_merge_events_update" BEFORE UPDATE ON "directory_merge_events" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_ministries_delete" BEFORE DELETE ON "directory_ministries" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_ministries_insert" BEFORE INSERT ON "directory_ministries" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_ministries_update" BEFORE UPDATE ON "directory_ministries" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_ministry_interest_requests_delete" BEFORE DELETE ON "directory_ministry_interest_requests" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_ministry_interest_requests_insert" BEFORE INSERT ON "directory_ministry_interest_requests" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_ministry_interest_requests_update" BEFORE UPDATE ON "directory_ministry_interest_requests" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_ministry_leaders_delete" BEFORE DELETE ON "directory_ministry_leaders" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_ministry_leaders_insert" BEFORE INSERT ON "directory_ministry_leaders" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_ministry_leaders_update" BEFORE UPDATE ON "directory_ministry_leaders" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_ministry_participants_delete" BEFORE DELETE ON "directory_ministry_participants" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_ministry_participants_insert" BEFORE INSERT ON "directory_ministry_participants" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_ministry_participants_update" BEFORE UPDATE ON "directory_ministry_participants" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_notification_events_delete" BEFORE DELETE ON "directory_notification_events" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_notification_events_insert" BEFORE INSERT ON "directory_notification_events" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_notification_events_update" BEFORE UPDATE ON "directory_notification_events" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_parish_affiliations_delete" BEFORE DELETE ON "directory_parish_affiliations" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_parish_affiliations_insert" BEFORE INSERT ON "directory_parish_affiliations" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_parish_affiliations_update" BEFORE UPDATE ON "directory_parish_affiliations" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_parish_settings_delete" BEFORE DELETE ON "directory_parish_settings" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_parish_settings_insert" BEFORE INSERT ON "directory_parish_settings" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_parish_settings_update" BEFORE UPDATE ON "directory_parish_settings" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_people_delete" BEFORE DELETE ON "directory_people" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.created_by_parish_id = c.parish_id AND NOT EXISTS(SELECT 1 FROM directory_person_links l WHERE l.person_id=OLD.id) AND NOT EXISTS(SELECT 1 FROM directory_parish_affiliations a WHERE a.person_id=OLD.id AND a.parish_id<>c.parish_id) AND NOT EXISTS(SELECT 1 FROM directory_household_members m JOIN directory_households h ON h.id=m.household_id WHERE m.person_id=OLD.id AND h.parish_id<>c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_people_insert" BEFORE INSERT ON "directory_people" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.created_by_parish_id = c.parish_id AND NOT EXISTS(SELECT 1 FROM directory_person_links l WHERE l.person_id=NEW.id) AND NOT EXISTS(SELECT 1 FROM directory_parish_affiliations a WHERE a.person_id=NEW.id AND a.parish_id<>c.parish_id) AND NOT EXISTS(SELECT 1 FROM directory_household_members m JOIN directory_households h ON h.id=m.household_id WHERE m.person_id=NEW.id AND h.parish_id<>c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_people_update" BEFORE UPDATE ON "directory_people" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.created_by_parish_id = c.parish_id AND NOT EXISTS(SELECT 1 FROM directory_person_links l WHERE l.person_id=OLD.id) AND NOT EXISTS(SELECT 1 FROM directory_parish_affiliations a WHERE a.person_id=OLD.id AND a.parish_id<>c.parish_id) AND NOT EXISTS(SELECT 1 FROM directory_household_members m JOIN directory_households h ON h.id=m.household_id WHERE m.person_id=OLD.id AND h.parish_id<>c.parish_id)) OR (NEW.created_by_parish_id = c.parish_id AND NOT EXISTS(SELECT 1 FROM directory_person_links l WHERE l.person_id=NEW.id) AND NOT EXISTS(SELECT 1 FROM directory_parish_affiliations a WHERE a.person_id=NEW.id AND a.parish_id<>c.parish_id) AND NOT EXISTS(SELECT 1 FROM directory_household_members m JOIN directory_households h ON h.id=m.household_id WHERE m.person_id=NEW.id AND h.parish_id<>c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_person_privacy_flags_delete" BEFORE DELETE ON "directory_person_privacy_flags" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_person_privacy_flags_insert" BEFORE INSERT ON "directory_person_privacy_flags" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_person_privacy_flags_update" BEFORE UPDATE ON "directory_person_privacy_flags" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_person_skill_listings_delete" BEFORE DELETE ON "directory_person_skill_listings" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_person_skill_listings_insert" BEFORE INSERT ON "directory_person_skill_listings" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_person_skill_listings_update" BEFORE UPDATE ON "directory_person_skill_listings" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_publication_profiles_delete" BEFORE DELETE ON "directory_publication_profiles" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_publication_profiles_insert" BEFORE INSERT ON "directory_publication_profiles" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_publication_profiles_update" BEFORE UPDATE ON "directory_publication_profiles" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_review_correspondence_delete" BEFORE DELETE ON "directory_review_correspondence" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_review_correspondence_insert" BEFORE INSERT ON "directory_review_correspondence" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_review_correspondence_update" BEFORE UPDATE ON "directory_review_correspondence" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_review_metadata_delete" BEFORE DELETE ON "directory_review_metadata" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_review_metadata_insert" BEFORE INSERT ON "directory_review_metadata" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_review_metadata_update" BEFORE UPDATE ON "directory_review_metadata" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_skill_catalog_delete" BEFORE DELETE ON "directory_skill_catalog" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_skill_catalog_insert" BEFORE INSERT ON "directory_skill_catalog" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_directory_skill_catalog_update" BEFORE UPDATE ON "directory_skill_catalog" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_donor_notifications_delete" BEFORE DELETE ON "donor_notifications" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_donor_notifications_insert" BEFORE INSERT ON "donor_notifications" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_donor_notifications_update" BEFORE UPDATE ON "donor_notifications" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_donor_offerings_delete" BEFORE DELETE ON "donor_offerings" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_donor_offerings_insert" BEFORE INSERT ON "donor_offerings" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_donor_offerings_update" BEFORE UPDATE ON "donor_offerings" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_giving_funds_delete" BEFORE DELETE ON "giving_funds" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_giving_funds_insert" BEFORE INSERT ON "giving_funds" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_giving_funds_update" BEFORE UPDATE ON "giving_funds" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_giving_statement_jobs_delete" BEFORE DELETE ON "giving_statement_jobs" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_giving_statement_jobs_insert" BEFORE INSERT ON "giving_statement_jobs" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_giving_statement_jobs_update" BEFORE UPDATE ON "giving_statement_jobs" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_giving_statements_delete" BEFORE DELETE ON "giving_statements" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_giving_statements_insert" BEFORE INSERT ON "giving_statements" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_giving_statements_update" BEFORE UPDATE ON "giving_statements" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_household_pledges_delete" BEFORE DELETE ON "household_pledges" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_household_pledges_insert" BEFORE INSERT ON "household_pledges" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_household_pledges_update" BEFORE UPDATE ON "household_pledges" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_community_tool_views_delete" BEFORE DELETE ON "koinonia_community_tool_views" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_community_tool_views_insert" BEFORE INSERT ON "koinonia_community_tool_views" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_community_tool_views_update" BEFORE UPDATE ON "koinonia_community_tool_views" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_exchange_listings_delete" BEFORE DELETE ON "koinonia_exchange_listings" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_exchange_listings_insert" BEFORE INSERT ON "koinonia_exchange_listings" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_exchange_listings_update" BEFORE UPDATE ON "koinonia_exchange_listings" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_exchange_messages_delete" BEFORE DELETE ON "koinonia_exchange_messages" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_exchange_messages_insert" BEFORE INSERT ON "koinonia_exchange_messages" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_exchange_messages_update" BEFORE UPDATE ON "koinonia_exchange_messages" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_exchange_photos_delete" BEFORE DELETE ON "koinonia_exchange_photos" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD."listing_id" IN (SELECT p."id" FROM "koinonia_exchange_listings" p WHERE p.parish_id = c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_exchange_photos_insert" BEFORE INSERT ON "koinonia_exchange_photos" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((NEW."listing_id" IN (SELECT p."id" FROM "koinonia_exchange_listings" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "koinonia_exchange_listings" p WHERE p."id"=NEW."listing_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_exchange_photos_update" BEFORE UPDATE ON "koinonia_exchange_photos" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((OLD."listing_id" IN (SELECT p."id" FROM "koinonia_exchange_listings" p WHERE p.parish_id = c.parish_id)) OR (NEW."listing_id" IN (SELECT p."id" FROM "koinonia_exchange_listings" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "koinonia_exchange_listings" p WHERE p."id"=NEW."listing_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_exchange_threads_delete" BEFORE DELETE ON "koinonia_exchange_threads" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_exchange_threads_insert" BEFORE INSERT ON "koinonia_exchange_threads" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_exchange_threads_update" BEFORE UPDATE ON "koinonia_exchange_threads" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_ministry_availability_delete" BEFORE DELETE ON "koinonia_ministry_availability" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_ministry_availability_insert" BEFORE INSERT ON "koinonia_ministry_availability" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_ministry_availability_update" BEFORE UPDATE ON "koinonia_ministry_availability" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_ministry_event_attendance_delete" BEFORE DELETE ON "koinonia_ministry_event_attendance" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD."event_id" IN (SELECT p."id" FROM "koinonia_ministry_events" p WHERE p.parish_id = c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_ministry_event_attendance_insert" BEFORE INSERT ON "koinonia_ministry_event_attendance" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((NEW."event_id" IN (SELECT p."id" FROM "koinonia_ministry_events" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "koinonia_ministry_events" p WHERE p."id"=NEW."event_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_ministry_event_attendance_update" BEFORE UPDATE ON "koinonia_ministry_event_attendance" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((OLD."event_id" IN (SELECT p."id" FROM "koinonia_ministry_events" p WHERE p.parish_id = c.parish_id)) OR (NEW."event_id" IN (SELECT p."id" FROM "koinonia_ministry_events" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "koinonia_ministry_events" p WHERE p."id"=NEW."event_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_ministry_events_delete" BEFORE DELETE ON "koinonia_ministry_events" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_ministry_events_insert" BEFORE INSERT ON "koinonia_ministry_events" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_ministry_events_update" BEFORE UPDATE ON "koinonia_ministry_events" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_ministry_resources_delete" BEFORE DELETE ON "koinonia_ministry_resources" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_ministry_resources_insert" BEFORE INSERT ON "koinonia_ministry_resources" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_ministry_resources_update" BEFORE UPDATE ON "koinonia_ministry_resources" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_prayer_acknowledgements_delete" BEFORE DELETE ON "koinonia_prayer_acknowledgements" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_prayer_acknowledgements_insert" BEFORE INSERT ON "koinonia_prayer_acknowledgements" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_prayer_acknowledgements_update" BEFORE UPDATE ON "koinonia_prayer_acknowledgements" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_prayer_activity_delete" BEFORE DELETE ON "koinonia_prayer_activity" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_prayer_activity_insert" BEFORE INSERT ON "koinonia_prayer_activity" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_prayer_activity_update" BEFORE UPDATE ON "koinonia_prayer_activity" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_prayer_reports_delete" BEFORE DELETE ON "koinonia_prayer_reports" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_prayer_reports_insert" BEFORE INSERT ON "koinonia_prayer_reports" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_prayer_reports_update" BEFORE UPDATE ON "koinonia_prayer_reports" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_prayer_requests_delete" BEFORE DELETE ON "koinonia_prayer_requests" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_prayer_requests_insert" BEFORE INSERT ON "koinonia_prayer_requests" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_prayer_requests_update" BEFORE UPDATE ON "koinonia_prayer_requests" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_prayer_settings_delete" BEFORE DELETE ON "koinonia_prayer_settings" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_prayer_settings_insert" BEFORE INSERT ON "koinonia_prayer_settings" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_prayer_settings_update" BEFORE UPDATE ON "koinonia_prayer_settings" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_prayer_views_delete" BEFORE DELETE ON "koinonia_prayer_views" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_prayer_views_insert" BEFORE INSERT ON "koinonia_prayer_views" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_prayer_views_update" BEFORE UPDATE ON "koinonia_prayer_views" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_signup_activity_delete" BEFORE DELETE ON "koinonia_signup_activity" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_signup_activity_insert" BEFORE INSERT ON "koinonia_signup_activity" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_signup_activity_update" BEFORE UPDATE ON "koinonia_signup_activity" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_signup_coverage_requests_delete" BEFORE DELETE ON "koinonia_signup_coverage_requests" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_signup_coverage_requests_insert" BEFORE INSERT ON "koinonia_signup_coverage_requests" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_signup_coverage_requests_update" BEFORE UPDATE ON "koinonia_signup_coverage_requests" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_signup_entries_delete" BEFORE DELETE ON "koinonia_signup_entries" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_signup_entries_insert" BEFORE INSERT ON "koinonia_signup_entries" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_signup_entries_update" BEFORE UPDATE ON "koinonia_signup_entries" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_signup_notification_log_delete" BEFORE DELETE ON "koinonia_signup_notification_log" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD."entry_id" IN (SELECT p."id" FROM "koinonia_signup_entries" p WHERE p.parish_id = c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_signup_notification_log_insert" BEFORE INSERT ON "koinonia_signup_notification_log" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((NEW."entry_id" IN (SELECT p."id" FROM "koinonia_signup_entries" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "koinonia_signup_entries" p WHERE p."id"=NEW."entry_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_signup_notification_log_update" BEFORE UPDATE ON "koinonia_signup_notification_log" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((OLD."entry_id" IN (SELECT p."id" FROM "koinonia_signup_entries" p WHERE p.parish_id = c.parish_id)) OR (NEW."entry_id" IN (SELECT p."id" FROM "koinonia_signup_entries" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "koinonia_signup_entries" p WHERE p."id"=NEW."entry_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_signup_service_records_delete" BEFORE DELETE ON "koinonia_signup_service_records" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_signup_service_records_insert" BEFORE INSERT ON "koinonia_signup_service_records" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_signup_service_records_update" BEFORE UPDATE ON "koinonia_signup_service_records" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_signup_sheets_delete" BEFORE DELETE ON "koinonia_signup_sheets" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_signup_sheets_insert" BEFORE INSERT ON "koinonia_signup_sheets" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_signup_sheets_update" BEFORE UPDATE ON "koinonia_signup_sheets" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_signup_slots_delete" BEFORE DELETE ON "koinonia_signup_slots" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_signup_slots_insert" BEFORE INSERT ON "koinonia_signup_slots" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_signup_slots_update" BEFORE UPDATE ON "koinonia_signup_slots" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_signup_templates_delete" BEFORE DELETE ON "koinonia_signup_templates" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_signup_templates_insert" BEFORE INSERT ON "koinonia_signup_templates" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_signup_templates_update" BEFORE UPDATE ON "koinonia_signup_templates" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_signup_waitlist_delete" BEFORE DELETE ON "koinonia_signup_waitlist" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_signup_waitlist_insert" BEFORE INSERT ON "koinonia_signup_waitlist" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_koinonia_signup_waitlist_update" BEFORE UPDATE ON "koinonia_signup_waitlist" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_legal_acceptances_delete" BEFORE DELETE ON "legal_acceptances" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.organization_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_legal_acceptances_insert" BEFORE INSERT ON "legal_acceptances" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.organization_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_legal_acceptances_update" BEFORE UPDATE ON "legal_acceptances" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.organization_id = c.parish_id) OR (NEW.organization_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_manual_income_entries_delete" BEFORE DELETE ON "manual_income_entries" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_manual_income_entries_insert" BEFORE INSERT ON "manual_income_entries" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_manual_income_entries_update" BEFORE UPDATE ON "manual_income_entries" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_membership_capabilities_delete" BEFORE DELETE ON "membership_capabilities" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD."membership_id" IN (SELECT p."id" FROM "parish_memberships" p WHERE p.parish_id = c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_membership_capabilities_insert" BEFORE INSERT ON "membership_capabilities" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((NEW."membership_id" IN (SELECT p."id" FROM "parish_memberships" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "parish_memberships" p WHERE p."id"=NEW."membership_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_membership_capabilities_update" BEFORE UPDATE ON "membership_capabilities" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((OLD."membership_id" IN (SELECT p."id" FROM "parish_memberships" p WHERE p.parish_id = c.parish_id)) OR (NEW."membership_id" IN (SELECT p."id" FROM "parish_memberships" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "parish_memberships" p WHERE p."id"=NEW."membership_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_membership_invitations_delete" BEFORE DELETE ON "membership_invitations" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_membership_invitations_insert" BEFORE INSERT ON "membership_invitations" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_membership_invitations_update" BEFORE UPDATE ON "membership_invitations" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_nonprofit_pricing_applications_delete" BEFORE DELETE ON "nonprofit_pricing_applications" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_nonprofit_pricing_applications_insert" BEFORE INSERT ON "nonprofit_pricing_applications" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_nonprofit_pricing_applications_update" BEFORE UPDATE ON "nonprofit_pricing_applications" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_nonprofit_pricing_audit_log_delete" BEFORE DELETE ON "nonprofit_pricing_audit_log" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_nonprofit_pricing_audit_log_insert" BEFORE INSERT ON "nonprofit_pricing_audit_log" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_nonprofit_pricing_audit_log_update" BEFORE UPDATE ON "nonprofit_pricing_audit_log" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_nonprofit_pricing_documents_delete" BEFORE DELETE ON "nonprofit_pricing_documents" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD."application_id" IN (SELECT p."id" FROM "nonprofit_pricing_applications" p WHERE p.parish_id = c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_nonprofit_pricing_documents_insert" BEFORE INSERT ON "nonprofit_pricing_documents" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((NEW."application_id" IN (SELECT p."id" FROM "nonprofit_pricing_applications" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "nonprofit_pricing_applications" p WHERE p."id"=NEW."application_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_nonprofit_pricing_documents_update" BEFORE UPDATE ON "nonprofit_pricing_documents" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((OLD."application_id" IN (SELECT p."id" FROM "nonprofit_pricing_applications" p WHERE p.parish_id = c.parish_id)) OR (NEW."application_id" IN (SELECT p."id" FROM "nonprofit_pricing_applications" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "nonprofit_pricing_applications" p WHERE p."id"=NEW."application_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_nonprofit_pricing_threshold_alerts_delete" BEFORE DELETE ON "nonprofit_pricing_threshold_alerts" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_nonprofit_pricing_threshold_alerts_insert" BEFORE INSERT ON "nonprofit_pricing_threshold_alerts" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_nonprofit_pricing_threshold_alerts_update" BEFORE UPDATE ON "nonprofit_pricing_threshold_alerts" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_announcement_digest_subscriptions_delete" BEFORE DELETE ON "parish_announcement_digest_subscriptions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_announcement_digest_subscriptions_insert" BEFORE INSERT ON "parish_announcement_digest_subscriptions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_announcement_digest_subscriptions_update" BEFORE UPDATE ON "parish_announcement_digest_subscriptions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_announcements_delete" BEFORE DELETE ON "parish_announcements" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_announcements_insert" BEFORE INSERT ON "parish_announcements" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_announcements_update" BEFORE UPDATE ON "parish_announcements" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_bulletins_delete" BEFORE DELETE ON "parish_bulletins" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_bulletins_insert" BEFORE INSERT ON "parish_bulletins" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_bulletins_update" BEFORE UPDATE ON "parish_bulletins" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_bulletin_troparia_delete" BEFORE DELETE ON "parish_bulletin_troparia" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_bulletin_troparia_insert" BEFORE INSERT ON "parish_bulletin_troparia" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_bulletin_troparia_update" BEFORE UPDATE ON "parish_bulletin_troparia" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_availability_blackouts_delete" BEFORE DELETE ON "parish_availability_blackouts" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_availability_blackouts_insert" BEFORE INSERT ON "parish_availability_blackouts" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_availability_blackouts_update" BEFORE UPDATE ON "parish_availability_blackouts" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_availability_rules_delete" BEFORE DELETE ON "parish_availability_rules" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_availability_rules_insert" BEFORE INSERT ON "parish_availability_rules" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_availability_rules_update" BEFORE UPDATE ON "parish_availability_rules" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_blog_feeds_delete" BEFORE DELETE ON "parish_blog_feeds" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_blog_feeds_insert" BEFORE INSERT ON "parish_blog_feeds" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_blog_feeds_update" BEFORE UPDATE ON "parish_blog_feeds" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_commerce_permissions_delete" BEFORE DELETE ON "parish_commerce_permissions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_commerce_permissions_insert" BEFORE INSERT ON "parish_commerce_permissions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_commerce_permissions_update" BEFORE UPDATE ON "parish_commerce_permissions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_commerce_receipt_sequences_delete" BEFORE DELETE ON "parish_commerce_receipt_sequences" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_commerce_receipt_sequences_insert" BEFORE INSERT ON "parish_commerce_receipt_sequences" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_commerce_receipt_sequences_update" BEFORE UPDATE ON "parish_commerce_receipt_sequences" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_content_reads_delete" BEFORE DELETE ON "parish_content_reads" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_content_reads_insert" BEFORE INSERT ON "parish_content_reads" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_content_reads_update" BEFORE UPDATE ON "parish_content_reads" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_email_credentials_delete" BEFORE DELETE ON "parish_email_credentials" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_email_credentials_insert" BEFORE INSERT ON "parish_email_credentials" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_email_credentials_update" BEFORE UPDATE ON "parish_email_credentials" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_feature_request_dismissals_delete" BEFORE DELETE ON "parish_feature_request_dismissals" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_feature_request_dismissals_insert" BEFORE INSERT ON "parish_feature_request_dismissals" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_feature_request_dismissals_update" BEFORE UPDATE ON "parish_feature_request_dismissals" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_feature_requests_delete" BEFORE DELETE ON "parish_feature_requests" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_feature_requests_insert" BEFORE INSERT ON "parish_feature_requests" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_feature_requests_update" BEFORE UPDATE ON "parish_feature_requests" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_group_messages_delete" BEFORE DELETE ON "parish_group_messages" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_group_messages_insert" BEFORE INSERT ON "parish_group_messages" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_group_messages_update" BEFORE UPDATE ON "parish_group_messages" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_library_resources_delete" BEFORE DELETE ON "parish_library_resources" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_library_resources_insert" BEFORE INSERT ON "parish_library_resources" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_library_resources_update" BEFORE UPDATE ON "parish_library_resources" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_library_settings_delete" BEFORE DELETE ON "parish_library_settings" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_library_settings_insert" BEFORE INSERT ON "parish_library_settings" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_library_settings_update" BEFORE UPDATE ON "parish_library_settings" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_memberships_delete" BEFORE DELETE ON "parish_memberships" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_memberships_insert" BEFORE INSERT ON "parish_memberships" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_memberships_update" BEFORE UPDATE ON "parish_memberships" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_stewardship_settings_delete" BEFORE DELETE ON "parish_stewardship_settings" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_stewardship_settings_insert" BEFORE INSERT ON "parish_stewardship_settings" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_stewardship_settings_update" BEFORE UPDATE ON "parish_stewardship_settings" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_weekly_headcounts_delete" BEFORE DELETE ON "parish_weekly_headcounts" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_weekly_headcounts_insert" BEFORE INSERT ON "parish_weekly_headcounts" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_weekly_headcounts_update" BEFORE UPDATE ON "parish_weekly_headcounts" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_teaching_posts_delete" BEFORE DELETE ON "parish_teaching_posts" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_teaching_posts_insert" BEFORE INSERT ON "parish_teaching_posts" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_teaching_posts_update" BEFORE UPDATE ON "parish_teaching_posts" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_video_posts_delete" BEFORE DELETE ON "parish_video_posts" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_video_posts_insert" BEFORE INSERT ON "parish_video_posts" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_video_posts_update" BEFORE UPDATE ON "parish_video_posts" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_youtube_channels_delete" BEFORE DELETE ON "parish_youtube_channels" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_youtube_channels_insert" BEFORE INSERT ON "parish_youtube_channels" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_youtube_channels_update" BEFORE UPDATE ON "parish_youtube_channels" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_youtube_links_delete" BEFORE DELETE ON "parish_youtube_links" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_youtube_links_insert" BEFORE INSERT ON "parish_youtube_links" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_parish_youtube_links_update" BEFORE UPDATE ON "parish_youtube_links" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_privileged_mfa_profiles_delete" BEFORE DELETE ON "privileged_mfa_profiles" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.principal_type = 'parish_admin' AND OLD.principal_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_privileged_mfa_profiles_insert" BEFORE INSERT ON "privileged_mfa_profiles" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.principal_type = 'parish_admin' AND NEW.principal_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_privileged_mfa_profiles_update" BEFORE UPDATE ON "privileged_mfa_profiles" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.principal_type = 'parish_admin' AND OLD.principal_id = c.parish_id) OR (NEW.principal_type = 'parish_admin' AND NEW.principal_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_privileged_mfa_transactions_delete" BEFORE DELETE ON "privileged_mfa_transactions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.principal_type = 'parish_admin' AND OLD.principal_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_privileged_mfa_transactions_insert" BEFORE INSERT ON "privileged_mfa_transactions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.principal_type = 'parish_admin' AND NEW.principal_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_privileged_mfa_transactions_update" BEFORE UPDATE ON "privileged_mfa_transactions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.principal_type = 'parish_admin' AND OLD.principal_id = c.parish_id) OR (NEW.principal_type = 'parish_admin' AND NEW.principal_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_privileged_webauthn_credentials_delete" BEFORE DELETE ON "privileged_webauthn_credentials" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.principal_type = 'parish_admin' AND OLD.principal_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_privileged_webauthn_credentials_insert" BEFORE INSERT ON "privileged_webauthn_credentials" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.principal_type = 'parish_admin' AND NEW.principal_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_privileged_webauthn_credentials_update" BEFORE UPDATE ON "privileged_webauthn_credentials" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.principal_type = 'parish_admin' AND OLD.principal_id = c.parish_id) OR (NEW.principal_type = 'parish_admin' AND NEW.principal_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_push_subscriptions_delete" BEFORE DELETE ON "push_subscriptions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_push_subscriptions_insert" BEFORE INSERT ON "push_subscriptions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_push_subscriptions_update" BEFORE UPDATE ON "push_subscriptions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_registrations_delete" BEFORE DELETE ON "registrations" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_registrations_insert" BEFORE INSERT ON "registrations" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_registrations_update" BEFORE UPDATE ON "registrations" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (NOT (c.state='deleting' AND NEW.reference=OLD.reference AND NEW.parish_id=OLD.parish_id AND NEW.status='closed' AND NEW.parish_name IS NULL AND NEW.community_type IS NULL AND NEW.stripe_account_id IS OLD.stripe_account_id AND NEW.stripe_subscription_id IS OLD.stripe_subscription_id AND NEW.received_at IS OLD.received_at AND NEW.data=json_object('parishId',OLD.parish_id,'status','closed'))) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_sacrament_baptism_details_delete" BEFORE DELETE ON "sacrament_baptism_details" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD."request_id" IN (SELECT p."id" FROM "sacrament_requests" p WHERE p.parish_id = c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_sacrament_baptism_details_insert" BEFORE INSERT ON "sacrament_baptism_details" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((NEW."request_id" IN (SELECT p."id" FROM "sacrament_requests" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "sacrament_requests" p WHERE p."id"=NEW."request_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_sacrament_baptism_details_update" BEFORE UPDATE ON "sacrament_baptism_details" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((OLD."request_id" IN (SELECT p."id" FROM "sacrament_requests" p WHERE p.parish_id = c.parish_id)) OR (NEW."request_id" IN (SELECT p."id" FROM "sacrament_requests" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "sacrament_requests" p WHERE p."id"=NEW."request_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_sacrament_requests_delete" BEFORE DELETE ON "sacrament_requests" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_sacrament_requests_insert" BEFORE INSERT ON "sacrament_requests" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_sacrament_requests_update" BEFORE UPDATE ON "sacrament_requests" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_sacrament_wedding_details_delete" BEFORE DELETE ON "sacrament_wedding_details" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD."request_id" IN (SELECT p."id" FROM "sacrament_requests" p WHERE p.parish_id = c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_sacrament_wedding_details_insert" BEFORE INSERT ON "sacrament_wedding_details" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((NEW."request_id" IN (SELECT p."id" FROM "sacrament_requests" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "sacrament_requests" p WHERE p."id"=NEW."request_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_sacrament_wedding_details_update" BEFORE UPDATE ON "sacrament_wedding_details" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((OLD."request_id" IN (SELECT p."id" FROM "sacrament_requests" p WHERE p.parish_id = c.parish_id)) OR (NEW."request_id" IN (SELECT p."id" FROM "sacrament_requests" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "sacrament_requests" p WHERE p."id"=NEW."request_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_settlement_profile_modules_delete" BEFORE DELETE ON "settlement_profile_modules" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_settlement_profile_modules_insert" BEFORE INSERT ON "settlement_profile_modules" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_settlement_profile_modules_update" BEFORE UPDATE ON "settlement_profile_modules" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_settlement_profiles_delete" BEFORE DELETE ON "settlement_profiles" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_settlement_profiles_insert" BEFORE INSERT ON "settlement_profiles" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_settlement_profiles_update" BEFORE UPDATE ON "settlement_profiles" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_sms_keywords_delete" BEFORE DELETE ON "sms_keywords" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_sms_keywords_insert" BEFORE INSERT ON "sms_keywords" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_sms_keywords_update" BEFORE UPDATE ON "sms_keywords" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_agenda_items_delete" BEFORE DELETE ON "stewardship_agenda_items" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD."annual_meeting_id" IN (SELECT p."id" FROM "stewardship_annual_meetings" p WHERE p.parish_id = c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_agenda_items_insert" BEFORE INSERT ON "stewardship_agenda_items" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((NEW."annual_meeting_id" IN (SELECT p."id" FROM "stewardship_annual_meetings" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "stewardship_annual_meetings" p WHERE p."id"=NEW."annual_meeting_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_agenda_items_update" BEFORE UPDATE ON "stewardship_agenda_items" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((OLD."annual_meeting_id" IN (SELECT p."id" FROM "stewardship_annual_meetings" p WHERE p.parish_id = c.parish_id)) OR (NEW."annual_meeting_id" IN (SELECT p."id" FROM "stewardship_annual_meetings" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "stewardship_annual_meetings" p WHERE p."id"=NEW."annual_meeting_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_annual_meetings_delete" BEFORE DELETE ON "stewardship_annual_meetings" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_annual_meetings_insert" BEFORE INSERT ON "stewardship_annual_meetings" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_annual_meetings_update" BEFORE UPDATE ON "stewardship_annual_meetings" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_authoritative_financial_snapshots_delete" BEFORE DELETE ON "stewardship_authoritative_financial_snapshots" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_authoritative_financial_snapshots_insert" BEFORE INSERT ON "stewardship_authoritative_financial_snapshots" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_authoritative_financial_snapshots_update" BEFORE UPDATE ON "stewardship_authoritative_financial_snapshots" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_financial_snapshot_revisions_delete" BEFORE DELETE ON "stewardship_financial_snapshot_revisions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_financial_snapshot_revisions_insert" BEFORE INSERT ON "stewardship_financial_snapshot_revisions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_financial_snapshot_revisions_update" BEFORE UPDATE ON "stewardship_financial_snapshot_revisions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_financial_summaries_delete" BEFORE DELETE ON "stewardship_financial_summaries" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD."annual_meeting_id" IN (SELECT p."id" FROM "stewardship_annual_meetings" p WHERE p.parish_id = c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_financial_summaries_insert" BEFORE INSERT ON "stewardship_financial_summaries" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((NEW."annual_meeting_id" IN (SELECT p."id" FROM "stewardship_annual_meetings" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "stewardship_annual_meetings" p WHERE p."id"=NEW."annual_meeting_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_financial_summaries_update" BEFORE UPDATE ON "stewardship_financial_summaries" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((OLD."annual_meeting_id" IN (SELECT p."id" FROM "stewardship_annual_meetings" p WHERE p.parish_id = c.parish_id)) OR (NEW."annual_meeting_id" IN (SELECT p."id" FROM "stewardship_annual_meetings" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "stewardship_annual_meetings" p WHERE p."id"=NEW."annual_meeting_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_generated_packets_delete" BEFORE DELETE ON "stewardship_generated_packets" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD."annual_meeting_id" IN (SELECT p."id" FROM "stewardship_annual_meetings" p WHERE p.parish_id = c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_generated_packets_insert" BEFORE INSERT ON "stewardship_generated_packets" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((NEW."annual_meeting_id" IN (SELECT p."id" FROM "stewardship_annual_meetings" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "stewardship_annual_meetings" p WHERE p."id"=NEW."annual_meeting_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_generated_packets_update" BEFORE UPDATE ON "stewardship_generated_packets" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((OLD."annual_meeting_id" IN (SELECT p."id" FROM "stewardship_annual_meetings" p WHERE p.parish_id = c.parish_id)) OR (NEW."annual_meeting_id" IN (SELECT p."id" FROM "stewardship_annual_meetings" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "stewardship_annual_meetings" p WHERE p."id"=NEW."annual_meeting_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_nominees_delete" BEFORE DELETE ON "stewardship_nominees" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD."annual_meeting_id" IN (SELECT p."id" FROM "stewardship_annual_meetings" p WHERE p.parish_id = c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_nominees_insert" BEFORE INSERT ON "stewardship_nominees" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((NEW."annual_meeting_id" IN (SELECT p."id" FROM "stewardship_annual_meetings" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "stewardship_annual_meetings" p WHERE p."id"=NEW."annual_meeting_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_nominees_update" BEFORE UPDATE ON "stewardship_nominees" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((OLD."annual_meeting_id" IN (SELECT p."id" FROM "stewardship_annual_meetings" p WHERE p.parish_id = c.parish_id)) OR (NEW."annual_meeting_id" IN (SELECT p."id" FROM "stewardship_annual_meetings" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "stewardship_annual_meetings" p WHERE p."id"=NEW."annual_meeting_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_reports_delete" BEFORE DELETE ON "stewardship_reports" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD."annual_meeting_id" IN (SELECT p."id" FROM "stewardship_annual_meetings" p WHERE p.parish_id = c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_reports_insert" BEFORE INSERT ON "stewardship_reports" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((NEW."annual_meeting_id" IN (SELECT p."id" FROM "stewardship_annual_meetings" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "stewardship_annual_meetings" p WHERE p."id"=NEW."annual_meeting_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_reports_update" BEFORE UPDATE ON "stewardship_reports" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((OLD."annual_meeting_id" IN (SELECT p."id" FROM "stewardship_annual_meetings" p WHERE p.parish_id = c.parish_id)) OR (NEW."annual_meeting_id" IN (SELECT p."id" FROM "stewardship_annual_meetings" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "stewardship_annual_meetings" p WHERE p."id"=NEW."annual_meeting_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_resolutions_delete" BEFORE DELETE ON "stewardship_resolutions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD."annual_meeting_id" IN (SELECT p."id" FROM "stewardship_annual_meetings" p WHERE p.parish_id = c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_resolutions_insert" BEFORE INSERT ON "stewardship_resolutions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((NEW."annual_meeting_id" IN (SELECT p."id" FROM "stewardship_annual_meetings" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "stewardship_annual_meetings" p WHERE p."id"=NEW."annual_meeting_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_resolutions_update" BEFORE UPDATE ON "stewardship_resolutions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((OLD."annual_meeting_id" IN (SELECT p."id" FROM "stewardship_annual_meetings" p WHERE p.parish_id = c.parish_id)) OR (NEW."annual_meeting_id" IN (SELECT p."id" FROM "stewardship_annual_meetings" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "stewardship_annual_meetings" p WHERE p."id"=NEW."annual_meeting_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_restricted_fund_snapshots_delete" BEFORE DELETE ON "stewardship_restricted_fund_snapshots" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD."annual_meeting_id" IN (SELECT p."id" FROM "stewardship_annual_meetings" p WHERE p.parish_id = c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_restricted_fund_snapshots_insert" BEFORE INSERT ON "stewardship_restricted_fund_snapshots" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((NEW."annual_meeting_id" IN (SELECT p."id" FROM "stewardship_annual_meetings" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "stewardship_annual_meetings" p WHERE p."id"=NEW."annual_meeting_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stewardship_restricted_fund_snapshots_update" BEFORE UPDATE ON "stewardship_restricted_fund_snapshots" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((OLD."annual_meeting_id" IN (SELECT p."id" FROM "stewardship_annual_meetings" p WHERE p.parish_id = c.parish_id)) OR (NEW."annual_meeting_id" IN (SELECT p."id" FROM "stewardship_annual_meetings" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "stewardship_annual_meetings" p WHERE p."id"=NEW."annual_meeting_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stripe_payment_volume_records_delete" BEFORE DELETE ON "stripe_payment_volume_records" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stripe_payment_volume_records_insert" BEFORE INSERT ON "stripe_payment_volume_records" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stripe_payment_volume_records_update" BEFORE UPDATE ON "stripe_payment_volume_records" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stripe_payment_volume_scans_delete" BEFORE DELETE ON "stripe_payment_volume_scans" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stripe_payment_volume_scans_insert" BEFORE INSERT ON "stripe_payment_volume_scans" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_stripe_payment_volume_scans_update" BEFORE UPDATE ON "stripe_payment_volume_scans" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_subscription_early_adopter_slots_delete" BEFORE DELETE ON "subscription_early_adopter_slots" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (c.state IN ('preparing','closed')) AND ((OLD."registration_reference" IN (SELECT p."reference" FROM "registrations" p WHERE p.parish_id = c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_subscription_early_adopter_slots_insert" BEFORE INSERT ON "subscription_early_adopter_slots" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((NEW."registration_reference" IN (SELECT p."reference" FROM "registrations" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "registrations" p WHERE p."reference"=NEW."registration_reference"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_subscription_early_adopter_slots_update" BEFORE UPDATE ON "subscription_early_adopter_slots" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((OLD."registration_reference" IN (SELECT p."reference" FROM "registrations" p WHERE p.parish_id = c.parish_id)) OR (NEW."registration_reference" IN (SELECT p."reference" FROM "registrations" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "registrations" p WHERE p."reference"=NEW."registration_reference"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_tax_exemption_audit_log_delete" BEFORE DELETE ON "tax_exemption_audit_log" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD."registration_reference" IN (SELECT p."reference" FROM "registrations" p WHERE p.parish_id = c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_tax_exemption_audit_log_insert" BEFORE INSERT ON "tax_exemption_audit_log" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((NEW."registration_reference" IN (SELECT p."reference" FROM "registrations" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "registrations" p WHERE p."reference"=NEW."registration_reference"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_tax_exemption_audit_log_update" BEFORE UPDATE ON "tax_exemption_audit_log" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((OLD."registration_reference" IN (SELECT p."reference" FROM "registrations" p WHERE p.parish_id = c.parish_id)) OR (NEW."registration_reference" IN (SELECT p."reference" FROM "registrations" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "registrations" p WHERE p."reference"=NEW."registration_reference"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_tax_exemption_documents_delete" BEFORE DELETE ON "tax_exemption_documents" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD."registration_reference" IN (SELECT p."reference" FROM "registrations" p WHERE p.parish_id = c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_tax_exemption_documents_insert" BEFORE INSERT ON "tax_exemption_documents" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((NEW."registration_reference" IN (SELECT p."reference" FROM "registrations" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "registrations" p WHERE p."reference"=NEW."registration_reference"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_tax_exemption_documents_update" BEFORE UPDATE ON "tax_exemption_documents" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((OLD."registration_reference" IN (SELECT p."reference" FROM "registrations" p WHERE p.parish_id = c.parish_id)) OR (NEW."registration_reference" IN (SELECT p."reference" FROM "registrations" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "registrations" p WHERE p."reference"=NEW."registration_reference"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_tax_exemption_notes_delete" BEFORE DELETE ON "tax_exemption_notes" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD."tax_exemption_id" IN (SELECT p."id" FROM "tax_exemptions" p WHERE p.parish_id = c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_tax_exemption_notes_insert" BEFORE INSERT ON "tax_exemption_notes" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((NEW."tax_exemption_id" IN (SELECT p."id" FROM "tax_exemptions" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "tax_exemptions" p WHERE p."id"=NEW."tax_exemption_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_tax_exemption_notes_update" BEFORE UPDATE ON "tax_exemption_notes" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((OLD."tax_exemption_id" IN (SELECT p."id" FROM "tax_exemptions" p WHERE p.parish_id = c.parish_id)) OR (NEW."tax_exemption_id" IN (SELECT p."id" FROM "tax_exemptions" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "tax_exemptions" p WHERE p."id"=NEW."tax_exemption_id"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_tax_exemption_stripe_syncs_delete" BEFORE DELETE ON "tax_exemption_stripe_syncs" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD."registration_reference" IN (SELECT p."reference" FROM "registrations" p WHERE p.parish_id = c.parish_id)))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_tax_exemption_stripe_syncs_insert" BEFORE INSERT ON "tax_exemption_stripe_syncs" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((NEW."registration_reference" IN (SELECT p."reference" FROM "registrations" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "registrations" p WHERE p."reference"=NEW."registration_reference"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_tax_exemption_stripe_syncs_update" BEFORE UPDATE ON "tax_exemption_stripe_syncs" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND (((OLD."registration_reference" IN (SELECT p."reference" FROM "registrations" p WHERE p.parish_id = c.parish_id)) OR (NEW."registration_reference" IN (SELECT p."reference" FROM "registrations" p WHERE p.parish_id = c.parish_id))) OR NOT EXISTS(SELECT 1 FROM "registrations" p WHERE p."reference"=NEW."registration_reference"))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_tax_exemptions_delete" BEFORE DELETE ON "tax_exemptions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_tax_exemptions_insert" BEFORE INSERT ON "tax_exemptions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
CREATE TRIGGER "portability_tax_exemptions_update" BEFORE UPDATE ON "tax_exemptions" WHEN EXISTS(SELECT 1 FROM parish_data_closures c WHERE (1=1) AND ((OLD.parish_id = c.parish_id) OR (NEW.parish_id = c.parish_id))) BEGIN SELECT RAISE(ABORT,'PARISH_CLOSURE_WRITE_BLOCKED'); END;
