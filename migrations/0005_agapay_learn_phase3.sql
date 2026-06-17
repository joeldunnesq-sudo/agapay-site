CREATE TABLE IF NOT EXISTS learn_rotations (
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
CREATE INDEX IF NOT EXISTS idx_learn_rotations_household_term
  ON learn_rotations(household_id, term_id, rotation_type);

CREATE TABLE IF NOT EXISTS learn_catechesis_cycles (
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

CREATE TABLE IF NOT EXISTS learn_recitation_tracks (
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
CREATE INDEX IF NOT EXISTS idx_learn_recitation_tracks_household
  ON learn_recitation_tracks(household_id, child_id);

CREATE TABLE IF NOT EXISTS learn_hymn_studies (
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

CREATE TABLE IF NOT EXISTS learn_enrichment_blocks (
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

CREATE TABLE IF NOT EXISTS learn_nature_journal_entries (
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
CREATE INDEX IF NOT EXISTS idx_learn_nature_journal_child
  ON learn_nature_journal_entries(child_id, observed_on DESC);

CREATE TABLE IF NOT EXISTS learn_report_exports (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  export_type TEXT NOT NULL,
  format TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  generated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (household_id) REFERENCES learn_households(id)
);

CREATE TABLE IF NOT EXISTS learn_co_ops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  affiliation TEXT NOT NULL,
  learning_cycle_label TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS learn_co_op_members (
  id TEXT PRIMARY KEY,
  co_op_id TEXT NOT NULL,
  household_name TEXT NOT NULL,
  children_count INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (co_op_id) REFERENCES learn_co_ops(id)
);
CREATE INDEX IF NOT EXISTS idx_learn_co_op_members_co_op_id
  ON learn_co_op_members(co_op_id);

CREATE TABLE IF NOT EXISTS learn_co_op_meetings (
  id TEXT PRIMARY KEY,
  co_op_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  location_label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (co_op_id) REFERENCES learn_co_ops(id)
);

CREATE TABLE IF NOT EXISTS learn_co_op_schedule_blocks (
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

CREATE TABLE IF NOT EXISTS learn_co_op_announcements (
  id TEXT PRIMARY KEY,
  co_op_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  posted_at TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (co_op_id) REFERENCES learn_co_ops(id)
);
