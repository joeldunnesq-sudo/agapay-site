CREATE TABLE IF NOT EXISTS nonprofit_pricing_applications (
  id TEXT PRIMARY KEY,
  parish_id TEXT NOT NULL,
  registration_reference TEXT NOT NULL,
  stripe_account_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'collecting_information',
  policy_version TEXT NOT NULL,
  measurement_period_start TEXT,
  reported_donation_percent REAL,
  attestation_version TEXT,
  attested_by_name TEXT,
  attested_by_title TEXT,
  attested_by_email TEXT,
  attested_at TEXT,
  ein_last_four TEXT,
  confirms_registered_nonprofit INTEGER NOT NULL DEFAULT 0,
  confirms_over_80_percent INTEGER NOT NULL DEFAULT 0,
  confirms_tax_deductible_donations INTEGER NOT NULL DEFAULT 0,
  confirms_account_owner_submission INTEGER NOT NULL DEFAULT 0,
  stripe_support_case_id TEXT,
  submitted_at TEXT,
  stripe_decision TEXT,
  stripe_decision_at TEXT,
  stripe_effective_date TEXT,
  approved_card_rate_basis_points INTEGER,
  approved_card_fixed_fee_cents INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (parish_id, stripe_account_id)
);

CREATE INDEX IF NOT EXISTS idx_nonprofit_pricing_applications_status
  ON nonprofit_pricing_applications (status, updated_at);

CREATE TABLE IF NOT EXISTS nonprofit_pricing_documents (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  sanitized_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  uploaded_by_type TEXT NOT NULL,
  uploaded_by_user_id TEXT,
  is_current INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  replaced_at TEXT,
  FOREIGN KEY (application_id) REFERENCES nonprofit_pricing_applications(id)
);

CREATE INDEX IF NOT EXISTS idx_nonprofit_pricing_documents_application
  ON nonprofit_pricing_documents (application_id, document_type, is_current);

CREATE TABLE IF NOT EXISTS nonprofit_pricing_audit_log (
  id TEXT PRIMARY KEY,
  application_id TEXT,
  parish_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_user_id TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nonprofit_pricing_audit_application
  ON nonprofit_pricing_audit_log (application_id, created_at);

CREATE TABLE IF NOT EXISTS nonprofit_pricing_threshold_alerts (
  parish_id TEXT NOT NULL,
  risk_band TEXT NOT NULL,
  threshold_exposure_percent REAL NOT NULL,
  donation_percent REAL NOT NULL,
  notified_at TEXT NOT NULL,
  resolved_at TEXT,
  last_observed_at TEXT NOT NULL,
  PRIMARY KEY (parish_id, risk_band)
);
