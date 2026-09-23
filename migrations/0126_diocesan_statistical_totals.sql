CREATE TABLE IF NOT EXISTS parish_diocesan_statistical_totals (
  parish_id TEXT NOT NULL,
  reporting_year INTEGER NOT NULL CHECK (reporting_year BETWEEN 2000 AND 2100),
  totals_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (parish_id, reporting_year)
);
