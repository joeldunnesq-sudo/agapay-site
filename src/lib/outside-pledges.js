import { OutsideGiftError } from './outside-gifts.js';

export async function validateOutsidePledge(db, parishId, input, giver) {
  if (input.givingKind !== 'pledge') return;
  if (!giver.email) throw new OutsideGiftError('Pledge payments require a giver with an email-linked pledge.');
  const pledge = await db
    .prepare(
      'SELECT target_amount_cents FROM household_pledges WHERE parish_id=? AND lower(donor_email)=? AND fiscal_year=?'
    )
    .bind(parishId, giver.email.trim().toLowerCase(), input.pledgeYear)
    .first();
  if (!pledge || Number(pledge.target_amount_cents) <= 0)
    throw new OutsideGiftError(
      'This giver has no pledge for the selected year. Have them set their pledge first, or record this as other giving.'
    );
}

// Pledge designation is independent of fund allocation. Received date remains the
// financial/reporting date; pledge_year identifies the obligation being fulfilled.
export async function outsidePledgeGiving(env, parishId, year) {
  if (!env.AGAPAY_DB) return [];
  try {
    const result = await env.AGAPAY_DB.prepare(
      `SELECT
      lower(trim(COALESCE(NULLIF(json_extract(o.data,'$.email'),''),NULLIF(json_extract(o.data,'$.donorEmail'),''),d.giver_email))) donor_email,
      SUM(m.amount_cents) given_cents
      FROM manual_income_entries m JOIN outside_gift_details d ON d.gift_id=m.id AND d.parish_id=m.parish_id
      LEFT JOIN donor_offerings o ON o.id=d.giver_reference_id AND o.parish_id=d.parish_id
      WHERE d.parish_id=? AND d.record_state='active' AND d.giving_kind='pledge' AND d.pledge_year=? AND m.contribution_eligible=1
      GROUP BY donor_email`
    )
      .bind(parishId, year)
      .all();
    return result.results;
  } catch (error) {
    if (/no such table: (outside_gift_details|manual_income_entries)/i.test(error.message || '')) return [];
    throw error;
  }
}

export async function parishPledgeReceivedCents(env, parishId, year) {
  const online = await env.AGAPAY_DB.prepare(
    `SELECT COALESCE(SUM(COALESCE(json_extract(o.data,'$.giftAmountCents'),json_extract(o.data,'$.amountCents'),0)),0) cents
    FROM donor_offerings o WHERE o.parish_id=? AND o.payment_status IN ('paid','succeeded')
    AND o.created_at>=? AND o.created_at<?
    AND lower(COALESCE(json_extract(o.data,'$.giftType'),'stewardship')) IN ('stewardship','general')
    AND EXISTS(SELECT 1 FROM household_pledges p WHERE p.parish_id=o.parish_id AND lower(p.donor_email)=lower(o.donor_email) AND p.fiscal_year=? AND p.target_amount_cents>0)`
  )
    .bind(parishId, `${year}-01-01`, `${year + 1}-01-01`, year)
    .first();
  return (
    Number(online.cents) +
    (await outsidePledgeGiving(env, parishId, year)).reduce((sum, row) => sum + Number(row.given_cents), 0)
  );
}

export async function addOutsideDonorPledgeSummary(env, donor, summary, now = new Date()) {
  if (!env.AGAPAY_DB || !donor.defaultParishId) return summary;
  try {
    const month = now.toISOString().slice(0, 7);
    const result = await env.AGAPAY_DB.prepare(
      `SELECT
      COALESCE(SUM(m.amount_cents),0) ytd,
      COALESCE(SUM(CASE WHEN substr(m.entry_date,1,7)=? THEN m.amount_cents ELSE 0 END),0) monthly
      FROM manual_income_entries m JOIN outside_gift_details d ON d.gift_id=m.id AND d.parish_id=m.parish_id
      LEFT JOIN donor_offerings o ON o.id=d.giver_reference_id AND o.parish_id=d.parish_id
      WHERE d.parish_id=? AND d.record_state='active' AND d.giving_kind='pledge' AND d.pledge_year=? AND m.contribution_eligible=1
      AND lower(trim(COALESCE(NULLIF(json_extract(o.data,'$.email'),''),NULLIF(json_extract(o.data,'$.donorEmail'),''),d.giver_email)))=?`
    )
      .bind(month, donor.defaultParishId, summary.year, String(donor.email).trim().toLowerCase())
      .first();
    return {
      ...summary,
      stewardshipYtdCents: summary.stewardshipYtdCents + Number(result.ytd),
      stewardshipMonthCents: summary.stewardshipMonthCents + Number(result.monthly),
      outsidePledgeYtdCents: Number(result.ytd),
      outsidePledgeMonthCents: Number(result.monthly),
    };
  } catch (error) {
    if (/no such table: (outside_gift_details|manual_income_entries)/i.test(error.message || '')) return summary;
    throw error;
  }
}
