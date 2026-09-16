// Qualified outside gifts share one definition across giving and council reports.
export async function manualIncomeTotalCents(env, parishId, startDate, endDate) {
  try {
    const row = await env.AGAPAY_DB.prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total_cents
       FROM manual_income_entries
       WHERE parish_id = ? AND contribution_eligible = 1 AND entry_date BETWEEN ? AND ?`
    )
      .bind(parishId, startDate, endDate)
      .first();
    return Number(row?.total_cents || 0);
  } catch (error) {
    if (/no such table: manual_income_entries/i.test(error.message || '')) return 0;
    throw error;
  }
}
