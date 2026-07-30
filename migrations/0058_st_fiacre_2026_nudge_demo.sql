-- Keep five St. Fiacre households visibly behind the intentionally forgiving
-- three-month pledge pace so the parish nudge workflow is easy to demonstrate.
-- Joel's received stewardship amount remains $1,500; only his demo pledge target
-- changes. Four recent demo gifts are retained in the parish total but assigned
-- to existing designated purposes rather than annual stewardship.
WITH reclassifications(id,fund,fund_id) AS (
  VALUES
    ('demo_st_fiacre_2026_received_013','Benevolence Fund','benevolence-fund'),
    ('demo_st_fiacre_2026_received_014','Iconography Fund','iconography'),
    ('demo_st_fiacre_2026_received_015','Building & Maintenance','building'),
    ('demo_st_fiacre_2026_received_016','Benevolence Fund','benevolence-fund')
)
UPDATE donor_offerings
SET data = json_set(
      data,
      '$.fund', (SELECT fund FROM reclassifications WHERE reclassifications.id = donor_offerings.id),
      '$.fundId', (SELECT fund_id FROM reclassifications WHERE reclassifications.id = donor_offerings.id),
      '$.giftType', 'designated'
    ),
    updated_at = datetime('now')
WHERE id IN (SELECT id FROM reclassifications)
  AND parish_id = 'st-fiacre';

INSERT INTO household_pledges
  (donor_email,parish_id,fiscal_year,target_amount_cents,created_at,updated_at)
VALUES
  ('joeldunnesq@gmail.com','st-fiacre',2026,600000,datetime('now'),datetime('now')),
  ('siobhan.kelly@email.com','st-fiacre',2026,120000,datetime('now'),datetime('now')),
  ('roisin.lynch@email.com','st-fiacre',2026,120000,datetime('now'),datetime('now')),
  ('fiona.walsh@email.com','st-fiacre',2026,120000,datetime('now'),datetime('now')),
  ('maeve.quinn@email.com','st-fiacre',2026,120000,datetime('now'),datetime('now'))
ON CONFLICT(donor_email,parish_id,fiscal_year) DO UPDATE SET
  target_amount_cents = excluded.target_amount_cents,
  updated_at = excluded.updated_at;
-- Original filename retained because D1 identifies applied migrations by filename.
