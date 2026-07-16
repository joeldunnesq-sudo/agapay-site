-- Migration 0024: Parish Directory Phase 1C-1 -- Invitation and claim foundation
--
-- Adds the normalized directory invitation and claim tables described in
-- docs/directory/11-phase-1c-invitation-foundation.md, Part 18 of the
-- Phase 1C brief ("Use the smallest correct model"):
--   - directory_invitations
--   - directory_claims
--
-- Also makes one ADDITIVE correction to the Phase 1A table
-- directory_person_links: it did not previously have a way to record how
-- a link was created or which claim (if any) produced it, which Phase 1C
-- Part 6 explicitly requires ("the link must record creation source such
-- as directory_claim" / "reference the relevant claim where feasible").
-- This is a new, nullable column addition -- no existing column is
-- altered, no existing row is rewritten, and no data is destroyed.

-- --- Additive correction to Phase 1A: directory_person_links provenance ---
ALTER TABLE directory_person_links ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE directory_person_links ADD COLUMN claim_id TEXT;

-- --- Directory invitations ---
-- One row per invitation. Raw tokens are never stored -- only a SHA-256
-- hash of the token (see src/directory/invitations.js). Lifecycle states:
-- pending -> sent -> accepted -> completed
--                 -> expired
-- pending/sent    -> revoked
-- accepted        -> cancelled (claim denied/cancelled after acceptance)
CREATE TABLE IF NOT EXISTS directory_invitations (
  id                  TEXT    PRIMARY KEY,
  parish_id           TEXT    NOT NULL,
  invitation_type     TEXT    NOT NULL CHECK (invitation_type IN (
                         'person_claim', 'household_admin', 'additional_household_admin'
                       )),
  intended_person_id     TEXT    REFERENCES directory_people(id) ON DELETE CASCADE,
  intended_household_id  TEXT    REFERENCES directory_households(id) ON DELETE CASCADE,
  intended_authority  TEXT    NOT NULL CHECK (intended_authority IN (
                         'link_person', 'grant_household_admin', 'link_and_grant_household_admin'
                       )),
  recipient_email     TEXT,
  recipient_phone     TEXT,
  recipient_label     TEXT,
  issued_by_user_id   TEXT    NOT NULL,
  token_hash          TEXT    NOT NULL,
  token_purpose       TEXT    NOT NULL DEFAULT 'directory_invitation',
  status              TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN (
                         'pending', 'sent', 'opened', 'accepted', 'completed',
                         'expired', 'revoked', 'cancelled'
                       )),
  requires_review     INTEGER NOT NULL DEFAULT 0 CHECK (requires_review IN (0, 1)),
  internal_reason     TEXT,
  resend_count        INTEGER NOT NULL DEFAULT 0,
  last_sent_at        INTEGER,
  correlation_id      TEXT,
  created_at          INTEGER NOT NULL,
  expires_at          INTEGER NOT NULL,
  accepted_at         INTEGER,
  revoked_at          INTEGER,
  completed_at        INTEGER,
  updated_at          INTEGER NOT NULL,
  -- A person-claim invitation must name exactly one intended person.
  -- A household-admin invitation must name both a person and a household
  -- (Part 3 / Part 1: "Do not permit an anonymous household claim").
  CHECK (
    (invitation_type = 'person_claim' AND intended_person_id IS NOT NULL)
    OR (invitation_type IN ('household_admin', 'additional_household_admin')
        AND intended_person_id IS NOT NULL AND intended_household_id IS NOT NULL)
  )
);

-- token_hash must be unique so a hash collision (or a reused token across
-- invitations) is structurally impossible, not just application-checked.
CREATE UNIQUE INDEX IF NOT EXISTS idx_directory_invitations_token_hash
  ON directory_invitations(token_hash);

CREATE INDEX IF NOT EXISTS idx_directory_invitations_parish_status
  ON directory_invitations(parish_id, status);

CREATE INDEX IF NOT EXISTS idx_directory_invitations_person
  ON directory_invitations(intended_person_id, status);

CREATE INDEX IF NOT EXISTS idx_directory_invitations_household
  ON directory_invitations(intended_household_id, status);

CREATE INDEX IF NOT EXISTS idx_directory_invitations_expiry
  ON directory_invitations(status, expires_at);

-- At most one non-terminal (pending/sent/opened/accepted) invitation per
-- (person, invitation_type) -- prevents silently creating a second live
-- invitation for the same person and purpose while one is already open.
-- SQLite partial unique indexes are supported by D1.
CREATE UNIQUE INDEX IF NOT EXISTS idx_directory_invitations_active_person_purpose
  ON directory_invitations(intended_person_id, invitation_type)
  WHERE status IN ('pending', 'sent', 'opened', 'accepted');

-- --- Directory claims ---
-- One row per claim request. A claim always originates from exactly one
-- invitation in Phase 1C (Part 4: "In Phase 1C, only implement methods
-- that can be made safe now" -- no open self-claim search yet).
CREATE TABLE IF NOT EXISTS directory_claims (
  id                    TEXT    PRIMARY KEY,
  parish_id             TEXT    NOT NULL,
  invitation_id         TEXT    NOT NULL REFERENCES directory_invitations(id) ON DELETE RESTRICT,
  claimant_user_id       TEXT    NOT NULL,
  requested_person_id    TEXT    NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  requested_household_id TEXT    REFERENCES directory_households(id) ON DELETE CASCADE,
  requested_authority    TEXT    NOT NULL CHECK (requested_authority IN (
                            'link_person', 'grant_household_admin', 'link_and_grant_household_admin'
                          )),
  claim_method          TEXT    NOT NULL DEFAULT 'exact_invitation' CHECK (claim_method IN (
                            'exact_invitation', 'parish_assisted'
                          )),
  status                TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN (
                            'pending', 'requires_review', 'approved', 'denied',
                            'cancelled', 'completed', 'conflicted'
                          )),
  conflict_codes_json   TEXT,
  submitted_at          INTEGER NOT NULL,
  reviewed_at           INTEGER,
  reviewed_by_user_id    TEXT,
  decision_reason_code  TEXT,
  review_note           TEXT,
  completed_at          INTEGER,
  cancelled_at          INTEGER,
  correlation_id        TEXT,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_directory_claims_parish_status
  ON directory_claims(parish_id, status);

CREATE INDEX IF NOT EXISTS idx_directory_claims_invitation
  ON directory_claims(invitation_id);

CREATE INDEX IF NOT EXISTS idx_directory_claims_claimant
  ON directory_claims(claimant_user_id, status);

CREATE INDEX IF NOT EXISTS idx_directory_claims_person
  ON directory_claims(requested_person_id, status);

-- Reviewer queue: claims awaiting a decision, oldest first, per parish.
CREATE INDEX IF NOT EXISTS idx_directory_claims_review_queue
  ON directory_claims(parish_id, submitted_at)
  WHERE status = 'requires_review';

-- At most one non-terminal (pending/requires_review) claim per claimant
-- and invitation -- prevents a claimant from submitting duplicate claims
-- against the same invitation while one is already open.
CREATE UNIQUE INDEX IF NOT EXISTS idx_directory_claims_active_claimant_invitation
  ON directory_claims(claimant_user_id, invitation_id)
  WHERE status IN ('pending', 'requires_review');
