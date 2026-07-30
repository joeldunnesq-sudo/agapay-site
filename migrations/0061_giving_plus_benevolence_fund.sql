-- Giving Plus and higher tiers use Benevolence Fund as the canonical
-- destination for alms, including patronal and major-feast offerings.
-- Campaigns remain opt-in and are intentionally not created here.
UPDATE registrations
SET
  data = json_set(
    data,
    '$.funds',
    json_insert(
      CASE
        WHEN json_type(data, '$.funds') = 'array' THEN json_extract(data, '$.funds')
        ELSE json('[]')
      END,
      '$[#]',
      json_object(
        'id', 'benevolence-fund',
        'name', 'Benevolence Fund',
        'restrictionType', 'donor_restricted_temporary',
        'description', 'Alms designated exclusively for the poor and needy.',
        'sortOrder', 3
      )
    )
  ),
  updated_at = datetime('now')
WHERE lower(COALESCE(json_extract(data, '$.subscriptionTier'), '')) IN (
  'giving',
  'stewardship',
  'parish',
  'diocese',
  'monastery_free'
)
AND NOT EXISTS (
  SELECT 1
  FROM json_each(
    CASE
      WHEN json_type(registrations.data, '$.funds') = 'array'
        THEN json_extract(registrations.data, '$.funds')
      ELSE json('[]')
    END
  ) AS fund
  WHERE lower(COALESCE(json_extract(fund.value, '$.id'), '')) = 'benevolence-fund'
     OR lower(COALESCE(json_extract(fund.value, '$.reportCode'), '')) = 'alms'
     OR lower(COALESCE(json_extract(fund.value, '$.name'), '')) = 'benevolence fund'
);
