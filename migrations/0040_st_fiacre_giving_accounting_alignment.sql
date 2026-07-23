-- Keep the St. Fiacre Giving Overview seed classification aligned with the
-- accounting demo. This $75 gift is general stewardship, not candle giving.
UPDATE donor_offerings
SET data = json_set(data, '$.fund', 'stewardship'),
    updated_at = COALESCE(updated_at, datetime('now'))
WHERE id = 'fiacre-2026-give-003'
  AND parish_id = 'st-fiacre'
  AND json_extract(data, '$.fund') = 'candle';
