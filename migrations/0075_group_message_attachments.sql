-- Voice notes and photos for private ministry group messages.
-- Rebuild the table because SQLite cannot drop body's NOT NULL constraint.

CREATE TABLE parish_group_messages_with_attachments (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  ministry_id TEXT NOT NULL REFERENCES directory_ministries(id),
  author_person_id TEXT NOT NULL REFERENCES directory_people(id),
  body TEXT,
  message_type TEXT NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'voice', 'image')),
  attachment_url TEXT,
  attachment_duration_seconds INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO parish_group_messages_with_attachments
  (id, parish_id, ministry_id, author_person_id, body, created_at)
SELECT id, parish_id, ministry_id, author_person_id, body, created_at
FROM parish_group_messages;

DROP TABLE parish_group_messages;
ALTER TABLE parish_group_messages_with_attachments RENAME TO parish_group_messages;

CREATE INDEX idx_parish_group_messages_ministry
  ON parish_group_messages(parish_id, ministry_id, created_at DESC);
