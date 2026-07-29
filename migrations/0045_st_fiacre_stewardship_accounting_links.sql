-- Record the deterministic accounting fund IDs/codes created by the shared
-- Funds & Alms publisher for St. Fiacre's repaired Stewardship catalog.

UPDATE registrations
SET data = json_set(
  data,
  '$.funds[' || (SELECT key FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'stewardship' LIMIT 1) || '].accountingFundId', 'fund_operational_a344f661d4e7be6ced03',
  '$.funds[' || (SELECT key FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'stewardship' LIMIT 1) || '].accountNumber', 'GIV-A344F661'
)
WHERE parish_id = 'st-fiacre'
  AND EXISTS (SELECT 1 FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'stewardship');

UPDATE registrations
SET data = json_set(
  data,
  '$.funds[' || (SELECT key FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'candle' LIMIT 1) || '].accountingFundId', 'fund_operational_de1132c9957934c14e3d',
  '$.funds[' || (SELECT key FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'candle' LIMIT 1) || '].accountNumber', 'GIV-DE1132C9'
)
WHERE parish_id = 'st-fiacre'
  AND EXISTS (SELECT 1 FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'candle');

UPDATE registrations
SET data = json_set(
  data,
  '$.funds[' || (SELECT key FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'building' LIMIT 1) || '].accountingFundId', 'fund_operational_30b1ab12710151c9a170',
  '$.funds[' || (SELECT key FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'building' LIMIT 1) || '].accountNumber', 'GIV-30B1AB12'
)
WHERE parish_id = 'st-fiacre'
  AND EXISTS (SELECT 1 FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'building');

UPDATE registrations
SET data = json_set(
  data,
  '$.funds[' || (SELECT key FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'alms' LIMIT 1) || '].accountingFundId', 'fund_operational_92f8582ca6b3a8548c86',
  '$.funds[' || (SELECT key FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'alms' LIMIT 1) || '].accountNumber', 'GIV-92F8582C'
)
WHERE parish_id = 'st-fiacre'
  AND EXISTS (SELECT 1 FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'alms');

UPDATE registrations
SET data = json_set(
  data,
  '$.funds[' || (SELECT key FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'campaign' LIMIT 1) || '].accountingFundId', 'fund_operational_d5cf40fb429d1da54fa5',
  '$.funds[' || (SELECT key FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'campaign' LIMIT 1) || '].accountNumber', 'GIV-D5CF40FB'
)
WHERE parish_id = 'st-fiacre'
  AND EXISTS (SELECT 1 FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'campaign');

UPDATE registrations
SET data = json_set(
  data,
  '$.funds[' || (SELECT key FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'iconography' LIMIT 1) || '].accountingFundId', 'fund_operational_5dd65731511eae0c196e',
  '$.funds[' || (SELECT key FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'iconography' LIMIT 1) || '].accountNumber', 'GIV-5DD65731'
)
WHERE parish_id = 'st-fiacre'
  AND EXISTS (SELECT 1 FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'iconography');

UPDATE registrations
SET data = json_set(
  data,
  '$.funds[' || (SELECT key FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'memorial' LIMIT 1) || '].accountingFundId', 'fund_operational_47d4f1f9d36334fbc670',
  '$.funds[' || (SELECT key FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'memorial' LIMIT 1) || '].accountNumber', 'GIV-47D4F1F9'
)
WHERE parish_id = 'st-fiacre'
  AND EXISTS (SELECT 1 FROM json_each(registrations.data, '$.funds') WHERE json_extract(value, '$.id') = 'memorial');
