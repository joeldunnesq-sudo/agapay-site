// Qualified outside gifts share one definition across giving and council reports.
export async function manualIncomeTotalCents(
  env: Pick<Env, 'AGAPAY_DB'>,
  parishId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  try {
    const row = await env.AGAPAY_DB.prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total_cents
       FROM manual_income_entries
       WHERE parish_id = ? AND contribution_eligible = 1 AND entry_date BETWEEN ? AND ?`
    )
      .bind(parishId, startDate, endDate)
      .first<{ total_cents: unknown }>();
    return Number(row?.total_cents || 0);
  } catch (error) {
    if (/no such table: manual_income_entries/i.test((error as { message?: string }).message || '')) return 0;
    throw error;
  }
}
