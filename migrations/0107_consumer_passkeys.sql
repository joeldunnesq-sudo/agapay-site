-- Optional passwordless sign-in for My AGAPAY parishioner accounts.
-- Kept separate from privileged administrator MFA so consumer passkeys can
-- remain optional while privileged MFA policy stays mandatory.

CREATE TABLE IF NOT EXISTS consumer_passkey_accounts (
  id           TEXT PRIMARY KEY,
  donor_email  TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS consumer_webauthn_credentials (
  credential_id          TEXT PRIMARY KEY,
  account_id             TEXT NOT NULL,
  credential_public_key  TEXT NOT NULL,
  counter                INTEGER NOT NULL DEFAULT 0,
  transports_json        TEXT NOT NULL DEFAULT '[]',
  device_type            TEXT,
  backed_up               INTEGER NOT NULL DEFAULT 0,
  label                   TEXT NOT NULL DEFAULT 'Passkey',
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at            TEXT,
  FOREIGN KEY (account_id) REFERENCES consumer_passkey_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_consumer_webauthn_account
  ON consumer_webauthn_credentials(account_id, created_at);

CREATE TABLE IF NOT EXISTS consumer_passkey_transactions (
  id                   TEXT PRIMARY KEY,
  purpose              TEXT NOT NULL CHECK (purpose IN ('authentication', 'registration')),
  account_id           TEXT,
  token_hash           TEXT NOT NULL,
  token_salt           TEXT NOT NULL,
  webauthn_challenge   TEXT NOT NULL,
  attempts             INTEGER NOT NULL DEFAULT 0,
  expires_at           TEXT NOT NULL,
  consumed_at          TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (account_id) REFERENCES consumer_passkey_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_consumer_passkey_transactions_expiry
  ON consumer_passkey_transactions(expires_at, consumed_at);
