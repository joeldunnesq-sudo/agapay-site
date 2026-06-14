-- Migration: Text-to-Give SMS Keywords
-- Table: sms_keywords
-- Created for AGAPAY Text-to-Give feature
-- Run via: wrangler d1 execute AGAPAY_DB --file=migrations/sms_keywords_migration.sql
-- NOTE: keyword is globally unique across all parishes (one shared AGAPAY number)

CREATE TABLE IF NOT EXISTS sms_keywords (
    id               TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    parish_id        TEXT    NOT NULL,
    destination_type TEXT    NOT NULL DEFAULT 'fund',
    destination_id   TEXT    NOT NULL,
    fund_id          TEXT    NOT NULL DEFAULT '',
    label            TEXT    NOT NULL DEFAULT '',
    keyword          TEXT    NOT NULL,
    is_active        INTEGER NOT NULL DEFAULT 1,
    created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    CHECK (destination_type IN ('parish', 'fund', 'campaign', 'feast'))
);

-- Keywords must be globally unique (one shared number, all parishes)
CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_keywords_keyword
  ON sms_keywords (keyword);

-- Fast lookup by parish for admin list
CREATE INDEX IF NOT EXISTS idx_sms_keywords_parish_id
  ON sms_keywords (parish_id);

-- Fast lookup by destination for future campaign/fund management screens
CREATE INDEX IF NOT EXISTS idx_sms_keywords_destination
  ON sms_keywords (destination_type, destination_id);
