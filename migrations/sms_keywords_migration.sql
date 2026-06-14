-- Migration: Text-to-Give SMS Keywords
-- Table: sms_keywords
-- Created for AGAPAY Text-to-Give feature
-- Run via: wrangler d1 execute AGAPAY_DB --file=migrations/sms_keywords_migration.sql
-- NOTE: keyword is globally unique across all parishes (one shared AGAPAY number)

CREATE TABLE IF NOT EXISTS sms_keywords (
    id          TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    parish_id   TEXT    NOT NULL,
    fund_id     TEXT    NOT NULL,
    keyword     TEXT    NOT NULL,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Keywords must be globally unique (one shared number, all parishes)
CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_keywords_keyword
  ON sms_keywords (keyword);

-- Fast lookup by parish for admin list
CREATE INDEX IF NOT EXISTS idx_sms_keywords_parish_id
  ON sms_keywords (parish_id);
