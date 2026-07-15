-- ============================================================
-- AGAPAY Accounting Package 0.75C -- Platform Identity & Parish
-- Memberships (docs/accounting/02d-identity-and-capability-model.md,
-- docs/accounting/02-phase-0.75-foundational-readiness.md Package 0.75C).
--
-- This is the foundational authorization layer every later accounting
-- package depends on. It does NOT touch registrations, donors, or any
-- existing table -- purely additive.
--
-- Fully normalized (typed columns), not the row+JSON-blob pattern used by
-- `registrations`/`donors` -- per Phase 0 finding #5, membership/capability
-- rows must be indexable and queryable by SQL, the same reasoning that
-- already drove `commerce_orders` to a normalized shape.
--
-- Apply with:
-- wrangler d1 execute agapay-production --remote --file=./migrations/0020_platform_identity.sql
-- ============================================================

-- One row per real human, platform-wide (not parish-specific). Modeled on
-- the existing donor auth *pattern* (verified email, salted hashed session
-- token, expiry, constant-time comparison) -- deliberately NOT built on the
-- `donors` table itself, since donors and parish staff are different
-- populations (docs/accounting/02d, "Required design decisions").
CREATE TABLE IF NOT EXISTS platform_users (
  id                    TEXT PRIMARY KEY,
  email                 TEXT NOT NULL,               -- normalized (lowercase, trimmed)
  display_name          TEXT,
  email_verified_at     TEXT,
  password_record       TEXT,                        -- JSON PBKDF2 record (createPasswordRecord), nullable until first login is set up
  session_token_hash    TEXT,
  session_salt          TEXT,
  session_expires_at    TEXT,
  status                TEXT NOT NULL DEFAULT 'active', -- active | disabled
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_users_email ON platform_users(email);
CREATE INDEX IF NOT EXISTS idx_platform_users_status ON platform_users(status);

-- One row per (person x parish) relationship. A person may belong to many
-- parishes; each membership is independently scoped, statused, and
-- capability-gated.
CREATE TABLE IF NOT EXISTS parish_memberships (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL,
  parish_id             TEXT NOT NULL,
  role_template         TEXT,                        -- convenience label only (e.g. 'treasurer') -- never authoritative, see membership_capabilities
  status                TEXT NOT NULL DEFAULT 'invited', -- invited | active | suspended | revoked
  invited_by_user_id    TEXT,
  invited_at            TEXT,
  accepted_at           TEXT,
  joined_at             TEXT,                        -- when the membership first became active
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_parish_memberships_user_parish ON parish_memberships(user_id, parish_id);
CREATE INDEX IF NOT EXISTS idx_parish_memberships_parish_id ON parish_memberships(parish_id);
CREATE INDEX IF NOT EXISTS idx_parish_memberships_user_id ON parish_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_parish_memberships_status ON parish_memberships(status);

-- Capability grants per membership -- capabilities are DATA (rows), never a
-- hardcoded enum, so the catalog can grow (e.g. adding `checks.reissue`
-- later) without a breaking schema change (docs/accounting/02d).
CREATE TABLE IF NOT EXISTS membership_capabilities (
  id                    TEXT PRIMARY KEY,
  membership_id         TEXT NOT NULL,
  capability            TEXT NOT NULL,
  granted_by_user_id    TEXT,
  granted_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_capabilities_unique ON membership_capabilities(membership_id, capability);
CREATE INDEX IF NOT EXISTS idx_membership_capabilities_membership_id ON membership_capabilities(membership_id);

-- Invitation framework (data + backend only, per this package's explicit
-- "do not build the UI" scope). An invitation targets an email address, not
-- a platform_user row directly, since the invited person may not have a
-- platform_user row yet -- accepting is what creates or links one.
CREATE TABLE IF NOT EXISTS membership_invitations (
  id                    TEXT PRIMARY KEY,
  parish_id             TEXT NOT NULL,
  email                 TEXT NOT NULL,               -- normalized
  role_template         TEXT,
  invited_capabilities  TEXT,                        -- JSON array of capability strings granted on acceptance
  invited_by_user_id    TEXT,                        -- nullable: legacy parish-bearer-authenticated invites have no platform_user actor yet
  invited_by_legacy_bearer INTEGER NOT NULL DEFAULT 0, -- 1 if issued via the legacy shared parish bearer token (bootstrapping path), audited distinctly
  token_hash            TEXT NOT NULL,
  token_salt            TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | revoked | expired
  expires_at            TEXT NOT NULL,
  accepted_at           TEXT,
  accepted_by_user_id   TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_membership_invitations_parish_id ON membership_invitations(parish_id);
CREATE INDEX IF NOT EXISTS idx_membership_invitations_email ON membership_invitations(email);
CREATE INDEX IF NOT EXISTS idx_membership_invitations_status ON membership_invitations(status);

-- Membership changes are audited through the existing central `audit_log`
-- table (migrations/0014_audit_log.sql) rather than a new, parallel audit
-- mechanism -- consolidating toward one authorization/audit layer per this
-- package's "do not duplicate logic" instruction. `actor_type` gains a new
-- value, 'platform_user', alongside the existing admin | parish | donor |
-- system set; no schema change is required since actor_type is unconstrained
-- TEXT, exactly as docs/accounting/02d anticipated ("a natural, low-cost
-- extension rather than a new mechanism").
