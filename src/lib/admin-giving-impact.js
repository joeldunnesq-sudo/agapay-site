// Generated from src/lib/admin-giving-impact.ts by npm run build:server. Do not edit.
import { d1, d1All } from './database-reads.js';
async function loadAdminGivingImpact(env, now = /* @__PURE__ */ new Date()) {
  if (!d1(env)) return null;
  const monthly = Array.from({ length: 12 }, (_, index) => ({
    month: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + index, 1)).toISOString().slice(0, 7),
    cents: 0,
    giftCount: 0,
  }));
  const rows = await d1All(
    env,
    `
    WITH gifts AS (
      SELECT parish_id,
        strftime('%Y-%m', COALESCE(NULLIF(json_extract(data, '$.paidAt'), ''),
                                  NULLIF(json_extract(data, '$.completedAt'), ''), created_at)) AS month,
        NULLIF(lower(trim(donor_email)), '') AS giver,
        NULLIF(json_extract(data, '$.parishName'), '') AS parish_name,
        CAST(COALESCE(json_extract(data, '$.giftAmountCents'),
                      json_extract(data, '$.amountCents'), 0) AS INTEGER)
          - MAX(0, CAST(COALESCE(json_extract(data, '$.refundedCents'), 0) AS INTEGER)) AS cents
      FROM donor_offerings AS offering
      WHERE COALESCE(parish_id, '') <> ''
        AND COALESCE(NULLIF(payment_status, ''), status)
          IN ('paid', 'succeeded', 'complete', 'completed', 'partially_refunded')
        AND COALESCE(json_extract(data, '$.recordType'), '') <> 'subscription_setup'
        AND COALESCE(json_extract(data, '$.source'), '') <> 'outside'
        AND lower(COALESCE(json_extract(data, '$.currency'), 'usd')) = 'usd'
        AND COALESCE(json_extract(data, '$.stripeLivemode'), 1) <> 0
        AND id NOT GLOB 'demo_*' AND id NOT GLOB 'fiacre-don-*'
        AND id NOT IN ('off_jul_stew_2026', 'off_jul_campaign_2026', 'off_jul_candle_2026')
        AND COALESCE(payment_intent_id, '') NOT GLOB 'pi_demo_*'
        AND COALESCE(payment_intent_id, '') NOT GLOB 'pi_fiacre_*'
        AND id NOT GLOB 'cs_test_*'
        AND COALESCE(checkout_session_id, '') NOT GLOB 'cs_test_*'
        AND NOT EXISTS (
          SELECT 1 FROM donor_offerings AS setup
          WHERE setup.stripe_subscription_id = offering.stripe_subscription_id
            AND setup.stripe_subscription_id <> ''
            AND setup.checkout_session_id GLOB 'cs_test_*'
        )
    ), positive_gifts AS (
      SELECT * FROM gifts WHERE cents > 0
    ), parish_names AS (
      SELECT parish_id, MAX(parish_name) AS name
      FROM registrations WHERE COALESCE(parish_id, '') <> '' GROUP BY parish_id
    ), parish_totals AS (
      SELECT parish_id, MAX(parish_name) AS name, SUM(cents) AS cents,
        COUNT(*) AS giftCount, COUNT(DISTINCT giver) AS giverCount
      FROM positive_gifts GROUP BY parish_id
    ), parishes AS (
      SELECT parish_id FROM parish_names UNION SELECT parish_id FROM parish_totals
    )
    SELECT NULL AS month, NULL AS parishId, NULL AS name, COALESCE(SUM(cents), 0) AS cents,
      COUNT(*) AS giftCount, COUNT(DISTINCT giver) AS giverCount
    FROM positive_gifts
    UNION ALL
    SELECT NULL, parishes.parish_id, COALESCE(NULLIF(parish_names.name, ''), parish_totals.name, parishes.parish_id),
      COALESCE(parish_totals.cents, 0), COALESCE(parish_totals.giftCount, 0),
      COALESCE(parish_totals.giverCount, 0)
    FROM parishes
    LEFT JOIN parish_names USING (parish_id)
    LEFT JOIN parish_totals USING (parish_id)
    UNION ALL
    SELECT month, NULL, NULL, SUM(cents), COUNT(*), NULL
    FROM positive_gifts WHERE month BETWEEN ?1 AND ?2 GROUP BY month
    ORDER BY cents DESC, name, parishId
  `,
    monthly[0].month,
    monthly[11].month
  );
  const total = rows.find((row) => row.parishId === null && row.month === null);
  if (!total) return null;
  const monthlyTotals = new Map(rows.filter((row) => row.month).map((row) => [row.month, row]));
  for (const entry of monthly) {
    const totals = monthlyTotals.get(entry.month);
    if (totals) {
      entry.cents = totals.cents;
      entry.giftCount = totals.giftCount;
    }
  }
  const parishes = rows
    .filter((row) => row.parishId !== null)
    .map(({ parishId, name, cents, giftCount, giverCount }) => ({
      parishId,
      name: name || parishId,
      cents,
      giftCount,
      giverCount: giverCount ?? 0,
    }));
  return { cents: total.cents, giftCount: total.giftCount, giverCount: total.giverCount ?? 0, parishes, monthly };
}
export { loadAdminGivingImpact };
