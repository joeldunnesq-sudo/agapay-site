-- AGAPAY Parish Directory Phase 1B -- Contact Information, Privacy Model,
-- Publication Foundation, and Parish Directory Settings.

CREATE TABLE IF NOT EXISTS directory_contact_methods (
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

CREATE INDEX IF NOT EXISTS idx_directory_contact_methods_owner
  ON directory_contact_methods(owner_type, owner_id, contact_type, active);

CREATE INDEX IF NOT EXISTS idx_directory_contact_methods_parish
  ON directory_contact_methods(parish_id, contact_type, active);

CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_contact_primary_active
  ON directory_contact_methods(owner_type, owner_id, contact_type)
  WHERE active = 1 AND is_primary = 1;

CREATE TABLE IF NOT EXISTS directory_addresses (
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

CREATE INDEX IF NOT EXISTS idx_directory_addresses_owner
  ON directory_addresses(owner_type, owner_id, active);

CREATE INDEX IF NOT EXISTS idx_directory_addresses_parish
  ON directory_addresses(parish_id, active, protected_address);

CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_address_primary_active
  ON directory_addresses(owner_type, owner_id, address_type)
  WHERE active = 1 AND is_primary = 1;

CREATE TABLE IF NOT EXISTS directory_field_privacy_preferences (
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

CREATE INDEX IF NOT EXISTS idx_directory_field_privacy_owner
  ON directory_field_privacy_preferences(parish_id, owner_type, owner_id, active);

CREATE TABLE IF NOT EXISTS directory_person_privacy_flags (
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

CREATE INDEX IF NOT EXISTS idx_directory_person_privacy_flags_person
  ON directory_person_privacy_flags(person_id, parish_id, active);

CREATE TABLE IF NOT EXISTS directory_publication_profiles (
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

CREATE INDEX IF NOT EXISTS idx_directory_publication_profiles_owner
  ON directory_publication_profiles(parish_id, owner_type, owner_id, active);

CREATE INDEX IF NOT EXISTS idx_directory_publication_profiles_status
  ON directory_publication_profiles(parish_id, status, active);

CREATE TABLE IF NOT EXISTS directory_parish_settings (
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
);
