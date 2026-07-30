-- Correct the St. Fiacre Benevolence Fund classification. Gifts to this fund
-- may be used only for assistance to the poor and needy, so the fund is
-- donor-restricted rather than unrestricted.
UPDATE registrations
SET data = json_set(
      data,
      '$.funds[' || (
        SELECT item.key
        FROM json_each(registrations.data, '$.funds') AS item
        WHERE lower(COALESCE(json_extract(item.value, '$.id'), '')) = 'benevolence-fund'
           OR lower(COALESCE(json_extract(item.value, '$.name'), '')) = 'benevolence fund'
        LIMIT 1
      ) || '].restrictionType',
      'donor_restricted_temporary'
    ),
    updated_at = datetime('now')
WHERE parish_id = 'st-fiacre'
  AND EXISTS (
    SELECT 1
    FROM json_each(registrations.data, '$.funds') AS item
    WHERE lower(COALESCE(json_extract(item.value, '$.id'), '')) = 'benevolence-fund'
       OR lower(COALESCE(json_extract(item.value, '$.name'), '')) = 'benevolence fund'
  );
-- Original filename retained because D1 identifies applied migrations by filename.
