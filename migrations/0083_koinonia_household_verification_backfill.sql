-- Backfill the verification gate before Koinonia enforcement is deployed.
--
-- Household publication approval pre-dates directory_household_verifications.
-- Give every previously approved household without a verification row a fresh
-- full parish-configured verification window beginning when this migration is
-- applied. Existing verification rows are authoritative and are not changed.

WITH backfill_clock AS (
  SELECT CAST(unixepoch('now') AS INTEGER) * 1000 AS now_ms
),
approved_households AS (
  SELECT DISTINCT h.id AS household_id, h.parish_id
  FROM directory_households h
  JOIN directory_publication_profiles publication
    ON publication.parish_id = h.parish_id
   AND publication.owner_type = 'household'
   AND publication.owner_id = h.id
  WHERE publication.approved_at IS NOT NULL
     OR publication.approval_status = 'approved'
     OR publication.status = 'approved'
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
  FROM approved_households approved
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
       'system:koinonia-verification-backfill',
       'koinonia-gate-backfill-v1',
       clock.now_ms,
       clock.now_ms
FROM verification_intervals intervals
CROSS JOIN backfill_clock clock
WHERE NOT EXISTS (
  SELECT 1
  FROM directory_household_verifications existing
  WHERE existing.household_id = intervals.household_id
);
