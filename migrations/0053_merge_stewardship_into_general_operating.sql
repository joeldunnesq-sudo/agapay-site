-- General stewardship is unrestricted parish operating support, not a
-- separate fund. Campaigns publish their own individual accounting funds, so
-- the old generic Campaign / Appeal placeholder is also retired.

-- If a parish only has the legacy stewardship fund, preserve its position
-- while converting it to the canonical General Operating identity.
UPDATE registrations
SET data = json_set(
      data,
      '$.funds[' || (
        SELECT key
        FROM json_each(registrations.data, '$.funds')
        WHERE lower(COALESCE(json_extract(value, '$.id'), '')) = 'stewardship'
           OR lower(COALESCE(json_extract(value, '$.code'), '')) = 'stewardship'
           OR lower(COALESCE(json_extract(value, '$.name'), '')) = 'general stewardship'
        LIMIT 1
      ) || '].id', 'general',
      '$.funds[' || (
        SELECT key
        FROM json_each(registrations.data, '$.funds')
        WHERE lower(COALESCE(json_extract(value, '$.id'), '')) = 'stewardship'
           OR lower(COALESCE(json_extract(value, '$.code'), '')) = 'stewardship'
           OR lower(COALESCE(json_extract(value, '$.name'), '')) = 'general stewardship'
        LIMIT 1
      ) || '].code', 'general',
      '$.funds[' || (
        SELECT key
        FROM json_each(registrations.data, '$.funds')
        WHERE lower(COALESCE(json_extract(value, '$.id'), '')) = 'stewardship'
           OR lower(COALESCE(json_extract(value, '$.code'), '')) = 'stewardship'
           OR lower(COALESCE(json_extract(value, '$.name'), '')) = 'general stewardship'
        LIMIT 1
      ) || '].name', 'General Operating Fund',
      '$.funds[' || (
        SELECT key
        FROM json_each(registrations.data, '$.funds')
        WHERE lower(COALESCE(json_extract(value, '$.id'), '')) = 'stewardship'
           OR lower(COALESCE(json_extract(value, '$.code'), '')) = 'stewardship'
           OR lower(COALESCE(json_extract(value, '$.name'), '')) = 'general stewardship'
        LIMIT 1
      ) || '].accountingFundId', 'fund_general',
      '$.funds[' || (
        SELECT key
        FROM json_each(registrations.data, '$.funds')
        WHERE lower(COALESCE(json_extract(value, '$.id'), '')) = 'stewardship'
           OR lower(COALESCE(json_extract(value, '$.code'), '')) = 'stewardship'
           OR lower(COALESCE(json_extract(value, '$.name'), '')) = 'general stewardship'
        LIMIT 1
      ) || '].accountNumber', 'GENERAL',
      '$.funds[' || (
        SELECT key
        FROM json_each(registrations.data, '$.funds')
        WHERE lower(COALESCE(json_extract(value, '$.id'), '')) = 'stewardship'
           OR lower(COALESCE(json_extract(value, '$.code'), '')) = 'stewardship'
           OR lower(COALESCE(json_extract(value, '$.name'), '')) = 'general stewardship'
        LIMIT 1
      ) || '].restrictionType', 'unrestricted',
      '$.funds[' || (
        SELECT key
        FROM json_each(registrations.data, '$.funds')
        WHERE lower(COALESCE(json_extract(value, '$.id'), '')) = 'stewardship'
           OR lower(COALESCE(json_extract(value, '$.code'), '')) = 'stewardship'
           OR lower(COALESCE(json_extract(value, '$.name'), '')) = 'general stewardship'
        LIMIT 1
      ) || '].isDefault', json('true'),
      '$.funds[' || (
        SELECT key
        FROM json_each(registrations.data, '$.funds')
        WHERE lower(COALESCE(json_extract(value, '$.id'), '')) = 'stewardship'
           OR lower(COALESCE(json_extract(value, '$.code'), '')) = 'stewardship'
           OR lower(COALESCE(json_extract(value, '$.name'), '')) = 'general stewardship'
        LIMIT 1
      ) || '].sortOrder', 0
    ),
    updated_at = datetime('now')
WHERE json_type(data, '$.funds') = 'array'
  AND NOT EXISTS (
    SELECT 1 FROM json_each(registrations.data, '$.funds')
    WHERE lower(COALESCE(json_extract(value, '$.id'), '')) = 'general'
       OR lower(COALESCE(json_extract(value, '$.code'), '')) = 'general'
       OR lower(COALESCE(json_extract(value, '$.name'), '')) = 'general operating fund'
  )
  AND EXISTS (
    SELECT 1 FROM json_each(registrations.data, '$.funds')
    WHERE lower(COALESCE(json_extract(value, '$.id'), '')) = 'stewardship'
       OR lower(COALESCE(json_extract(value, '$.code'), '')) = 'stewardship'
       OR lower(COALESCE(json_extract(value, '$.name'), '')) = 'general stewardship'
  );

-- Canonicalize General Operating and remove duplicate General Stewardship and
-- generic Campaign / Appeal entries from every parish catalog.
UPDATE registrations
SET data = json_set(
      data,
      '$.funds',
      json((
        SELECT json_group_array(json(
          CASE
            WHEN lower(COALESCE(json_extract(value, '$.id'), '')) = 'general'
              OR lower(COALESCE(json_extract(value, '$.code'), '')) = 'general'
              OR lower(COALESCE(json_extract(value, '$.name'), '')) = 'general operating fund'
            THEN json_set(
              value,
              '$.id', 'general',
              '$.code', 'general',
              '$.name', 'General Operating Fund',
              '$.accountingFundId', 'fund_general',
              '$.accountNumber', 'GENERAL',
              '$.restrictionType', 'unrestricted',
              '$.isDefault', json('true'),
              '$.sortOrder', 0
            )
            ELSE value
          END
        ))
        FROM json_each(registrations.data, '$.funds')
        WHERE NOT (
          lower(COALESCE(json_extract(value, '$.id'), '')) = 'stewardship'
          OR lower(COALESCE(json_extract(value, '$.code'), '')) = 'stewardship'
          OR lower(COALESCE(json_extract(value, '$.name'), '')) = 'general stewardship'
          OR lower(COALESCE(json_extract(value, '$.id'), '')) = 'campaign'
          OR lower(COALESCE(json_extract(value, '$.code'), '')) = 'campaign'
          OR lower(COALESCE(json_extract(value, '$.name'), '')) = 'campaign / appeal'
        )
      ))
    ),
    updated_at = datetime('now')
WHERE json_type(data, '$.funds') = 'array';

-- Existing feast campaigns keep their solicitation identity but now point to
-- an existing parish fund. Benevolence is the safe default until the parish
-- explicitly chooses General Operating or another designated fund.
UPDATE registrations
SET data = json_set(
      data,
      '$.feastCampaigns',
      json((
        SELECT json_group_array(json(
          CASE
            WHEN COALESCE(json_extract(value, '$.destinationFundId'), '') = ''
            THEN json_set(value, '$.destinationFundId', 'benevolence-fund')
            ELSE value
          END
        ))
        FROM json_each(registrations.data, '$.feastCampaigns')
      ))
    ),
    updated_at = datetime('now')
WHERE json_type(data, '$.feastCampaigns') = 'array';

-- Normalize historical giving records so reports and exports use the same
-- General Operating identity as all new stewardship gifts.
UPDATE donor_offerings
SET data = json_set(
      data,
      '$.fund', 'General Operating Fund',
      '$.fundId', 'general'
    ),
    updated_at = datetime('now')
WHERE lower(COALESCE(json_extract(data, '$.giftType'), '')) IN ('stewardship', 'general')
   OR lower(COALESCE(json_extract(data, '$.fund'), '')) IN ('stewardship', 'general stewardship', 'general operating fund')
   OR lower(COALESCE(json_extract(data, '$.fundId'), '')) IN ('stewardship', 'general');

-- The central reporting catalog follows the same canonical identity.
DELETE FROM giving_funds
WHERE lower(code) = 'stewardship'
  AND EXISTS (
    SELECT 1 FROM giving_funds AS canonical
    WHERE canonical.parish_id = giving_funds.parish_id
      AND lower(canonical.code) = 'general'
  );

UPDATE giving_funds
SET name = 'General Operating Fund',
    code = 'general',
    is_default = 1,
    sort_order = 0
WHERE lower(code) = 'stewardship';

UPDATE giving_funds
SET name = 'General Operating Fund',
    is_default = 1,
    sort_order = 0
WHERE lower(code) = 'general';

DELETE FROM giving_funds
WHERE lower(code) = 'campaign'
   OR lower(name) = 'campaign / appeal';
