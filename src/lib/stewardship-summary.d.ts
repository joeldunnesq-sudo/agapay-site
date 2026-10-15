export interface GivingSummaryResult {
  [field: string]: unknown;
  total_actual_cents?: unknown;
  total_pledged_cents?: unknown;
  pledge_actual_cents?: unknown;
  active_donors?: unknown;
  pledging_donors?: unknown;
  fulfillment_rate_pct?: unknown;
  manual_income_cents?: unknown;
}
export function stewardshipGivingSummary(
  env: { AGAPAY_DB: D1Database },
  parishId: string,
  year: number,
  manualIncomeLoader: (
    env: { AGAPAY_DB: D1Database },
    parishId: string,
    startDate: string,
    endDate: string
  ) => Promise<number>
): Promise<GivingSummaryResult>;
