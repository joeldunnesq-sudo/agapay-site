CREATE TABLE IF NOT EXISTS parish_relationship_snapshots (
  day TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS parish_milestone_preferences (
  reference TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS parish_milestone_deliveries (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL,
  kind TEXT NOT NULL,
  occasion_date TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_parish_milestone_deliveries_date ON parish_milestone_deliveries(occasion_date);
