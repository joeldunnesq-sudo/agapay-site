-- Migration: 0018_sacrament_availability
--
-- Native (no third-party) real-time availability booking for Sacraments &
-- Services. A priest defines recurring weekly windows for the "schedulable"
-- sacrament types (house_blessing, confession, home_visit); a donor picks an
-- open slot and it becomes a normal sacrament_requests row with
-- status='scheduled' and confirmed_date/confirmed_time set immediately --
-- no changes needed to sacrament_requests itself, and no separate booking
-- table. baptism/chrismation/wedding/funeral/memorial_service/other keep
-- the existing free-text request-then-review flow untouched.
--
-- Double-booking is only prevented against other AGAPAY-booked sacraments
-- (no external calendar sync) -- see src/lib/sacrament-availability.js.

CREATE TABLE IF NOT EXISTS parish_availability_rules (
  id             TEXT    PRIMARY KEY,
  parish_id      TEXT    NOT NULL,
  sacrament_type TEXT    NOT NULL,          -- house_blessing | confession | home_visit
  day_of_week    INTEGER NOT NULL,          -- 0=Sunday..6=Saturday, parish-local
  start_time     TEXT    NOT NULL,          -- 'HH:MM' 24h, parish-local
  end_time       TEXT    NOT NULL,
  slot_minutes   INTEGER NOT NULL DEFAULT 30,
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_parish_availability_rules_parish
  ON parish_availability_rules(parish_id, sacrament_type, active);

CREATE TABLE IF NOT EXISTS parish_availability_blackouts (
  id         TEXT NOT NULL PRIMARY KEY,
  parish_id  TEXT NOT NULL,
  date       TEXT NOT NULL,                 -- 'YYYY-MM-DD', parish-local
  reason     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_parish_availability_blackouts_parish_date
  ON parish_availability_blackouts(parish_id, date);

-- Real (DB-enforced) race-condition guard for the new booking endpoint: two
-- concurrent bookings for the same parish/date/canonical-HH:MM-time cannot
-- both succeed -- the second INSERT fails this constraint and the handler
-- translates that into a 409. Only covers status='scheduled' rows written
-- with the canonical 'HH:MM' time format the booking endpoint always uses;
-- a manually-entered appointment with a differently-formatted time string
-- for the same real time isn't caught by this index (see the
-- normalizeTimeToHHMM best-effort matching in
-- src/lib/sacrament-availability.js for why that's an accepted limitation).
CREATE UNIQUE INDEX IF NOT EXISTS uq_sacrament_requests_scheduled_slot
  ON sacrament_requests(parish_id, confirmed_date, confirmed_time)
  WHERE status = 'scheduled';
