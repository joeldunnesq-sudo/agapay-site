CREATE INDEX IF NOT EXISTS idx_parish_content_reads_receipts
  ON parish_content_reads(parish_id, content_type, content_id, read_at, donor_id);
