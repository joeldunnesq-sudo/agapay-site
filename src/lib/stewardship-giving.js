// Received gifts for the recurring / one-time chart. Keep this separate from
// monthly recurring revenue, which projects the active subscription run rate.
export async function readStewardshipGivingMix(env, parishId, year) {
  return env.AGAPAY_DB.prepare(`
    SELECT
      COALESCE(SUM(COALESCE(json_extract(data, '$.giftAmountCents'), json_extract(data, '$.amountCents'), 0)), 0) AS total_cents,
      COALESCE(SUM(CASE WHEN stripe_subscription_id IS NOT NULL AND stripe_subscription_id != ''
        THEN COALESCE(json_extract(data, '$.giftAmountCents'), json_extract(data, '$.amountCents'), 0)
        ELSE 0 END), 0) AS recurring_received_cents
    FROM donor_offerings
    WHERE parish_id = ? AND payment_status = 'paid' AND created_at >= ? AND created_at < ?
  `).bind(parishId, `${year}-01-01`, `${year + 1}-01-01`).first();
}
