-- Directory review questions and member responses.
-- Keeps the conversation attached to the authoritative review source so a
-- returned submission can be updated and placed back in the same queue.

CREATE TABLE IF NOT EXISTS directory_review_correspondence (
  id                  TEXT PRIMARY KEY,
  parish_id           TEXT NOT NULL,
  source_type         TEXT NOT NULL,
  source_id           TEXT NOT NULL,
  direction           TEXT NOT NULL CHECK (direction IN ('staff_to_member', 'member_to_staff')),
  body                TEXT NOT NULL,
  created_by_user_id  TEXT NOT NULL,
  created_at          INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_directory_review_correspondence_source
  ON directory_review_correspondence(parish_id, source_type, source_id, created_at);

