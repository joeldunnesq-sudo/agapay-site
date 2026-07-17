-- Migration 0032: Parish Directory Phase 5B -- private skills and service directory.

ALTER TABLE directory_parish_settings ADD COLUMN skills_directory_enabled INTEGER NOT NULL DEFAULT 1 CHECK (skills_directory_enabled IN (0, 1));
ALTER TABLE directory_parish_settings ADD COLUMN skills_member_search_enabled INTEGER NOT NULL DEFAULT 1 CHECK (skills_member_search_enabled IN (0, 1));
ALTER TABLE directory_parish_settings ADD COLUMN skills_staff_only_mode INTEGER NOT NULL DEFAULT 0 CHECK (skills_staff_only_mode IN (0, 1));
ALTER TABLE directory_parish_settings ADD COLUMN skills_custom_entries_enabled INTEGER NOT NULL DEFAULT 1 CHECK (skills_custom_entries_enabled IN (0, 1));
ALTER TABLE directory_parish_settings ADD COLUMN skills_disclaimer_text TEXT NOT NULL DEFAULT 'Skills and experience are self-reported. AGAPAY and the parish do not verify licenses, credentials, insurance, background checks, or suitability.';
ALTER TABLE directory_parish_settings ADD COLUMN skills_contact_fallback TEXT NOT NULL DEFAULT 'Contact the parish office if a direct published contact is unavailable.';
ALTER TABLE directory_parish_settings ADD COLUMN skills_last_reviewed_at INTEGER;
ALTER TABLE directory_parish_settings ADD COLUMN household_verification_interval_days INTEGER NOT NULL DEFAULT 365;

CREATE TABLE IF NOT EXISTS directory_skill_catalog (
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

CREATE INDEX IF NOT EXISTS idx_directory_skill_catalog_scope
  ON directory_skill_catalog(parish_id, is_active, category, sort_order, name);

CREATE TABLE IF NOT EXISTS directory_person_skill_listings (
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

CREATE INDEX IF NOT EXISTS idx_directory_person_skill_search
  ON directory_person_skill_listings(parish_id, status, visibility, skill_id, person_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_person_skill_active
  ON directory_person_skill_listings(parish_id, person_id, skill_id)
  WHERE status IN ('draft', 'active', 'paused', 'hidden_by_parish');

CREATE TABLE IF NOT EXISTS directory_household_verifications (
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

CREATE INDEX IF NOT EXISTS idx_directory_household_verifications_status
  ON directory_household_verifications(parish_id, verification_status, verification_due_at);

INSERT OR IGNORE INTO directory_skill_catalog
  (id, code, name, description, category, is_platform_default, parish_id, is_active, sort_order, created_at, updated_at)
VALUES
  ('skill_carpentry', 'carpentry', 'Carpentry', 'Woodworking, repair, and simple construction help.', 'home_and_repairs', 1, NULL, 1, 10, 0, 0),
  ('skill_plumbing', 'plumbing', 'Plumbing', 'Plumbing knowledge or practical repair help.', 'home_and_repairs', 1, NULL, 1, 20, 0, 0),
  ('skill_electrical', 'electrical', 'Electrical Work', 'Electrical knowledge or practical repair help.', 'home_and_repairs', 1, NULL, 1, 30, 0, 0),
  ('skill_gardening', 'gardening', 'Gardening', 'Gardening, landscaping, or plant care.', 'agriculture_and_outdoors', 1, NULL, 1, 40, 0, 0),
  ('skill_vehicle_repair', 'vehicle_repair', 'Vehicle Repair', 'Vehicle maintenance or repair knowledge.', 'transportation', 1, NULL, 1, 50, 0, 0),
  ('skill_moving_help', 'moving_help', 'Moving Help', 'Packing, lifting, or moving assistance.', 'parish_service', 1, NULL, 1, 60, 0, 0),
  ('skill_cooking', 'cooking', 'Cooking', 'Cooking, meal trains, or food preparation.', 'hospitality_and_food', 1, NULL, 1, 70, 0, 0),
  ('skill_sewing', 'sewing', 'Sewing', 'Sewing, mending, or textile help.', 'arts_and_media', 1, NULL, 1, 80, 0, 0),
  ('skill_transportation', 'transportation', 'Transportation', 'Ride help within the parish community.', 'transportation', 1, NULL, 1, 90, 0, 0),
  ('skill_tutoring', 'tutoring', 'Tutoring', 'Educational help or tutoring.', 'education_and_tutoring', 1, NULL, 1, 100, 0, 0),
  ('skill_translation', 'translation', 'Language Translation', 'Translation or interpretation help.', 'language_and_translation', 1, NULL, 1, 110, 0, 0),
  ('skill_technology_help', 'technology_help', 'Technology Help', 'Computer, phone, software, or setup help.', 'technology', 1, NULL, 1, 120, 0, 0),
  ('skill_bookkeeping', 'bookkeeping', 'Bookkeeping Knowledge', 'Bookkeeping or administrative knowledge.', 'professional_knowledge', 1, NULL, 1, 130, 0, 0),
  ('skill_legal_knowledge', 'legal_knowledge', 'Legal Knowledge', 'General legal knowledge shared as community information.', 'professional_knowledge', 1, NULL, 1, 140, 0, 0),
  ('skill_photography', 'photography', 'Photography', 'Photography or image editing help.', 'arts_and_media', 1, NULL, 1, 150, 0, 0),
  ('skill_elder_assistance', 'elder_assistance', 'Elder Assistance', 'Practical assistance for older parishioners.', 'care_and_assistance', 1, NULL, 1, 160, 0, 0),
  ('skill_parish_workday', 'parish_workday', 'Parish Workday Help', 'General help for parish workdays and projects.', 'parish_service', 1, NULL, 1, 170, 0, 0),
  ('skill_other', 'other', 'Other Practical Service', 'Another voluntary practical skill or service.', 'other', 1, NULL, 1, 900, 0, 0);
