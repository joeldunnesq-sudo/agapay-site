CREATE TABLE IF NOT EXISTS legal_terms_versions (
  version TEXT PRIMARY KEY,
  content_sha256 TEXT NOT NULL,
  snapshot_path TEXT NOT NULL,
  effective_for_new_users_at TEXT NOT NULL,
  effective_for_existing_users_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS legal_acceptances (
  id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL,
  subject_user_id TEXT,
  organization_id TEXT,
  actor_name TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  terms_sha256 TEXT NOT NULL,
  disclosure_text TEXT NOT NULL,
  acceptance_source TEXT NOT NULL,
  transaction_reference TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  dispute_resolution_mode TEXT NOT NULL DEFAULT 'courts_no_mandatory_arbitration',
  created_at TEXT NOT NULL,
  FOREIGN KEY (terms_version) REFERENCES legal_terms_versions(version)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_legal_acceptances_transaction
  ON legal_acceptances(terms_version, acceptance_source, transaction_reference, actor_email);
CREATE INDEX IF NOT EXISTS idx_legal_acceptances_subject
  ON legal_acceptances(subject_user_id, terms_version, accepted_at DESC);
CREATE INDEX IF NOT EXISTS idx_legal_acceptances_organization
  ON legal_acceptances(organization_id, terms_version, accepted_at DESC);

INSERT OR IGNORE INTO legal_terms_versions (
  version, content_sha256, snapshot_path, effective_for_new_users_at,
  effective_for_existing_users_at, created_at
) VALUES (
  '2026-08-01',
  'a21200e450f40482a6b3b57e085ed77b2e6bebfe49a838dc87c4e77f3a0868ae',
  'docs/legal/terms/terms-2026-08-01.html',
  '2026-08-01T00:00:00.000Z',
  '2026-08-31T00:00:00.000Z',
  '2026-08-01T00:00:00.000Z'
);

INSERT OR IGNORE INTO legal_terms_versions (
  version, content_sha256, snapshot_path, effective_for_new_users_at,
  effective_for_existing_users_at, created_at
) VALUES (
  '2026-08-02',
  '11cd64ddb5ad936eb971b313ca8c22237790d3e2febc2bde41954111cdb65c20',
  'docs/legal/terms/terms-2026-08-02.html',
  '2026-08-02T00:00:00.000Z',
  '2026-09-01T00:00:00.000Z',
  '2026-08-02T00:00:00.000Z'
);

CREATE TRIGGER IF NOT EXISTS legal_terms_versions_no_update
BEFORE UPDATE ON legal_terms_versions
BEGIN
  SELECT RAISE(ABORT, 'legal_terms_versions are append-only');
END;

CREATE TRIGGER IF NOT EXISTS legal_terms_versions_no_delete
BEFORE DELETE ON legal_terms_versions
BEGIN
  SELECT RAISE(ABORT, 'legal_terms_versions are append-only');
END;

CREATE TRIGGER IF NOT EXISTS legal_acceptances_no_update
BEFORE UPDATE ON legal_acceptances
BEGIN
  SELECT RAISE(ABORT, 'legal_acceptances are append-only');
END;

CREATE TRIGGER IF NOT EXISTS legal_acceptances_no_delete
BEFORE DELETE ON legal_acceptances
BEGIN
  SELECT RAISE(ABORT, 'legal_acceptances are append-only');
END;
