-- Confirm households whose first My AGAPAY directory onboarding was approved
-- after the original Koinonia verification backfill ran. Future approvals
-- create this row transactionally; this migration repairs only missing rows
-- for completed, server-tagged onboarding requests and leaves every existing
-- current/due/overdue verification decision untouched.

WITH backfill_clock AS (
  SELECT CAST(unixepoch('now') AS INTEGER) * 1000 AS now_ms
),
approved_onboarding_households AS (
  SELECT DISTINCT h.id AS household_id, h.parish_id
    FROM directory_change_requests request
    JOIN directory_person_links link
      ON link.person_id = request.target_id
     AND link.link_type = 'platform_user'
     AND link.external_id = request.requester_user_id
     AND link.active = 1
    JOIN directory_household_members membership
      ON membership.person_id = request.target_id
     AND membership.active = 1
    JOIN directory_households h
      ON h.id = membership.household_id
     AND h.parish_id = request.parish_id
     AND h.active = 1
    JOIN directory_household_admins administrator
      ON administrator.household_id = h.id
     AND administrator.person_id = request.target_id
     AND administrator.active = 1
    JOIN directory_publication_profiles publication
      ON publication.parish_id = request.parish_id
     AND publication.owner_type = 'person'
     AND publication.owner_id = request.target_id
     AND publication.active = 1
   WHERE request.request_type = 'person_profile_review'
     AND request.status = 'completed'
     AND json_extract(request.requested_payload_json, '$.source') = 'myagapay_directory_onboarding'
     AND (publication.approved_at IS NOT NULL
       OR publication.approval_status = 'approved'
       OR publication.status = 'approved')
),
verification_intervals AS (
  SELECT approved.household_id,
         approved.parish_id,
         CASE
           WHEN COALESCE(settings.household_verification_interval_days,
                         settings.reconfirmation_interval_days, 365) < 30 THEN 30
           WHEN COALESCE(settings.household_verification_interval_days,
                         settings.reconfirmation_interval_days, 365) > 1095 THEN 1095
           ELSE COALESCE(settings.household_verification_interval_days,
                         settings.reconfirmation_interval_days, 365)
         END AS interval_days
    FROM approved_onboarding_households approved
    LEFT JOIN directory_parish_settings settings
      ON settings.parish_id = approved.parish_id
)
INSERT INTO directory_household_verifications
  (household_id, parish_id, verification_status, verification_due_at,
   last_verified_at, verification_started_at, verified_by_user_id,
   verification_policy_version, created_at, updated_at)
SELECT intervals.household_id,
       intervals.parish_id,
       'current',
       clock.now_ms + (intervals.interval_days * 86400000),
       clock.now_ms,
       clock.now_ms,
       'system:onboarding-verification-backfill',
       'first-profile-review-backfill-v1',
       clock.now_ms,
       clock.now_ms
  FROM verification_intervals intervals
  CROSS JOIN backfill_clock clock
 WHERE NOT EXISTS (
   SELECT 1
     FROM directory_household_verifications existing
    WHERE existing.household_id = intervals.household_id
 );
