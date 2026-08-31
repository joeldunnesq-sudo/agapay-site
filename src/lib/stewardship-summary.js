import { parishPledgeReceivedCents } from './outside-pledges.js';

export async function stewardshipGivingSummary(env, parishId, year, manualIncomeTotalCents) {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const today = new Date();
  const dayOfYear = Math.max(1, Math.ceil((today - new Date(`${year}-01-01`)) / 86400000));
  const daysInYear = year % 4 === 0 ? 366 : 365;

  const [pledgeRow, actualRow, priorRow, manualCurrentCents, manualPriorCents] = await Promise.all([
    env.AGAPAY_DB.prepare(
      `
      SELECT COUNT(*) AS pledging_donors, SUM(target_amount_cents) AS total_pledged_cents
      FROM household_pledges WHERE parish_id = ? AND fiscal_year = ?
    `
    )
      .bind(parishId, year)
      .first(),

    env.AGAPAY_DB.prepare(
      `
      SELECT
        COUNT(DISTINCT donor_email) AS active_donors,
        SUM(COALESCE(json_extract(data, '$.giftAmountCents'), json_extract(data, '$.amountCents'), 0)) AS total_actual_cents
      FROM donor_offerings
      WHERE parish_id = ? AND payment_status IN ('paid', 'succeeded')
        AND created_at >= ? AND created_at < datetime(?, '+1 day')
    `
    )
      .bind(parishId, yearStart, yearEnd)
      .first(),

    env.AGAPAY_DB.prepare(
      `
      SELECT SUM(COALESCE(json_extract(data, '$.giftAmountCents'), json_extract(data, '$.amountCents'), 0)) AS total_prior_cents
      FROM donor_offerings
      WHERE parish_id = ? AND payment_status IN ('paid', 'succeeded')
        AND created_at >= ? AND created_at < datetime(?, '+1 day')
    `
    )
      .bind(parishId, `${year - 1}-01-01`, `${year - 1}-12-31`)
      .first(),

    manualIncomeTotalCents(env, parishId, yearStart, yearEnd),
    manualIncomeTotalCents(env, parishId, `${year - 1}-01-01`, `${year - 1}-12-31`),
  ]);

  const totalPledged = pledgeRow?.total_pledged_cents || 0;
  const totalActual = (actualRow?.total_actual_cents || 0) + manualCurrentCents;
  const totalPrior = (priorRow?.total_prior_cents || 0) + manualPriorCents;
  const runRate = Math.round((totalActual / dayOfYear) * daysInYear);
  const pledgeActual = await parishPledgeReceivedCents(env, parishId, year);
  const fulfillment = totalPledged > 0 ? Math.round((pledgeActual / totalPledged) * 100) : null;
  const avgPerDonor = (actualRow?.active_donors || 0) > 0 ? Math.round(totalActual / actualRow.active_donors) : 0;

  return {
    fiscal_year: year,
    pledging_donors: pledgeRow?.pledging_donors || 0,
    active_donors: actualRow?.active_donors || 0,
    total_pledged_cents: totalPledged,
    pledge_actual_cents: pledgeActual,
    total_actual_cents: totalActual,
    manual_income_cents: manualCurrentCents,
    prior_year_actual_cents: totalPrior,
    run_rate_cents: runRate,
    fulfillment_rate_pct: fulfillment,
    avg_per_donor_cents: avgPerDonor,
    day_of_year: dayOfYear,
    days_in_year: daysInYear,
  };
}
