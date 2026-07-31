CREATE TABLE IF NOT EXISTS parish_group_messages (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  ministry_id TEXT NOT NULL REFERENCES directory_ministries(id),
  author_person_id TEXT NOT NULL REFERENCES directory_people(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_parish_group_messages_ministry ON parish_group_messages(parish_id, ministry_id, created_at DESC);
