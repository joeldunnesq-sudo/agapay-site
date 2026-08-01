-- Share-to-link household invitations are proposals, never direct claims.
-- The raw bearer token is returned once; only its SHA-256 digest is stored.

CREATE TABLE IF NOT EXISTS directory_household_invitations (
  id                 TEXT PRIMARY KEY,
  parish_id          TEXT NOT NULL,
  household_id       TEXT NOT NULL REFERENCES directory_households(id) ON DELETE CASCADE,
  person_id          TEXT NOT NULL REFERENCES directory_people(id) ON DELETE CASCADE,
  token              TEXT NOT NULL UNIQUE,
  created_by_user_id TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'claimed', 'expired', 'cancelled')),
  claimed_by_user_id TEXT,
  claimed_at         TEXT,
  created_at         TEXT NOT NULL,
  expires_at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_directory_household_invitations_token
  ON directory_household_invitations(token);

CREATE INDEX IF NOT EXISTS idx_directory_household_invitations_household
  ON directory_household_invitations(household_id, person_id, status);

-- One invitation can produce at most one review proposal, even if two claim
-- requests race. The invitation id is intentionally embedded in the existing
-- membership-add payload so the established queue and decision path remain the
-- only approval gate.
CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_household_share_review
  ON directory_change_requests(json_extract(requested_payload_json, '$.shareToLink.invitationId'))
  WHERE request_type = 'household_membership_add'
    AND json_extract(requested_payload_json, '$.shareToLink.invitationId') IS NOT NULL;

-- Claim and post-approval projection are performed with D1 batch transactions.
-- Their mandatory scalar subqueries resolve to NULL (and fail NOT NULL
-- constraints) if invitation state or identity-conflict preconditions change,
-- so a race cannot produce a partial claim or bypass the review gate.
