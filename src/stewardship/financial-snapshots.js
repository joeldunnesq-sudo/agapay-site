import { d1First, d1Run, generateSecret } from "../lib/core.js";

const cents = (value) => Math.round(Number(value || 0));
const snapshotId = () => generateSecret(16);

export async function upsertStewardshipFinancialSnapshot(env, {
  parishId,
  annualMeetingId = null,
  fiscalYear,
  title = "",
  totalIncomeCents = 0,
  totalExpenseCents = 0,
  netCents,
  notes = "",
  restrictedFunds = [],
  importedFromAccountingAt,
  replaceRestrictedFunds,
  now = new Date().toISOString(),
  idFactory = snapshotId,
} = {}) {
  let meetingId = annualMeetingId;
  let createdMeeting = false;
  if (meetingId) {
    const meeting = await d1First(
      env,
      "SELECT id FROM stewardship_annual_meetings WHERE id = ? AND parish_id = ?",
      meetingId,
      parishId,
    );
    if (!meeting) {
      const error = new Error("Meeting not found for this parish");
      error.status = 404;
      throw error;
    }
  } else {
    const year = Number.parseInt(fiscalYear, 10);
    if (!Number.isInteger(year)) {
      const error = new Error("Fiscal year is required");
      error.status = 422;
      throw error;
    }
    meetingId = idFactory();
    createdMeeting = true;
    await d1Run(
      env,
      `INSERT INTO stewardship_annual_meetings
         (id, parish_id, title, fiscal_year, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'draft', ?, ?)`,
      meetingId,
      parishId,
      title || `${year} Financial Snapshot`,
      year,
      now,
      now,
    );
  }

  const income = cents(totalIncomeCents);
  const expense = cents(totalExpenseCents);
  const net = Math.round(Number(netCents ?? (income - expense)));
  const existing = await d1First(
    env,
    "SELECT id FROM stewardship_financial_summaries WHERE annual_meeting_id = ?",
    meetingId,
  );
  if (existing) {
    if (importedFromAccountingAt === undefined) {
      await d1Run(
        env,
        `UPDATE stewardship_financial_summaries
         SET total_income_cents = ?, total_expense_cents = ?, net_cents = ?, notes = ?,
             snapshot_taken_at = ?, updated_at = ?
         WHERE id = ?`,
        income,
        expense,
        net,
        notes || null,
        now,
        now,
        existing.id,
      );
    } else {
      await d1Run(
        env,
        `UPDATE stewardship_financial_summaries
         SET total_income_cents = ?, total_expense_cents = ?, net_cents = ?, notes = ?,
             snapshot_taken_at = ?, imported_from_accounting_at = ?, updated_at = ?
         WHERE id = ?`,
        income,
        expense,
        net,
        notes || null,
        now,
        importedFromAccountingAt || null,
        now,
        existing.id,
      );
    }
  } else {
    await d1Run(
      env,
      `INSERT INTO stewardship_financial_summaries
         (id, annual_meeting_id, total_income_cents, total_expense_cents, net_cents, notes,
          snapshot_taken_at, imported_from_accounting_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      idFactory(),
      meetingId,
      income,
      expense,
      net,
      notes || null,
      now,
      importedFromAccountingAt || null,
      now,
      now,
    );
  }

  const shouldReplaceFunds = replaceRestrictedFunds === undefined
    ? Array.isArray(restrictedFunds) && restrictedFunds.length > 0
    : Boolean(replaceRestrictedFunds);
  if (shouldReplaceFunds && !createdMeeting) {
    await d1Run(
      env,
      "DELETE FROM stewardship_restricted_fund_snapshots WHERE annual_meeting_id = ?",
      meetingId,
    );
  }
  if (Array.isArray(restrictedFunds) && (createdMeeting || shouldReplaceFunds)) {
    for (let index = 0; index < restrictedFunds.length; index += 1) {
      const fund = restrictedFunds[index];
      if (!fund.fundName?.trim()) continue;
      await d1Run(
        env,
        `INSERT INTO stewardship_restricted_fund_snapshots
           (id, annual_meeting_id, fund_name, beginning_balance_cents, total_received_cents,
            total_disbursed_cents, ending_balance_cents, notes, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        idFactory(),
        meetingId,
        fund.fundName.trim(),
        cents(fund.beginningBalanceCents),
        cents(fund.totalReceivedCents),
        cents(fund.totalDisbursedCents),
        cents(fund.endingBalanceCents),
        fund.notes || null,
        index,
        now,
      );
    }
  }

  return Object.freeze({
    annualMeetingId: meetingId,
    importedFromAccountingAt: importedFromAccountingAt || null,
  });
}
