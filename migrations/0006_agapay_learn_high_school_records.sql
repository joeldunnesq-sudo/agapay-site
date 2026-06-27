CREATE TABLE IF NOT EXISTS academic_years (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (household_id) REFERENCES learn_households(id) ON DELETE CASCADE,
  UNIQUE (household_id, name)
);
CREATE INDEX IF NOT EXISTS idx_academic_years_household_id
  ON academic_years(household_id);

CREATE TABLE IF NOT EXISTS courses (
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
CREATE INDEX IF NOT EXISTS idx_courses_household_child_year
  ON courses(household_id, child_id, academic_year_id);
CREATE INDEX IF NOT EXISTS idx_courses_transcript_grouping
  ON courses(child_id, grade_level, subject_category);

CREATE TABLE IF NOT EXISTS grades_and_progress (
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
CREATE INDEX IF NOT EXISTS idx_grades_and_progress_course_term
  ON grades_and_progress(course_id, term_index);
