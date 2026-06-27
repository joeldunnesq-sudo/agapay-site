CREATE TABLE IF NOT EXISTS learn_attendance_days (
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

CREATE INDEX IF NOT EXISTS idx_learn_attendance_household_year_date
  ON learn_attendance_days (household_id, academic_year_id, attendance_date);

CREATE INDEX IF NOT EXISTS idx_learn_attendance_child_year
  ON learn_attendance_days (child_id, academic_year_id);
