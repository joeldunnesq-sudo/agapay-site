CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id TEXT PRIMARY KEY,
  donor_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
  source TEXT NOT NULL DEFAULT 'myagapay-account-settings',
  requested_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  completion_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_email_status
  ON account_deletion_requests (donor_email, status, requested_at DESC);
