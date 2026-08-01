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

-- Fail closed if a caller attempts to insert a proposal for an invitation that
-- is no longer pending, is expired, or does not match the proposed identity.
CREATE TRIGGER IF NOT EXISTS directory_household_share_validate_proposal
BEFORE INSERT ON directory_change_requests
WHEN NEW.request_type = 'household_membership_add'
 AND json_extract(NEW.requested_payload_json, '$.shareToLink.invitationId') IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM directory_household_invitations i
     WHERE i.id = json_extract(NEW.requested_payload_json, '$.shareToLink.invitationId')
       AND i.parish_id = NEW.parish_id
       AND i.household_id = NEW.household_id
       AND i.person_id = json_extract(NEW.requested_payload_json, '$.personId')
       AND i.status = 'pending'
       AND i.expires_at > datetime('now')
       AND json_extract(NEW.requested_payload_json, '$.shareToLink.claimantUserId') IS NOT NULL
  ) THEN RAISE(ABORT, 'invalid household share proposal') END;
END;

-- Claim state may move only in the same transaction that created its review
-- proposal. This prevents a missing/removed inviter identity link from
-- consuming a token without placing anything in the parish queue.
CREATE TRIGGER IF NOT EXISTS directory_household_share_require_proposal
AFTER UPDATE OF status ON directory_household_invitations
WHEN OLD.status = 'pending' AND NEW.status = 'claimed'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM directory_change_requests cr
     WHERE cr.request_type = 'household_membership_add'
       AND json_extract(cr.requested_payload_json, '$.shareToLink.invitationId') = NEW.id
       AND json_extract(cr.requested_payload_json, '$.shareToLink.claimantUserId') = NEW.claimed_by_user_id
       AND cr.status = 'pending'
  ) THEN RAISE(ABORT, 'household share claim requires a review proposal') END;
END;

-- The identity link is projected only after the existing review decision has
-- completed. It is impossible for token claim itself to reach this trigger.
-- Conflicting identity links fail closed and require staff resolution.
CREATE TRIGGER IF NOT EXISTS directory_household_share_link_after_review
AFTER UPDATE OF status ON directory_change_requests
WHEN OLD.status = 'pending'
 AND NEW.status = 'completed'
 AND NEW.request_type = 'household_membership_add'
 AND json_extract(NEW.requested_payload_json, '$.shareToLink.invitationId') IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM directory_household_invitations i
     WHERE i.id = json_extract(NEW.requested_payload_json, '$.shareToLink.invitationId')
       AND i.parish_id = NEW.parish_id
       AND i.household_id = NEW.household_id
       AND i.person_id = json_extract(NEW.requested_payload_json, '$.personId')
       AND i.status = 'claimed'
       AND i.claimed_by_user_id = json_extract(NEW.requested_payload_json, '$.shareToLink.claimantUserId')
  ) THEN RAISE(ABORT, 'invalid approved household share proposal') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM directory_person_links l
     WHERE l.link_type = 'platform_user' AND l.active = 1
       AND l.external_id = json_extract(NEW.requested_payload_json, '$.shareToLink.claimantUserId')
       AND l.person_id <> json_extract(NEW.requested_payload_json, '$.personId')
  ) THEN RAISE(ABORT, 'claimant already linked to another directory person') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM directory_person_links l
     WHERE l.link_type = 'platform_user' AND l.active = 1
       AND l.person_id = json_extract(NEW.requested_payload_json, '$.personId')
       AND l.external_id <> json_extract(NEW.requested_payload_json, '$.shareToLink.claimantUserId')
  ) THEN RAISE(ABORT, 'directory person already linked to another account') END;

  INSERT OR IGNORE INTO directory_person_links
    (id, person_id, link_type, external_id, active, source, claim_id, created_at, updated_at)
  SELECT
    'dir_household_share_' || i.id,
    i.person_id,
    'platform_user',
    i.claimed_by_user_id,
    1,
    'household_share_review',
    i.id,
    CAST(unixepoch('now') AS INTEGER) * 1000,
    CAST(unixepoch('now') AS INTEGER) * 1000
  FROM directory_household_invitations i
  WHERE i.id = json_extract(NEW.requested_payload_json, '$.shareToLink.invitationId');
END;
