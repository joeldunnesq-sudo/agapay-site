-- Bring the legacy Stewardship Health report categories into the parish-managed
-- Funds & Alms catalog. Each statement is idempotent and preserves parish edits.

UPDATE registrations
SET data = json_insert(data, '$.funds[#]', json('{"id":"stewardship","name":"General Stewardship","restrictionType":"unrestricted","description":"General stewardship and parish operating support.","isDefault":true,"sortOrder":0}')),
    updated_at = datetime('now')
WHERE parish_id = 'st-fiacre'
  AND NOT EXISTS (
    SELECT 1 FROM json_each(registrations.data, '$.funds')
    WHERE lower(COALESCE(json_extract(value, '$.id'), '')) = 'stewardship'
       OR lower(COALESCE(json_extract(value, '$.name'), '')) = 'general stewardship'
  );

UPDATE registrations
SET data = json_insert(data, '$.funds[#]', json('{"id":"candle","name":"Candles / Vigil Lights","restrictionType":"donor_restricted_temporary","description":"Offerings designated for candles and vigil lights.","sortOrder":1}')),
    updated_at = datetime('now')
WHERE parish_id = 'st-fiacre'
  AND NOT EXISTS (SELECT 1 FROM json_each(registrations.data, '$.funds') WHERE lower(COALESCE(json_extract(value, '$.id'), '')) = 'candle');

UPDATE registrations
SET data = json_insert(data, '$.funds[#]', json('{"id":"building","name":"Building Fund","restrictionType":"donor_restricted_temporary","description":"Gifts designated for parish building needs.","sortOrder":2}')),
    updated_at = datetime('now')
WHERE parish_id = 'st-fiacre'
  AND NOT EXISTS (SELECT 1 FROM json_each(registrations.data, '$.funds') WHERE lower(COALESCE(json_extract(value, '$.id'), '')) = 'building');

UPDATE registrations
SET data = json_insert(data, '$.funds[#]', json('{"id":"alms","name":"Poor Box / Alms","restrictionType":"donor_restricted_temporary","description":"Alms designated for the poor and needy.","sortOrder":3}')),
    updated_at = datetime('now')
WHERE parish_id = 'st-fiacre'
  AND NOT EXISTS (SELECT 1 FROM json_each(registrations.data, '$.funds') WHERE lower(COALESCE(json_extract(value, '$.id'), '')) = 'alms');

UPDATE registrations
SET data = json_insert(data, '$.funds[#]', json('{"id":"campaign","name":"Campaign / Appeal","restrictionType":"donor_restricted_temporary","description":"Gifts designated for a parish campaign or appeal.","sortOrder":4}')),
    updated_at = datetime('now')
WHERE parish_id = 'st-fiacre'
  AND NOT EXISTS (SELECT 1 FROM json_each(registrations.data, '$.funds') WHERE lower(COALESCE(json_extract(value, '$.id'), '')) = 'campaign');

UPDATE registrations
SET data = json_insert(data, '$.funds[#]', json('{"id":"iconography","name":"Iconography Fund","restrictionType":"donor_restricted_temporary","description":"Gifts designated for parish iconography.","sortOrder":5}')),
    updated_at = datetime('now')
WHERE parish_id = 'st-fiacre'
  AND NOT EXISTS (SELECT 1 FROM json_each(registrations.data, '$.funds') WHERE lower(COALESCE(json_extract(value, '$.id'), '')) = 'iconography');

UPDATE registrations
SET data = json_insert(data, '$.funds[#]', json('{"id":"memorial","name":"Memorial / Panakhida","restrictionType":"donor_restricted_temporary","description":"Offerings designated for memorials and panakhidas.","sortOrder":6}')),
    updated_at = datetime('now')
WHERE parish_id = 'st-fiacre'
  AND NOT EXISTS (SELECT 1 FROM json_each(registrations.data, '$.funds') WHERE lower(COALESCE(json_extract(value, '$.id'), '')) = 'memorial');
-- Original filename retained because D1 identifies applied migrations by filename.
