import type { DatabaseReadEnv } from './database-reads.js';

// Database values stay unknown until the original numeric coercion runs.
export interface OutsidePledgeRow {
  donor_email: unknown;
  given_cents: unknown;
}
export interface PledgeDonor {
  readonly defaultParishId?: string | null;
  readonly email?: unknown;
}
export interface PledgeSummary {
  year: number;
  stewardshipYtdCents: number;
  stewardshipMonthCents: number;
}
export interface OutsidePledgeAmounts {
  outsidePledgeYtdCents: number;
  outsidePledgeMonthCents: number;
}
export type AugmentedPledgeSummary<Summary extends PledgeSummary> = Omit<
  Summary,
  'stewardshipYtdCents' | 'stewardshipMonthCents' | keyof OutsidePledgeAmounts
> &
  Pick<PledgeSummary, 'stewardshipYtdCents' | 'stewardshipMonthCents'> &
  OutsidePledgeAmounts;

// Pledge designation is independent of fund allocation. Received date remains the
// financial/reporting date; pledge_year identifies the obligation being fulfilled.
export async function outsidePledgeGiving(
  env: DatabaseReadEnv,
  parishId: string,
  year: number
): Promise<OutsidePledgeRow[]> {
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
      .all<OutsidePledgeRow>();
    return result.results;
  } catch (error) {
    if (
      /no such table: (outside_gift_details|manual_income_entries)/i.test((error as { message?: string }).message || '')
    )
      return [];
    throw error;
  }
}

export async function parishPledgeReceivedCents(
  env: Pick<Env, 'AGAPAY_DB'>,
  parishId: string,
  year: number
): Promise<number> {
  const online = await env.AGAPAY_DB.prepare(
    `SELECT COALESCE(SUM(COALESCE(json_extract(o.data,'$.giftAmountCents'),json_extract(o.data,'$.amountCents'),0)),0) cents
    FROM donor_offerings o WHERE o.parish_id=? AND o.payment_status IN ('paid','succeeded')
    AND o.created_at>=? AND o.created_at<?
    AND lower(COALESCE(json_extract(o.data,'$.giftType'),'stewardship')) IN ('stewardship','general')
    AND EXISTS(SELECT 1 FROM household_pledges p WHERE p.parish_id=o.parish_id AND lower(p.donor_email)=lower(o.donor_email) AND p.fiscal_year=? AND p.target_amount_cents>0)`
  )
    .bind(parishId, `${year}-01-01`, `${year + 1}-01-01`, year)
    .first<{ cents: unknown }>();
  return (
    Number(online!.cents) +
    (await outsidePledgeGiving(env, parishId, year)).reduce((sum, row) => sum + Number(row.given_cents), 0)
  );
}

export async function addOutsideDonorPledgeSummary<Summary extends PledgeSummary>(
  env: DatabaseReadEnv,
  donor: PledgeDonor,
  summary: Summary,
  now: Date = new Date()
): Promise<Summary | AugmentedPledgeSummary<Summary>> {
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
      .first<{ ytd: unknown; monthly: unknown }>();
    return {
      ...summary,
      stewardshipYtdCents: summary.stewardshipYtdCents + Number(result!.ytd),
      stewardshipMonthCents: summary.stewardshipMonthCents + Number(result!.monthly),
      outsidePledgeYtdCents: Number(result!.ytd),
      outsidePledgeMonthCents: Number(result!.monthly),
    };
  } catch (error) {
    if (
      /no such table: (outside_gift_details|manual_income_entries)/i.test((error as { message?: string }).message || '')
    )
      return summary;
    throw error;
  }
}
