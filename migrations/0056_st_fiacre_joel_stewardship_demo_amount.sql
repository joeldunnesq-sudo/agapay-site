-- The My AGAPAY pledge demo is intended to show $1,500 paid toward Joel's
-- $2,500 annual pledge. Keep every monetary representation of the offering
-- consistent so donor and parish stewardship views calculate the same total.
UPDATE donor_offerings
SET data = json_set(
      data,
      '$.giftAmountCents', 150000,
      '$.amountCents', 150000,
      '$.chargeCents', 150000,
      '$.parishNetCents', 150000,
      '$.fund', 'General Operating Fund',
      '$.fundId', 'general',
      '$.giftType', 'stewardship'
    ),
    updated_at = datetime('now')
WHERE id = 'off_jul_stew_2026'
  AND parish_id = 'st-fiacre';
