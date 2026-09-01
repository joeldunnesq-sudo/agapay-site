-- Parish-owned weekly attendance for Stewardship Health.
-- Delegation grants entry permission to one active ministry, but attendance
-- history remains attached to the parish when that delegation changes.

ALTER TABLE parish_stewardship_settings
  ADD COLUMN headcount_delegate_ministry_id TEXT;

CREATE TABLE parish_weekly_headcounts (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  week_of TEXT NOT NULL
    CHECK (date(week_of) IS NOT NULL AND week_of = date(week_of) AND strftime('%w', week_of) = '0'),
  headcount INTEGER NOT NULL CHECK (headcount >= 0),
  submitted_by_actor_type TEXT NOT NULL
    CHECK (submitted_by_actor_type IN ('parish_staff', 'ministry_leader')),
  submitted_by_actor_id TEXT NOT NULL,
  submitted_by_ministry_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (submitted_by_actor_type = 'parish_staff' AND submitted_by_ministry_id IS NULL)
    OR
    (submitted_by_actor_type = 'ministry_leader' AND submitted_by_ministry_id IS NOT NULL AND length(trim(submitted_by_ministry_id)) > 0)
  ),
  UNIQUE (parish_id, week_of)
);

CREATE INDEX idx_parish_weekly_headcounts_trend
  ON parish_weekly_headcounts(parish_id, week_of);
