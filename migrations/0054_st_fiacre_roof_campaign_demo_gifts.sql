-- Give the St. Fiacre roof campaign a believable demo history totaling
-- $5,575.00 against its $10,000 goal (55.75%). These IDs are intentionally
-- identical to the admin demo seeder so rerunning it remains idempotent.
WITH gifts(id,email,name,amount_cents,is_anonymous,comment,gift_date) AS (
  VALUES
    ('demo_st_fiacre_demo_don_021','joel.dunn@example.com','Joel Dunn',7500,0,'May God bless this work.','2026-01-18T11:15:00.000Z'),
    ('demo_st_fiacre_demo_don_022','maria.petrov@email.com','Maria Petrov',50000,0,'In thanksgiving for the mission and all who worship here.','2026-02-01T11:15:00.000Z'),
    ('demo_st_fiacre_demo_don_023','peter.novak@email.com','Peter Novak',75000,1,'Praying this roof protects the church for many years.','2026-02-22T09:45:00.000Z'),
    ('demo_st_fiacre_demo_don_024','anna.kozlov@email.com','Anna Kozlov',100000,0,'For our children and the future of the parish.','2026-03-15T10:30:00.000Z'),
    ('demo_st_fiacre_demo_don_025','nikolai.volkov@email.com','Nikolai Volkov',125000,0,'Glory to God for this parish and the work ahead.','2026-04-05T13:00:00.000Z'),
    ('demo_st_fiacre_demo_don_026','elena.sokolov@email.com','Elena Sokolov',65000,0,'With love for our parish home.','2026-05-03T10:00:00.000Z'),
    ('demo_st_fiacre_demo_don_027','dmitri.morozov@email.com','Dmitri Morozov',80000,1,'For the continued life of the parish.','2026-06-07T12:30:00.000Z'),
    ('demo_st_fiacre_demo_don_028','sophia.lebedev@email.com','Sophia Lebedev',55000,0,'May this church shelter generations to come.','2026-07-05T09:30:00.000Z')
)
INSERT OR REPLACE INTO donor_offerings
  (id,donor_email,parish_id,payment_intent_id,status,payment_status,created_at,updated_at,data)
SELECT
  id,
  email,
  'st-fiacre',
  'pi_' || id,
  'completed',
  'paid',
  gift_date,
  gift_date,
  json_object(
    'donorName', name,
    'donorEmail', email,
    'amountCents', amount_cents,
    'giftAmountCents', amount_cents,
    'parishNetCents', amount_cents,
    'fund', 'Church Roof Restoration',
    'giftType', 'campaign',
    'campaign', 'Church Roof Restoration',
    'campaignId', 'alms',
    'campaignDescription', 'Demo gift for the roof restoration campaign.',
    'publicAnonymous', json(CASE WHEN is_anonymous=1 THEN 'true' ELSE 'false' END),
    'publicDisplayName', CASE WHEN is_anonymous=1 THEN 'Anonymous' ELSE name END,
    'publicComment', comment,
    'parishId', 'st-fiacre',
    'currency', 'usd',
    'status', 'completed',
    'paymentStatus', 'paid',
    'isRecurring', json('false'),
    'createdAt', gift_date
  )
FROM gifts;

UPDATE registrations
SET data = json_set(
      data,
      '$.campaigns[' || (
        SELECT key
        FROM json_each(registrations.data, '$.campaigns')
        WHERE lower(COALESCE(json_extract(value, '$.id'), '')) = 'alms'
           OR lower(COALESCE(json_extract(value, '$.slug'), '')) IN ('roof-campaign','roof-restoration')
           OR lower(COALESCE(json_extract(value, '$.name'), '')) = 'church roof restoration'
        LIMIT 1
      ) || '].raisedCents', 557500,
      '$.campaigns[' || (
        SELECT key
        FROM json_each(registrations.data, '$.campaigns')
        WHERE lower(COALESCE(json_extract(value, '$.id'), '')) = 'alms'
           OR lower(COALESCE(json_extract(value, '$.slug'), '')) IN ('roof-campaign','roof-restoration')
           OR lower(COALESCE(json_extract(value, '$.name'), '')) = 'church roof restoration'
        LIMIT 1
      ) || '].giftCount', 8
    ),
    updated_at = datetime('now')
WHERE parish_id = 'st-fiacre'
  AND EXISTS (
    SELECT 1
    FROM json_each(registrations.data, '$.campaigns')
    WHERE lower(COALESCE(json_extract(value, '$.id'), '')) = 'alms'
       OR lower(COALESCE(json_extract(value, '$.slug'), '')) IN ('roof-campaign','roof-restoration')
       OR lower(COALESCE(json_extract(value, '$.name'), '')) = 'church roof restoration'
  );
