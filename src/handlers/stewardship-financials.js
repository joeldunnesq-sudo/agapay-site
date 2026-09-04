// src/handlers/stewardship-financials.js
// Authoritative stewardship financial snapshots and compatibility handling.

import {
  d1All,
  d1First,
  d1Run,
  getBearerToken,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  unauthorized,
} from '../lib/core.js';
import { stewardshipToolAccess as hasStewardshipToolAccess } from '../lib/entitlements.js';
import { STEWARDSHIP_FUND_DEFAULTS } from '../lib/stewardship-funds.js';
import { upsertStewardshipFinancialSnapshot } from '../stewardship/financial-snapshots.js';
import { findRegistrationByParishId, verifyParishDashboardBearer } from './parish.js';

function authoritativeFunds(value) {
  const rows = Array.isArray(value)
    ? value
    : (() => {
        try {
          const parsed = JSON.parse(value || '[]');
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();
  return rows
    .slice(0, 100)
    .map((item, index) => ({
      fundName: String(item?.fundName || '')
        .trim()
        .slice(0, 120),
      beginningBalanceCents: Math.max(0, Math.round(Number(item?.beginningBalanceCents || 0))),
      totalReceivedCents: Math.max(0, Math.round(Number(item?.totalReceivedCents || 0))),
      totalDisbursedCents: Math.max(0, Math.round(Number(item?.totalDisbursedCents || 0))),
      endingBalanceCents: Math.max(0, Math.round(Number(item?.endingBalanceCents || 0))),
      sortOrder: index,
    }))
    .filter((item) => item.fundName);
}

function normalizeExternalAssets(value) {
  const rows = Array.isArray(value)
    ? value
    : (() => {
        try {
          const parsed = JSON.parse(value || '[]');
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();
  const allowedTypes = new Set(['investment', 'endowment', 'real_property', 'external_fund', 'other']);
  return rows
    .slice(0, 100)
    .map((item, index) => {
      const legacyValue = Number(item?.endingBalanceCents || 0);
      const legacyDetail = item?.fundName
        ? `Legacy restricted-fund record; beginning ${Number(item.beginningBalanceCents || 0)}, received ${Number(item.totalReceivedCents || 0)}, disbursed ${Number(item.totalDisbursedCents || 0)}.`
        : '';
      const assetType = allowedTypes.has(item?.assetType) ? item.assetType : 'external_fund';
      return {
        assetType,
        name: String(item?.name || item?.fundName || '')
          .trim()
          .slice(0, 160),
        valueCents: Math.max(0, Math.round(Number(item?.valueCents ?? legacyValue))),
        asOfDate: /^\d{4}-\d{2}-\d{2}$/.test(String(item?.asOfDate || '')) ? String(item.asOfDate) : '',
        notes: String(item?.notes || legacyDetail || '')
          .trim()
          .slice(0, 1000),
        sortOrder: index,
      };
    })
    .filter((item) => item.name);
}

const normalizedFundIdentity = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function normalizeRestrictedFundAdjustments(value) {
  const rows = Array.isArray(value)
    ? value
    : (() => {
        try {
          const parsed = JSON.parse(value || '[]');
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();
  return rows
    .slice(0, 100)
    .map((item) => ({
      fundId: String(item?.fundId || item?.fundCode || item?.fundName || '')
        .trim()
        .slice(0, 160),
      openingBalanceCents: Math.max(0, Math.round(Number(item?.openingBalanceCents || 0))),
      deductionsCents: Math.max(0, Math.round(Number(item?.deductionsCents || 0))),
      notes: String(item?.notes || '')
        .trim()
        .slice(0, 1000),
    }))
    .filter((item) => item.fundId);
}

function normalizeRestrictedFundBalances(value) {
  const rows = Array.isArray(value)
    ? value
    : (() => {
        try {
          const parsed = JSON.parse(value || '[]');
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();
  return rows
    .slice(0, 100)
    .map((item) => ({
      fundId: String(item?.fundId || item?.code || item?.name || '')
        .trim()
        .slice(0, 160),
      endingBalanceCents: Math.round(Number(item?.endingBalanceCents || 0)),
    }))
    .filter((item) => item.fundId);
}

async function automaticRestrictedFunds(
  env,
  parishId,
  year,
  registration,
  adjustmentsValue = [],
  priorBalancesValue = []
) {
  const configuredFunds =
    Array.isArray(registration?.funds) && registration.funds.length ? registration.funds : STEWARDSHIP_FUND_DEFAULTS;
  const catalog = configuredFunds
    .filter((fund) => String(fund?.restrictionType || fund?.restriction_type || '').startsWith('donor_restricted'))
    .map((fund) => ({
      id: String(fund.id || fund.code || '').trim(),
      code: String(fund.code || fund.id || '').trim(),
      name: String(fund.name || fund.id || 'Restricted fund').trim(),
      restrictionType: String(fund.restrictionType || fund.restriction_type || 'donor_restricted_temporary'),
      keys: new Set([fund.id, fund.code, fund.name].map(normalizedFundIdentity).filter(Boolean)),
    }));
  if (!catalog.length) return [];
  const adjustments = normalizeRestrictedFundAdjustments(adjustmentsValue);
  const priorBalances = normalizeRestrictedFundBalances(priorBalancesValue);
  const adjustmentFor = (fund) =>
    adjustments.find((item) => fund.keys.has(normalizedFundIdentity(item.fundId))) || null;
  const priorFor = (fund) => priorBalances.find((item) => fund.keys.has(normalizedFundIdentity(item.fundId))) || null;

  const [agapayRows, outsideRows] = await Promise.all([
    d1All(
      env,
      `SELECT
        COALESCE(json_extract(data, '$.giftType'), json_extract(data, '$.fund'), '') AS fund_key,
        COUNT(*) AS transaction_count,
        COALESCE(SUM(COALESCE(json_extract(data, '$.giftAmountCents'), json_extract(data, '$.amountCents'), 0)), 0) AS total_cents
      FROM donor_offerings
      WHERE parish_id = ? AND payment_status IN ('paid','succeeded')
        AND created_at BETWEEN ? AND ?
      GROUP BY fund_key`,
      parishId,
      `${year}-01-01`,
      `${year}-12-31T23:59:59.999Z`
    ),
    d1All(
      env,
      `SELECT fund_code AS fund_key, COUNT(*) AS transaction_count,
        COALESCE(SUM(amount_cents), 0) AS total_cents
      FROM manual_income_entries
      WHERE parish_id = ? AND contribution_eligible = 1
        AND entry_date BETWEEN ? AND ?
      GROUP BY fund_code`,
      parishId,
      `${year}-01-01`,
      `${year}-12-31`
    ),
  ]);

  const totalFor = (rows, fund) =>
    rows.reduce(
      (summary, row) => {
        if (!fund.keys.has(normalizedFundIdentity(row.fund_key))) return summary;
        summary.amount += Number(row.total_cents || 0);
        summary.count += Number(row.transaction_count || 0);
        return summary;
      },
      { amount: 0, count: 0 }
    );

  return catalog.map((fund) => {
    const agapay = totalFor(agapayRows, fund);
    const outside = totalFor(outsideRows, fund);
    const adjustment = adjustmentFor(fund);
    const openingBalanceCents = adjustment
      ? adjustment.openingBalanceCents
      : Number(priorFor(fund)?.endingBalanceCents || 0);
    const deductionsCents = Number(adjustment?.deductionsCents || 0);
    const receivedCents = agapay.amount + outside.amount;
    return {
      id: fund.id,
      code: fund.code,
      name: fund.name,
      restrictionType: fund.restrictionType,
      agapayReceivedCents: agapay.amount,
      outsideReceivedCents: outside.amount,
      openingBalanceCents,
      receivedCents,
      deductionsCents,
      endingBalanceCents: openingBalanceCents + receivedCents - deductionsCents,
      adjustmentNotes: adjustment?.notes || '',
      transactionCount: agapay.count + outside.count,
      trackingBasis: 'fiscal_year_inflows',
    };
  });
}

async function authoritativeContributionTotals(env, parishId, year) {
  const start = `${year}-01-01`;
  const end = `${year}-12-31T23:59:59.999Z`;
  const [agapay, outside] = await Promise.all([
    d1First(
      env,
      `SELECT COALESCE(SUM(COALESCE(json_extract(data, '$.giftAmountCents'), json_extract(data, '$.amountCents'), 0)), 0) AS total
      FROM donor_offerings
      WHERE parish_id = ? AND payment_status IN ('paid', 'succeeded') AND created_at BETWEEN ? AND ?`,
      parishId,
      start,
      end
    ),
    d1First(
      env,
      `SELECT COALESCE(SUM(amount_cents), 0) AS total
      FROM manual_income_entries
      WHERE parish_id = ? AND contribution_eligible = 1 AND entry_date BETWEEN ? AND ?`,
      parishId,
      start,
      `${year}-12-31`
    ),
  ]);
  return {
    agapayContributionsCents: Number(agapay?.total || 0),
    outsideContributionsCents: Number(outside?.total || 0),
  };
}

function authoritativeSnapshotDto(row, liveContributions) {
  if (!row) return null;
  const agapay = Number(liveContributions?.agapayContributionsCents ?? row.agapay_contributions_cents ?? 0);
  const outside = Number(liveContributions?.outsideContributionsCents ?? row.outside_contributions_cents ?? 0);
  const other = Number(row.other_revenue_cents || 0);
  const expenses = Number(row.total_expense_cents || 0);
  const income = agapay + outside + other;
  return {
    id: row.id,
    title: row.title,
    fiscalYear: Number(row.fiscal_year),
    agapayContributionsCents: agapay,
    outsideContributionsCents: outside,
    otherRevenueCents: other,
    totalIncomeCents: income,
    totalExpenseCents: expenses,
    netCents: income - expenses,
    externalAssets: normalizeExternalAssets(row.external_assets_json || row.restricted_funds_json),
    restrictedFundAdjustments: normalizeRestrictedFundAdjustments(row.restricted_fund_adjustments_json),
    notes: row.notes || '',
    version: Number(row.version || 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadAuthoritativeSnapshot(env, parishId, year) {
  return d1First(
    env,
    `SELECT * FROM stewardship_authoritative_financial_snapshots
    WHERE parish_id = ? AND fiscal_year = ?`,
    parishId,
    year
  );
}

// One authoritative, versioned fiscal-year snapshot. Contribution totals are
// always recalculated server-side; the browser may edit only other revenue,
// expenses, externally held assets, and notes. AGAPAY restricted-fund
// activity is calculated live from designated contribution records.
export async function handleStewardshipFinancials(request, env, parishId) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: 'Parish not found' }, { status: 404 });
  if (!(await verifyParishDashboardBearer(found.registration, getBearerToken(request)))) return unauthorized();
  if (!hasStewardshipToolAccess(found.registration))
    return json({ error: 'Stewardship requires the Stewardship or Parish plan.' }, { status: 403 });

  const url = new URL(request.url);
  const requestedYear = parseInt(url.searchParams.get('year') || new Date().getFullYear(), 10);

  if (request.method === 'GET') {
    const [row, contributions, priorRow, priorContributions] = await Promise.all([
      loadAuthoritativeSnapshot(env, parishId, requestedYear),
      authoritativeContributionTotals(env, parishId, requestedYear),
      loadAuthoritativeSnapshot(env, parishId, requestedYear - 1),
      authoritativeContributionTotals(env, parishId, requestedYear - 1),
    ]);
    const automaticFunds = await automaticRestrictedFunds(
      env,
      parishId,
      requestedYear,
      found.registration,
      row?.restricted_fund_adjustments_json || [],
      priorRow?.restricted_fund_balances_json || []
    );
    const snapshot = authoritativeSnapshotDto(row, contributions);
    const priorYear = authoritativeSnapshotDto(priorRow, priorContributions);
    const revisions = row
      ? await d1All(
          env,
          `SELECT version,total_income_cents,total_expense_cents,net_cents,changed_by,created_at
      FROM stewardship_financial_snapshot_revisions
      WHERE snapshot_id = ? ORDER BY version DESC LIMIT 12`,
          row.id
        )
      : [];
    const provisionalIncome = contributions.agapayContributionsCents + contributions.outsideContributionsCents;
    return json({
      year: requestedYear,
      snapshot,
      contributionTotals: contributions,
      totals: snapshot
        ? {
            totalIncomeCents: snapshot.totalIncomeCents,
            totalExpenseCents: snapshot.totalExpenseCents,
            netCents: snapshot.netCents,
          }
        : {
            totalIncomeCents: provisionalIncome,
            totalExpenseCents: 0,
            netCents: provisionalIncome,
          },
      agapayRestrictedFunds: automaticFunds,
      agapayRestrictedInflowsTotalCents: automaticFunds.reduce((sum, fund) => sum + fund.receivedCents, 0),
      restrictedFundDeductionsTotalCents: automaticFunds.reduce((sum, fund) => sum + fund.deductionsCents, 0),
      restrictedFundBalancesTotalCents: automaticFunds.reduce((sum, fund) => sum + fund.endingBalanceCents, 0),
      externalAssets: snapshot?.externalAssets || [],
      externalAssetsTotalCents: (snapshot?.externalAssets || []).reduce((sum, asset) => sum + asset.valueCents, 0),
      priorYear,
      revisions: revisions.map((revision) => ({
        version: Number(revision.version),
        totalIncomeCents: Number(revision.total_income_cents || 0),
        totalExpenseCents: Number(revision.total_expense_cents || 0),
        netCents: Number(revision.net_cents || 0),
        changedBy: revision.changed_by || '',
        createdAt: revision.created_at,
      })),
    });
  }

  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: 'Invalid JSON' }, { status: 400 });
  const fiscalYear = parseInt(body.fiscalYear || requestedYear, 10);
  if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) {
    return json({ error: 'Choose a valid fiscal year.' }, { status: 400 });
  }
  const otherRevenue = Math.round(Number(body.otherRevenueCents || 0));
  const expenses = Math.round(Number(body.totalExpenseCents || 0));
  if (!Number.isSafeInteger(otherRevenue) || otherRevenue < 0 || !Number.isSafeInteger(expenses) || expenses < 0) {
    return json({ error: 'Revenue and expense amounts must be valid positive amounts.' }, { status: 400 });
  }
  const contributions = await authoritativeContributionTotals(env, parishId, fiscalYear);
  const totalIncome = contributions.agapayContributionsCents + contributions.outsideContributionsCents + otherRevenue;
  const net = totalIncome - expenses;
  const externalAssets = normalizeExternalAssets(body.externalAssets);
  const externalAssetsJson = JSON.stringify(externalAssets);
  const restrictedFundAdjustments = normalizeRestrictedFundAdjustments(body.restrictedFundAdjustments);
  const priorSnapshotRow = await loadAuthoritativeSnapshot(env, parishId, fiscalYear - 1);
  const calculatedRestrictedFunds = await automaticRestrictedFunds(
    env,
    parishId,
    fiscalYear,
    found.registration,
    restrictedFundAdjustments,
    priorSnapshotRow?.restricted_fund_balances_json || []
  );
  const restrictedFundAdjustmentsJson = JSON.stringify(restrictedFundAdjustments);
  const restrictedFundBalancesJson = JSON.stringify(
    calculatedRestrictedFunds.map((fund) => ({
      fundId: fund.id || fund.code || fund.name,
      endingBalanceCents: fund.endingBalanceCents,
    }))
  );
  const notes = String(body.notes || '')
    .trim()
    .slice(0, 5000);
  const title =
    String(body.title || `${fiscalYear} Financial Snapshot`)
      .trim()
      .slice(0, 160) || `${fiscalYear} Financial Snapshot`;
  const now = new Date().toISOString();
  let row = await loadAuthoritativeSnapshot(env, parishId, fiscalYear);
  if (row) {
    await d1Run(
      env,
      `UPDATE stewardship_authoritative_financial_snapshots SET
      title=?,agapay_contributions_cents=?,outside_contributions_cents=?,other_revenue_cents=?,
      total_income_cents=?,total_expense_cents=?,net_cents=?,restricted_funds_json=?,notes=?,
      external_assets_json=?,restricted_fund_adjustments_json=?,restricted_fund_balances_json=?,
      version=version+1,updated_by='parish_dashboard',updated_at=?
      WHERE id=?`,
      title,
      contributions.agapayContributionsCents,
      contributions.outsideContributionsCents,
      otherRevenue,
      totalIncome,
      expenses,
      net,
      '[]',
      notes || null,
      externalAssetsJson,
      restrictedFundAdjustmentsJson,
      restrictedFundBalancesJson,
      now,
      row.id
    );
  } else {
    const id = `stewardship_snapshot_${crypto.randomUUID()}`;
    await d1Run(
      env,
      `INSERT INTO stewardship_authoritative_financial_snapshots
      (id,parish_id,fiscal_year,title,agapay_contributions_cents,outside_contributions_cents,
       other_revenue_cents,total_income_cents,total_expense_cents,net_cents,restricted_funds_json,
       notes,external_assets_json,restricted_fund_adjustments_json,restricted_fund_balances_json,
       version,created_by,updated_by,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,'parish_dashboard','parish_dashboard',?,?)`,
      id,
      parishId,
      fiscalYear,
      title,
      contributions.agapayContributionsCents,
      contributions.outsideContributionsCents,
      otherRevenue,
      totalIncome,
      expenses,
      net,
      '[]',
      notes || null,
      externalAssetsJson,
      restrictedFundAdjustmentsJson,
      restrictedFundBalancesJson,
      now,
      now
    );
  }
  row = await loadAuthoritativeSnapshot(env, parishId, fiscalYear);
  await d1Run(
    env,
    `INSERT INTO stewardship_financial_snapshot_revisions
    (id,snapshot_id,parish_id,fiscal_year,version,title,agapay_contributions_cents,
     outside_contributions_cents,other_revenue_cents,total_income_cents,total_expense_cents,
     net_cents,restricted_funds_json,notes,external_assets_json,
     restricted_fund_adjustments_json,restricted_fund_balances_json,changed_by,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    `stewardship_snapshot_revision_${crypto.randomUUID()}`,
    row.id,
    parishId,
    fiscalYear,
    row.version,
    row.title,
    row.agapay_contributions_cents,
    row.outside_contributions_cents,
    row.other_revenue_cents,
    row.total_income_cents,
    row.total_expense_cents,
    row.net_cents,
    row.restricted_funds_json,
    row.notes,
    row.external_assets_json,
    row.restricted_fund_adjustments_json,
    row.restricted_fund_balances_json,
    'parish_dashboard',
    now
  );
  return json({ ok: true, snapshot: authoritativeSnapshotDto(row, contributions) });
}

// Legacy packet-summary handler retained only for historical route behavior.
// New Stewardship Health traffic uses the authoritative handler above.
async function handleLegacyStewardshipFinancials(request, env, parishId) {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: 'Parish not found' }, { status: 404 });
  if (!(await verifyParishDashboardBearer(found.registration, getBearerToken(request)))) return unauthorized();
  if (!hasStewardshipToolAccess(found.registration))
    return json({ error: 'Stewardship requires the Stewardship or Parish plan.' }, { status: 403 });

  const url = new URL(request.url);
  const year = parseInt(url.searchParams.get('year') || new Date().getFullYear(), 10);

  // ── GET: return aggregated financials for the year ──────────────────────
  if (request.method === 'GET') {
    // Pull all meetings for this parish + year
    const meetings = await d1All(
      env,
      `SELECT id, title, fiscal_year, meeting_date, status FROM stewardship_annual_meetings
       WHERE parish_id = ? AND fiscal_year = ? ORDER BY created_at ASC`,
      parishId,
      year
    );

    if (!meetings.length) {
      return json({ year, meetings: [], financialSummaries: [], restrictedFunds: [], totals: null });
    }

    const meetingIds = meetings.map((m) => m.id);
    const placeholders = meetingIds.map(() => '?').join(',');

    const [financialSummaries, restrictedFunds] = await Promise.all([
      d1All(
        env,
        `SELECT fs.*, am.title AS meeting_title, am.fiscal_year, am.meeting_date
         FROM stewardship_financial_summaries fs
         JOIN stewardship_annual_meetings am ON am.id = fs.annual_meeting_id
         WHERE fs.annual_meeting_id IN (${placeholders})
         ORDER BY am.meeting_date ASC`,
        ...meetingIds
      ),
      d1All(
        env,
        `SELECT rf.*, am.title AS meeting_title, am.fiscal_year
         FROM stewardship_restricted_fund_snapshots rf
         JOIN stewardship_annual_meetings am ON am.id = rf.annual_meeting_id
         WHERE rf.annual_meeting_id IN (${placeholders})
         ORDER BY rf.sort_order ASC`,
        ...meetingIds
      ),
    ]);

    // Aggregate totals across all summaries for the year
    const totals = financialSummaries.length
      ? financialSummaries.reduce(
          (acc, fs) => ({
            totalIncomeCents: acc.totalIncomeCents + (fs.total_income_cents || 0),
            totalExpenseCents: acc.totalExpenseCents + (fs.total_expense_cents || 0),
            netCents: acc.netCents + (fs.net_cents || 0),
          }),
          { totalIncomeCents: 0, totalExpenseCents: 0, netCents: 0 }
        )
      : null;

    // Prior-year totals, for year-over-year comparison badges on the KPI
    // cards. Cheap enough to always fetch alongside the main query — a
    // single aggregate SUM, not a full row fetch like the current year.
    const priorYearRow = await d1All(
      env,
      `SELECT
         COALESCE(SUM(fs.total_income_cents), 0)  AS total_income_cents,
         COALESCE(SUM(fs.total_expense_cents), 0) AS total_expense_cents,
         COALESCE(SUM(fs.net_cents), 0)           AS net_cents,
         COUNT(*)                                  AS packet_count
       FROM stewardship_financial_summaries fs
       JOIN stewardship_annual_meetings am ON am.id = fs.annual_meeting_id
       WHERE am.parish_id = ? AND am.fiscal_year = ?`,
      parishId,
      year - 1
    );
    const priorYear =
      priorYearRow?.[0]?.packet_count > 0
        ? {
            year: year - 1,
            totalIncomeCents: priorYearRow[0].total_income_cents || 0,
            totalExpenseCents: priorYearRow[0].total_expense_cents || 0,
            netCents: priorYearRow[0].net_cents || 0,
          }
        : null;

    // Restricted fund balance as of the most recent packet this year — the
    // running total parishes actually care about, not a per-packet figure.
    const restrictedFundsTotalCents = restrictedFunds.length
      ? restrictedFunds.reduce((sum, rf) => sum + (rf.ending_balance_cents || 0), 0)
      : 0;

    return json({
      year,
      meetings: meetings.map((m) => ({
        id: m.id,
        title: m.title,
        fiscalYear: m.fiscal_year,
        meetingDate: m.meeting_date,
        status: m.status,
      })),
      financialSummaries: financialSummaries.map((fs) => ({
        id: fs.id,
        annualMeetingId: fs.annual_meeting_id,
        meetingTitle: fs.meeting_title,
        meetingDate: fs.meeting_date,
        totalIncomeCents: fs.total_income_cents || 0,
        totalExpenseCents: fs.total_expense_cents || 0,
        netCents: fs.net_cents || 0,
        notes: fs.notes || '',
        snapshotTakenAt: fs.snapshot_taken_at || '',
        importedFromAccountingAt: fs.imported_from_accounting_at || '',
      })),
      restrictedFunds: restrictedFunds.map((rf) => ({
        id: rf.id,
        annualMeetingId: rf.annual_meeting_id,
        meetingTitle: rf.meeting_title,
        fundName: rf.fund_name || '',
        beginningBalanceCents: rf.beginning_balance_cents || 0,
        totalReceivedCents: rf.total_received_cents || 0,
        totalDisbursedCents: rf.total_disbursed_cents || 0,
        endingBalanceCents: rf.ending_balance_cents || 0,
        notes: rf.notes || '',
        sortOrder: rf.sort_order || 0,
      })),
      totals,
      priorYear,
      restrictedFundsTotalCents,
    });
  }

  // ── POST: save a standalone financial snapshot (not tied to a meeting packet) ──
  if (request.method === 'POST') {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON' }, { status: 400 });
    }

    try {
      const saved = await upsertStewardshipFinancialSnapshot(env, {
        parishId,
        annualMeetingId: body.annualMeetingId || null,
        fiscalYear: body.fiscalYear || year,
        title: body.title || '',
        totalIncomeCents: body.totalIncomeCents,
        totalExpenseCents: body.totalExpenseCents,
        netCents: body.netCents,
        notes: body.notes || '',
        restrictedFunds: body.restrictedFunds,
      });
      return json({
        ok: true,
        ...(body.annualMeetingId ? {} : { annualMeetingId: saved.annualMeetingId }),
      });
    } catch (error) {
      return json({ error: error.message || 'Unable to save financial snapshot' }, { status: error.status || 400 });
    }
  }

  return json({ error: 'Method not allowed' }, { status: 405 });
}

// POST /api/parish/dashboard/:parishId/stewardship/nudge
// Identifies donors who are behind on their pledge and writes a notification
// record for each. Returns a preview list before sending (dry_run=true) or
// sends and returns the count (dry_run=false).
