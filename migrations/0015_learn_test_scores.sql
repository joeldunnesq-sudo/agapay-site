CREATE TABLE IF NOT EXISTS learn_test_scores (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  test_type TEXT NOT NULL CHECK (test_type IN ('ACT', 'SAT')),
  test_date TEXT,
  composite_score REAL,       -- ACT composite (0-36)
  total_score REAL,           -- SAT total (400-1600)
  english_score REAL,         -- ACT section
  math_score REAL,            -- ACT section, or SAT Math section
  reading_score REAL,         -- ACT section
  science_score REAL,         -- ACT section
  writing_score REAL,         -- ACT optional section
  reading_writing_score REAL, -- SAT Reading & Writing section
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (household_id) REFERENCES learn_households(id) ON DELETE CASCADE,
  FOREIGN KEY (child_id) REFERENCES learn_children(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_learn_test_scores_household_child
  ON learn_test_scores(household_id, child_id);
