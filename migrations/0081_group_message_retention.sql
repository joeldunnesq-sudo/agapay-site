-- Ministry attachment storage is ephemeral. The daily retention sweep removes
-- private R2 attachments after 30 days while preserving conversation history.
CREATE INDEX IF NOT EXISTS idx_parish_group_messages_retention
  ON parish_group_messages(created_at ASC);
