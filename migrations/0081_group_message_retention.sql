-- Ministry conversations are ephemeral. The daily retention sweep removes
-- messages, shared read receipts, and private R2 attachments after 30 days.
CREATE INDEX IF NOT EXISTS idx_parish_group_messages_retention
  ON parish_group_messages(created_at ASC);
