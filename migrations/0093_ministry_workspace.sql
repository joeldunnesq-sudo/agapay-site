-- Ministry workspace: schedules, resources, availability, signup coordination and audit.
CREATE TABLE IF NOT EXISTS koinonia_ministry_events (
  id TEXT PRIMARY KEY, parish_id TEXT NOT NULL, ministry_id TEXT NOT NULL REFERENCES directory_ministries(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT, location TEXT, starts_at INTEGER NOT NULL, ends_at INTEGER,
  recurrence_group_id TEXT, created_by_person_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_koinonia_ministry_events_upcoming ON koinonia_ministry_events(parish_id,ministry_id,starts_at);
CREATE TABLE IF NOT EXISTS koinonia_ministry_event_attendance (
  event_id TEXT NOT NULL REFERENCES koinonia_ministry_events(id) ON DELETE CASCADE, person_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('present','absent','excused')), recorded_by_person_id TEXT NOT NULL, recorded_at INTEGER NOT NULL,
  PRIMARY KEY(event_id,person_id)
);
CREATE TABLE IF NOT EXISTS koinonia_ministry_resources (
  id TEXT PRIMARY KEY, parish_id TEXT NOT NULL, ministry_id TEXT NOT NULL REFERENCES directory_ministries(id) ON DELETE CASCADE,
  title TEXT NOT NULL, resource_type TEXT NOT NULL CHECK(resource_type IN ('link','document','checklist','training')),
  url TEXT, notes TEXT, created_by_person_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_koinonia_ministry_resources ON koinonia_ministry_resources(parish_id,ministry_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS koinonia_ministry_availability (
  parish_id TEXT NOT NULL, ministry_id TEXT NOT NULL, person_id TEXT NOT NULL, availability_note TEXT,
  updated_at INTEGER NOT NULL, PRIMARY KEY(parish_id,ministry_id,person_id)
);
CREATE TABLE IF NOT EXISTS koinonia_signup_templates (
  id TEXT PRIMARY KEY, parish_id TEXT NOT NULL, ministry_id TEXT NOT NULL, name TEXT NOT NULL,
  title TEXT NOT NULL, description TEXT, category TEXT NOT NULL, slots_json TEXT NOT NULL,
  created_by_person_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS koinonia_signup_waitlist (
  id TEXT PRIMARY KEY, parish_id TEXT NOT NULL, slot_id TEXT NOT NULL REFERENCES koinonia_signup_slots(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','offered','claimed','withdrawn')),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_koinonia_signup_waiting ON koinonia_signup_waitlist(slot_id,person_id) WHERE status IN ('waiting','offered');
CREATE TABLE IF NOT EXISTS koinonia_signup_coverage_requests (
  id TEXT PRIMARY KEY, parish_id TEXT NOT NULL, entry_id TEXT NOT NULL REFERENCES koinonia_signup_entries(id) ON DELETE CASCADE,
  requester_person_id TEXT NOT NULL, replacement_person_id TEXT, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','accepted','cancelled')),
  note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS koinonia_signup_service_records (
  entry_id TEXT PRIMARY KEY REFERENCES koinonia_signup_entries(id) ON DELETE CASCADE, parish_id TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0, attended INTEGER, completed_by_person_id TEXT, completed_at INTEGER, thanked_at INTEGER
);
CREATE TABLE IF NOT EXISTS koinonia_signup_activity (
  id TEXT PRIMARY KEY, parish_id TEXT NOT NULL, sheet_id TEXT, slot_id TEXT, actor_person_id TEXT NOT NULL,
  action TEXT NOT NULL, summary TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_koinonia_signup_activity ON koinonia_signup_activity(parish_id,sheet_id,created_at DESC);
CREATE TABLE IF NOT EXISTS koinonia_signup_notification_log (
  entry_id TEXT NOT NULL, notification_type TEXT NOT NULL, sent_at INTEGER NOT NULL,
  PRIMARY KEY(entry_id,notification_type)
);
