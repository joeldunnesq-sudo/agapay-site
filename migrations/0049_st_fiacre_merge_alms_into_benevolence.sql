-- "Poor Box / Alms" and "Benevolence Fund" are the same restricted purpose.
-- Keep `alms` as the legacy reporting code, but remove it as a separate
-- parish-managed fund and label its Stewardship report row as Benevolence.

UPDATE registrations
SET data = json_remove(
      data,
      '$.funds[' || (
        SELECT item.key
        FROM json_each(registrations.data, '$.funds') AS item
        WHERE lower(COALESCE(json_extract(item.value, '$.id'), '')) = 'alms'
           OR lower(COALESCE(json_extract(item.value, '$.name'), '')) = 'poor box / alms'
        LIMIT 1
      ) || ']'
    ),
    updated_at = datetime('now')
WHERE parish_id = 'st-fiacre'
  AND EXISTS (
    SELECT 1
    FROM json_each(registrations.data, '$.funds') AS item
    WHERE lower(COALESCE(json_extract(item.value, '$.id'), '')) = 'alms'
       OR lower(COALESCE(json_extract(item.value, '$.name'), '')) = 'poor box / alms'
  );

UPDATE giving_funds
SET name = 'Benevolence Fund'
WHERE parish_id = 'st-fiacre' AND code = 'alms';
