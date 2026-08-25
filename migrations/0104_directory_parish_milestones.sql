-- Directory milestones surfaced to authorized parish members in Koinonia.
-- Birthdays continue to use directory_people.date_of_birth. Anniversary
-- visibility is stored by the existing field privacy preference system.

ALTER TABLE directory_households ADD COLUMN anniversary_date TEXT;

CREATE INDEX IF NOT EXISTS idx_directory_households_anniversary
  ON directory_households(parish_id, anniversary_date, active);
