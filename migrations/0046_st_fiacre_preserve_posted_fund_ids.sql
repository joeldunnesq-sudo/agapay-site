-- St. Fiacre's seeded giving history is already posted against these ledger
-- fund IDs. Preserve those immutable audit links as the canonical catalog IDs.

UPDATE registrations
SET data = json_set(
  data,
  '$.funds[' || (SELECT key FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'stewardship' LIMIT 1) || '].accountingFundId', 'fund_giving_stewardship',
  '$.funds[' || (SELECT key FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'stewardship' LIMIT 1) || '].accountNumber', 'STEWARDSHIP',
  '$.funds[' || (SELECT key FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'candle' LIMIT 1) || '].accountingFundId', 'fund_giving_candle',
  '$.funds[' || (SELECT key FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'candle' LIMIT 1) || '].accountNumber', 'CANDLE',
  '$.funds[' || (SELECT key FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'building' LIMIT 1) || '].accountingFundId', 'fund_giving_building',
  '$.funds[' || (SELECT key FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'building' LIMIT 1) || '].accountNumber', 'BUILDING-GIVE',
  '$.funds[' || (SELECT key FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'alms' LIMIT 1) || '].accountingFundId', 'fund_giving_alms',
  '$.funds[' || (SELECT key FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'alms' LIMIT 1) || '].accountNumber', 'ALMS',
  '$.funds[' || (SELECT key FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'campaign' LIMIT 1) || '].accountingFundId', 'fund_giving_campaign',
  '$.funds[' || (SELECT key FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'campaign' LIMIT 1) || '].accountNumber', 'CAMPAIGN',
  '$.funds[' || (SELECT key FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'iconography' LIMIT 1) || '].accountingFundId', 'fund_giving_iconography',
  '$.funds[' || (SELECT key FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'iconography' LIMIT 1) || '].accountNumber', 'ICONOGRAPHY',
  '$.funds[' || (SELECT key FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'memorial' LIMIT 1) || '].accountingFundId', 'fund_giving_memorial',
  '$.funds[' || (SELECT key FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'memorial' LIMIT 1) || '].accountNumber', 'MEMORIAL'
),
updated_at = datetime('now')
WHERE parish_id = 'st-fiacre'
  AND EXISTS (SELECT 1 FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'stewardship');
-- Original filename retained because D1 identifies applied migrations by filename.
