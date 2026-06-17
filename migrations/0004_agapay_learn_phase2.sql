CREATE TABLE IF NOT EXISTS learn_curriculum_subjects (
  id TEXT PRIMARY KEY,
  curriculum_package_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (curriculum_package_id) REFERENCES learn_curriculum_packages(id)
);
CREATE INDEX IF NOT EXISTS idx_learn_curriculum_subjects_package_id
  ON learn_curriculum_subjects(curriculum_package_id, sort_order);

CREATE TABLE IF NOT EXISTS learn_curriculum_resources (
  id TEXT PRIMARY KEY,
  curriculum_package_id TEXT NOT NULL,
  curriculum_subject_id TEXT,
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  resource_type TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (curriculum_package_id) REFERENCES learn_curriculum_packages(id),
  FOREIGN KEY (curriculum_subject_id) REFERENCES learn_curriculum_subjects(id)
);
CREATE INDEX IF NOT EXISTS idx_learn_curriculum_resources_package_id
  ON learn_curriculum_resources(curriculum_package_id);

CREATE TABLE IF NOT EXISTS learn_curriculum_mappings (
  id TEXT PRIMARY KEY,
  curriculum_package_id TEXT NOT NULL,
  curriculum_resource_id TEXT NOT NULL,
  mapping_scope TEXT NOT NULL,
  target_id TEXT NOT NULL,
  cycle_framework_id TEXT,
  cycle_year_id TEXT,
  term_id TEXT,
  priority INTEGER NOT NULL DEFAULT 3,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (curriculum_package_id) REFERENCES learn_curriculum_packages(id),
  FOREIGN KEY (curriculum_resource_id) REFERENCES learn_curriculum_resources(id),
  FOREIGN KEY (cycle_framework_id) REFERENCES learn_cycle_frameworks(id),
  FOREIGN KEY (cycle_year_id) REFERENCES learn_cycle_years(id),
  FOREIGN KEY (term_id) REFERENCES learn_terms(id)
);
CREATE INDEX IF NOT EXISTS idx_learn_curriculum_mappings_package_id
  ON learn_curriculum_mappings(curriculum_package_id, mapping_scope, target_id);

CREATE TABLE IF NOT EXISTS learn_grace_mode_rules (
  id TEXT PRIMARY KEY,
  season_adjustment_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  preserve_church_rhythms INTEGER NOT NULL DEFAULT 1,
  preserve_morning_basket INTEGER NOT NULL DEFAULT 1,
  reduce_priority_threshold INTEGER NOT NULL DEFAULT 4,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (season_adjustment_id) REFERENCES learn_season_adjustments(id)
);
CREATE INDEX IF NOT EXISTS idx_learn_grace_mode_rules_adjustment_id
  ON learn_grace_mode_rules(season_adjustment_id);
