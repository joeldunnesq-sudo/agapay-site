-- Bring St. Fiacre's 2026 demo receipts from $19,410.00 to $52,450.00.
-- The additional $33,040.00 is assigned only to existing named demo donors.
WITH gifts(id,email,name,amount_cents,fund,fund_id,gift_type,gift_date) AS (
  VALUES
    ('demo_st_fiacre_2026_received_001','brendan.murphy@email.com','Brendan Murphy',250000,'General Operating Fund','general','stewardship','2026-01-11T10:20:00.000Z'),
    ('demo_st_fiacre_2026_received_002','james.mcallister@email.com','James McAllister',220000,'General Operating Fund','general','stewardship','2026-01-25T11:35:00.000Z'),
    ('demo_st_fiacre_2026_received_003','thomas.burke@email.com','Thomas Burke',200000,'General Operating Fund','general','stewardship','2026-02-08T09:50:00.000Z'),
    ('demo_st_fiacre_2026_received_004','aine.mcdermott@email.com','Aine McDermott',180000,'General Operating Fund','general','stewardship','2026-02-15T12:10:00.000Z'),
    ('demo_st_fiacre_2026_received_005','colleen.ryan@email.com','Colleen Ryan',170000,'General Operating Fund','general','stewardship','2026-02-28T10:45:00.000Z'),
    ('demo_st_fiacre_2026_received_006','sean.doherty@email.com','Sean Doherty',150000,'General Operating Fund','general','stewardship','2026-03-08T11:05:00.000Z'),
    ('demo_st_fiacre_2026_received_007','patrick.fitzgerald@email.com','Patrick Fitzgerald',150000,'General Operating Fund','general','stewardship','2026-03-22T09:35:00.000Z'),
    ('demo_st_fiacre_2026_received_008','cormac.hayes@email.com','Cormac Hayes',140000,'General Operating Fund','general','stewardship','2026-04-05T12:25:00.000Z'),
    ('demo_st_fiacre_2026_received_009','declan.brennan@email.com','Declan Brennan',130000,'General Operating Fund','general','stewardship','2026-04-12T10:15:00.000Z'),
    ('demo_st_fiacre_2026_received_010','nora.gallagher@email.com','Nora Gallagher',120000,'General Operating Fund','general','stewardship','2026-04-26T11:40:00.000Z'),
    ('demo_st_fiacre_2026_received_011','mary.oconnell@email.com','Mary OConnell',110000,'General Operating Fund','general','stewardship','2026-05-10T09:55:00.000Z'),
    ('demo_st_fiacre_2026_received_012','liam.boyle@email.com','Liam Boyle',100000,'General Operating Fund','general','stewardship','2026-05-17T12:05:00.000Z'),
    ('demo_st_fiacre_2026_received_013','siobhan.kelly@email.com','Siobhan Kelly',90000,'General Operating Fund','general','stewardship','2026-05-31T10:30:00.000Z'),
    ('demo_st_fiacre_2026_received_014','roisin.lynch@email.com','Roisin Lynch',80000,'General Operating Fund','general','stewardship','2026-06-07T11:20:00.000Z'),
    ('demo_st_fiacre_2026_received_015','fiona.walsh@email.com','Fiona Walsh',75000,'General Operating Fund','general','stewardship','2026-06-14T09:40:00.000Z'),
    ('demo_st_fiacre_2026_received_016','maeve.quinn@email.com','Maeve Quinn',84000,'General Operating Fund','general','stewardship','2026-06-21T12:35:00.000Z'),
    ('demo_st_fiacre_2026_received_017','maria.petrov@email.com','Maria Petrov',140000,'Building & Maintenance','building','designated','2026-01-18T10:05:00.000Z'),
    ('demo_st_fiacre_2026_received_018','peter.novak@email.com','Peter Novak',160000,'Building & Maintenance','building','designated','2026-02-22T11:50:00.000Z'),
    ('demo_st_fiacre_2026_received_019','anna.kozlov@email.com','Anna Kozlov',180000,'Iconography Fund','iconography','designated','2026-03-29T09:25:00.000Z'),
    ('demo_st_fiacre_2026_received_020','nikolai.volkov@email.com','Nikolai Volkov',200000,'Benevolence Fund','benevolence-fund','designated','2026-04-19T12:20:00.000Z'),
    ('demo_st_fiacre_2026_received_021','elena.sokolov@email.com','Elena Sokolov',125000,'Benevolence Fund','benevolence-fund','designated','2026-05-24T10:40:00.000Z'),
    ('demo_st_fiacre_2026_received_022','dmitri.morozov@email.com','Dmitri Morozov',150000,'Building & Maintenance','building','designated','2026-06-28T11:10:00.000Z'),
    ('demo_st_fiacre_2026_received_023','sophia.lebedev@email.com','Sophia Lebedev',100000,'Iconography Fund','iconography','designated','2026-07-12T09:45:00.000Z')
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
    'chargeCents', amount_cents,
    'parishNetCents', amount_cents,
    'fund', fund,
    'fundId', fund_id,
    'giftType', gift_type,
    'parishId', 'st-fiacre',
    'currency', 'usd',
    'status', 'completed',
    'paymentStatus', 'paid',
    'isRecurring', json('false'),
    'createdAt', gift_date
  )
FROM gifts;
