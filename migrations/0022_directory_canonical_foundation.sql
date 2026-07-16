-- AGAPAY Parish Directory Phase 1A -- Canonical People & Household Foundation.
--
-- This migration creates only the private normalized foundation for people,
-- households, household membership, household administration, external links,
-- and pastoral parish affiliations. It intentionally does not add contact
-- information, publication profiles, photos, skills, imports, exports, search,
-- or member-facing UI state.

CREATE TABLE IF NOT EXISTS directory_people (
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

CREATE INDEX IF NOT EXISTS idx_directory_people_created_by_parish
  ON directory_people(created_by_parish_id);

CREATE INDEX IF NOT EXISTS idx_directory_people_active
  ON directory_people(active);

CREATE TABLE IF NOT EXISTS directory_households (
  id             TEXT    PRIMARY KEY,
  parish_id      TEXT    NOT NULL,
  display_name   TEXT    NOT NULL,
  active         INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_directory_households_parish
  ON directory_households(parish_id, active);

CREATE TABLE IF NOT EXISTS directory_household_members (
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

CREATE INDEX IF NOT EXISTS idx_directory_household_members_household
  ON directory_household_members(household_id, active);

CREATE INDEX IF NOT EXISTS idx_directory_household_members_person
  ON directory_household_members(person_id, active);

CREATE TABLE IF NOT EXISTS directory_household_admins (
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

CREATE INDEX IF NOT EXISTS idx_directory_household_admins_household
  ON directory_household_admins(household_id, active);

CREATE INDEX IF NOT EXISTS idx_directory_household_admins_person
  ON directory_household_admins(person_id, active);

CREATE TABLE IF NOT EXISTS directory_person_links (
  id          TEXT    PRIMARY KEY,
  person_id   TEXT    NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  link_type   TEXT    NOT NULL,
  external_id TEXT    NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE (link_type, external_id),
  UNIQUE (person_id, link_type, external_id)
);

CREATE INDEX IF NOT EXISTS idx_directory_person_links_person
  ON directory_person_links(person_id, active);

CREATE INDEX IF NOT EXISTS idx_directory_person_links_type
  ON directory_person_links(link_type, external_id);

CREATE TABLE IF NOT EXISTS directory_parish_affiliations (
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

CREATE INDEX IF NOT EXISTS idx_directory_parish_affiliations_person
  ON directory_parish_affiliations(person_id, active);

CREATE INDEX IF NOT EXISTS idx_directory_parish_affiliations_parish
  ON directory_parish_affiliations(parish_id, active, status);
