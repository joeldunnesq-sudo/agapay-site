-- Migration 0033: Household name days for Directory self-service.

CREATE TABLE IF NOT EXISTS directory_household_namedays (
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

CREATE INDEX IF NOT EXISTS idx_directory_household_namedays_household
  ON directory_household_namedays(parish_id, household_id, active, feast_month_day);

CREATE INDEX IF NOT EXISTS idx_directory_household_namedays_today
  ON directory_household_namedays(parish_id, feast_month_day, visibility, active);
