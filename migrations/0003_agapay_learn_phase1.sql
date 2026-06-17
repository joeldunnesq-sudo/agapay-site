CREATE TABLE IF NOT EXISTS learn_households (
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
);

CREATE TABLE IF NOT EXISTS learn_children (
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
CREATE INDEX IF NOT EXISTS idx_learn_children_household_id ON learn_children(household_id);

CREATE TABLE IF NOT EXISTS learn_school_years (
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
CREATE INDEX IF NOT EXISTS idx_learn_school_years_household_id ON learn_school_years(household_id);

CREATE TABLE IF NOT EXISTS learn_terms (
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
CREATE INDEX IF NOT EXISTS idx_learn_terms_school_year_id ON learn_terms(school_year_id);

CREATE TABLE IF NOT EXISTS learn_liturgical_days (
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_learn_liturgical_days_unique_date
  ON learn_liturgical_days(civil_date, calendar_type);

CREATE TABLE IF NOT EXISTS learn_household_streams (
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
CREATE INDEX IF NOT EXISTS idx_learn_household_streams_household_id ON learn_household_streams(household_id);

CREATE TABLE IF NOT EXISTS learn_child_tracks (
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
CREATE INDEX IF NOT EXISTS idx_learn_child_tracks_child_id ON learn_child_tracks(child_id);

CREATE TABLE IF NOT EXISTS learn_lesson_days (
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
CREATE INDEX IF NOT EXISTS idx_learn_lesson_days_household_id ON learn_lesson_days(household_id, civil_date);

CREATE TABLE IF NOT EXISTS learn_household_lesson_blocks (
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
CREATE INDEX IF NOT EXISTS idx_learn_household_blocks_day_id ON learn_household_lesson_blocks(lesson_day_id);

CREATE TABLE IF NOT EXISTS learn_child_lesson_blocks (
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
CREATE INDEX IF NOT EXISTS idx_learn_child_blocks_day_id ON learn_child_lesson_blocks(lesson_day_id);

CREATE TABLE IF NOT EXISTS learn_church_rhythm_practices (
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
CREATE INDEX IF NOT EXISTS idx_learn_church_rhythm_day_id ON learn_church_rhythm_practices(lesson_day_id);

CREATE TABLE IF NOT EXISTS learn_narration_logs (
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
CREATE INDEX IF NOT EXISTS idx_learn_narration_logs_child_id ON learn_narration_logs(child_id, logged_at DESC);

CREATE TABLE IF NOT EXISTS learn_books (
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
CREATE INDEX IF NOT EXISTS idx_learn_books_household_id ON learn_books(household_id);

CREATE TABLE IF NOT EXISTS learn_book_assignments (
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
CREATE INDEX IF NOT EXISTS idx_learn_book_assignments_book_id ON learn_book_assignments(book_id);

CREATE TABLE IF NOT EXISTS learn_cycle_frameworks (
  id TEXT PRIMARY KEY,
  framework_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS learn_cycle_years (
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
CREATE INDEX IF NOT EXISTS idx_learn_cycle_years_framework_id ON learn_cycle_years(cycle_framework_id);

CREATE TABLE IF NOT EXISTS learn_cycle_topics (
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
CREATE INDEX IF NOT EXISTS idx_learn_cycle_topics_cycle_year_id ON learn_cycle_topics(cycle_year_id);

CREATE TABLE IF NOT EXISTS learn_curriculum_packages (
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
CREATE INDEX IF NOT EXISTS idx_learn_curriculum_packages_household_id ON learn_curriculum_packages(household_id);

CREATE TABLE IF NOT EXISTS learn_household_pace_profiles (
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
CREATE INDEX IF NOT EXISTS idx_learn_pace_profiles_household_id ON learn_household_pace_profiles(household_id);

CREATE TABLE IF NOT EXISTS learn_season_adjustments (
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
CREATE INDEX IF NOT EXISTS idx_learn_season_adjustments_household_id ON learn_season_adjustments(household_id, starts_on, ends_on);

CREATE TABLE IF NOT EXISTS learn_print_templates (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  title TEXT NOT NULL,
  template_type TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES learn_households(id)
);

CREATE TABLE IF NOT EXISTS learn_print_jobs (
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

CREATE TABLE IF NOT EXISTS learn_report_cards (
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

CREATE TABLE IF NOT EXISTS learn_transcripts (
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

CREATE TABLE IF NOT EXISTS learn_academic_records (
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
