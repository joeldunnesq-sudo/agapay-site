-- Mandatory MFA for privileged AGAPAY identities.
-- Applies to the platform administrator, shared legacy parish-dashboard
-- administrators, and named platform users invited to administer a parish.

ALTER TABLE platform_users ADD COLUMN session_mfa_verified_at TEXT;

CREATE TABLE IF NOT EXISTS privileged_mfa_profiles (
  principal_type              TEXT NOT NULL,
  principal_id                TEXT NOT NULL,
  totp_secret_ciphertext      TEXT,
  totp_secret_iv              TEXT,
  totp_confirmed_at           TEXT,
  recovery_code_hashes_json   TEXT NOT NULL DEFAULT '[]',
  recovery_codes_generated_at TEXT,
  required_at                 TEXT,
  created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (principal_type, principal_id)
);

CREATE TABLE IF NOT EXISTS privileged_webauthn_credentials (
  credential_id          TEXT PRIMARY KEY,
  principal_type         TEXT NOT NULL,
  principal_id           TEXT NOT NULL,
  credential_public_key  TEXT NOT NULL,
  counter                INTEGER NOT NULL DEFAULT 0,
  transports_json        TEXT NOT NULL DEFAULT '[]',
  device_type            TEXT,
  backed_up               INTEGER NOT NULL DEFAULT 0,
  label                   TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at            TEXT
);

CREATE INDEX IF NOT EXISTS idx_privileged_webauthn_principal
  ON privileged_webauthn_credentials(principal_type, principal_id);

CREATE TABLE IF NOT EXISTS privileged_mfa_transactions (
  id                   TEXT PRIMARY KEY,
  principal_type       TEXT NOT NULL,
  principal_id         TEXT NOT NULL,
  purpose              TEXT NOT NULL,
  token_hash           TEXT NOT NULL,
  token_salt           TEXT NOT NULL,
  webauthn_challenge   TEXT,
  selected_method      TEXT,
  metadata_json        TEXT NOT NULL DEFAULT '{}',
  attempts             INTEGER NOT NULL DEFAULT 0,
  expires_at           TEXT NOT NULL,
  consumed_at          TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_privileged_mfa_transactions_expiry
  ON privileged_mfa_transactions(expires_at, consumed_at);
