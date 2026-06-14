-- Migration: Text-to-Give SMS Keywords
-- Table: sms_keywords
-- Created for AGAPAY Text-to-Give feature
-- Run via: wrangler d1 execute AGAPAY_DB --file=migrations/sms_keywords_migration.sql

CREATE TABLE IF NOT EXISTS sms_keywords (
    id          TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    parish_id   TEXT    NOT NULL,
    fund_id     TEXT    NOT NULL,
    keyword     TEXT    NOT NULL,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_keywords_parish_keyword
  ON sms_keywords (parish_id, keyword);

CREATE INDEX IF NOT EXISTS idx_sms_keywords_parish_id
  ON sms_keywords (parish_id);
