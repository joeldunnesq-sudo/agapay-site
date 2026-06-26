-- Migration: 0005_donor_notifications
-- Stores pledge nudge notifications from parish admins to donors.
-- Read by the donor My AGAPAY dashboard on login; dismissed by the donor.

CREATE TABLE IF NOT EXISTS donor_notifications (
  id              TEXT PRIMARY KEY,
  donor_email     TEXT NOT NULL,
  parish_id       TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'pledge_nudge',
  fiscal_year     INTEGER NOT NULL,
  pledge_cents    INTEGER NOT NULL DEFAULT 0,
  given_cents     INTEGER NOT NULL DEFAULT 0,
  message         TEXT,
  sent_at         TEXT NOT NULL DEFAULT (datetime('now')),
  dismissed_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_donor_notifications_email
  ON donor_notifications(donor_email, dismissed_at, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_donor_notifications_parish
  ON donor_notifications(parish_id, fiscal_year, sent_at DESC);
