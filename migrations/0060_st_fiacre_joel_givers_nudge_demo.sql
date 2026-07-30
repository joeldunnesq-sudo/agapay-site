-- Make Joel's St. Fiacre demo household appear in the Givers-page
-- "Needs a nudge" card. That card requires at least one recurring gift and
-- ranks recurring households by their latest paid gift date. Move Joel's
-- three demo gifts together so the latest is June 12 and mark the
-- stewardship gift monthly. Dollar amounts and designations are unchanged.
WITH demo_dates(id, gift_at) AS (
  VALUES
    ('off_jul_stew_2026', '2026-06-10T14:00:00.000Z'),
    ('off_jul_campaign_2026', '2026-06-11T10:00:00.000Z'),
    ('off_jul_candle_2026', '2026-06-12T09:00:00.000Z')
)
UPDATE donor_offerings
SET created_at = (SELECT gift_at FROM demo_dates WHERE demo_dates.id = donor_offerings.id),
    data = json_set(
      data,
      '$.createdAt', (SELECT gift_at FROM demo_dates WHERE demo_dates.id = donor_offerings.id),
      '$.donorEmail', 'joeldunnesq@gmail.com',
      '$.donorName', 'Joel Dunn',
      '$.frequency', CASE
        WHEN donor_offerings.id = 'off_jul_stew_2026' THEN 'monthly'
        ELSE 'once'
      END
    ),
    updated_at = datetime('now')
WHERE id IN (SELECT id FROM demo_dates)
  AND parish_id = 'st-fiacre';
-- Original filename retained because D1 identifies applied migrations by filename.
