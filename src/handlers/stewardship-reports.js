import { d1First, getBearerToken, json } from '../lib/core.js';
import { verifyParishDashboardBearer, findRegistrationByParishId } from './parish.js';
import { handleDonorDashboard } from './donor.js';
import { handleStewardshipFinancials } from './stewardship.js';
import { htmlEscape } from '../lib/format.js';

import { requireStewardshipFeature, verifyParishDashboard } from './stewardship-giving.js';

async function manualIncomeTotalCents(env, parishId, startDate, endDate) {
  const row = await env.AGAPAY_DB.prepare(
    `
    SELECT COALESCE(SUM(amount_cents), 0) AS total_cents
    FROM manual_income_entries
    WHERE parish_id = ? AND contribution_eligible = 1 AND entry_date BETWEEN ? AND ?
  `
  )
    .bind(parishId, startDate, endDate)
    .first()
    .catch(() => null);
  return row?.total_cents || 0;
}

export async function handleStewardshipMonthlyReport(request, env, parishId) {
  const url0 = new URL(request.url);
  const token = url0.searchParams.get('t') || getBearerToken(request);
  if (!parishId || !token) {
    return new Response(
      "<!DOCTYPE html><html><body><p>Session expired. <a href='/parish/dashboard'>Return to dashboard</a></p></body></html>",
      { status: 401, headers: { 'Content-Type': 'text/html;charset=utf-8' } }
    );
  }
  const authFound = await findRegistrationByParishId(env, parishId);
  if (!authFound || !(await verifyParishDashboardBearer(authFound.registration, token))) {
    return new Response(
      "<!DOCTYPE html><html><body><p>Session expired. <a href='/parish/dashboard'>Return to dashboard</a></p></body></html>",
      { status: 401, headers: { 'Content-Type': 'text/html;charset=utf-8' } }
    );
  }
  const gate = await requireStewardshipFeature(env, parishId);
  if (gate) return gate;

  const found = await findRegistrationByParishId(env, parishId);
  const registration = found?.registration || {};
  const parishName = registration.parishName || registration.name || 'Parish';

  const url = new URL(request.url);
  const year = parseInt(url.searchParams.get('year') || new Date().getFullYear(), 10);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Internal calls to the JSON endpoints below still need a bearer header
  // (they don't accept the ?t= query param), so build those forwarded
  // requests with the token attached as a header explicitly.
  const forwardedUrl = `${url.origin}${url.pathname.replace(/\/report\/monthly$/, '')}`;
  const withYear = (path) =>
    new Request(`${forwardedUrl}/${path}?year=${year}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

  const [summaryRes, recurringRes, retentionRes, healthRes, fundsRes, monthRow, fundsRows, manualMonthCents] =
    await Promise.all([
      handleStewardshipGivingSummary(withYear('summary'), env, parishId).then((r) => r.json()),
      handleStewardshipGivingRecurring(withYear('recurring'), env, parishId).then((r) => r.json()),
      handleStewardshipGivingRetention(withYear('retention'), env, parishId).then((r) => r.json()),
      handleStewardshipGivingHealthScore(withYear('health-score'), env, parishId).then((r) => r.json()),
      handleStewardshipGivingFunds(withYear('funds'), env, parishId).then((r) => r.json()),
      env.AGAPAY_DB.prepare(
        `
      SELECT COALESCE(SUM(COALESCE(json_extract(data, '$.giftAmountCents'), json_extract(data, '$.amountCents'), 0)), 0) AS total_cents,
             COUNT(DISTINCT donor_email) AS donor_count
      FROM donor_offerings
      WHERE parish_id = ? AND payment_status = 'paid' AND created_at BETWEEN ? AND ?
    `
      )
        .bind(parishId, monthStart, monthEnd)
        .first(),
      env.AGAPAY_DB.prepare(
        `
      SELECT rf.fund_name, rf.ending_balance_cents
      FROM stewardship_restricted_funds rf
      JOIN stewardship_annual_meetings am ON am.id = rf.annual_meeting_id
      WHERE am.parish_id = ? AND am.fiscal_year = ?
      ORDER BY rf.sort_order ASC
    `
      )
        .bind(parishId, year)
        .all()
        .catch(() => ({ results: [] })),
      manualIncomeTotalCents(env, parishId, monthStart, monthEnd),
    ]);

  const fmt = (c) =>
    '$' + ((c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const monthTotalCents = (monthRow?.total_cents || 0) + manualMonthCents;

  // Budget pace — same math as the Stewardship Reports card.
  const goalCents = summaryRes.total_pledged_cents || 0;
  const expectedByTodayCents =
    goalCents > 0 ? Math.round(goalCents * (summaryRes.day_of_year / summaryRes.days_in_year)) : 0;
  const behindPaceCents = expectedByTodayCents - summaryRes.total_actual_cents;

  const restrictedFunds = fundsRows.results || [];
  const restrictedTotalCents = restrictedFunds.reduce((s, f) => s + (f.ending_balance_cents || 0), 0);

  // Rule-based follow-up suggestions — every line ties directly back to a
  // number already shown above it, nothing generated freeform.
  const actions = [];
  if (behindPaceCents > 0) {
    actions.push(
      `Giving is ${fmt(behindPaceCents)} behind pace for ${monthLabel.split(' ')[1]} — consider a pledge reminder to households who haven't given this quarter.`
    );
  }
  if (recurringRes.failed_payments_90d > 0) {
    actions.push(
      `${recurringRes.failed_payments_90d} recurring payment${recurringRes.failed_payments_90d === 1 ? '' : 's'} failed in the last 90 days — a quick outreach to update payment info can recover this revenue.`
    );
  }
  if (recurringRes.canceled_gifts_90d > 0) {
    actions.push(
      `${recurringRes.canceled_gifts_90d} recurring gift${recurringRes.canceled_gifts_90d === 1 ? '' : 's'} canceled in the last 90 days — a personal note often wins these back.`
    );
  }
  if (retentionRes.lapsed > 0) {
    actions.push(
      `${retentionRes.lapsed} donor${retentionRes.lapsed === 1 ? '' : 's'} from ${retentionRes.prior_year} hasn't given yet this year — a warm check-in outperforms a form letter.`
    );
  }
  if (retentionRes.new_donors > 0) {
    actions.push(
      `${retentionRes.new_donors} new donor${retentionRes.new_donors === 1 ? '' : 's'} gave for the first time this year — a thank-you note now builds the relationship that leads to a pledge next year.`
    );
  }
  if (!actions.length) {
    actions.push(
      "No urgent follow-ups from this month's numbers — giving, pledges, and recurring gifts all look steady."
    );
  }

  const scoreTone =
    healthRes.score === null ? 'gold' : healthRes.score >= 80 ? 'green' : healthRes.score >= 60 ? 'gold' : 'red';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${htmlEscape(parishName)} — Monthly Stewardship Report — ${htmlEscape(monthLabel)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --mr-navy: #061522; --mr-gold: #b18a3e; --mr-cream: #f6f1e8; --mr-paper: #fffdf8;
      --mr-ink: #171715; --mr-muted: #6f6a60; --mr-line: #ddd5c5;
      --mr-red: #8a2929; --mr-green: #2e6b4a;
      --mr-serif: "Cormorant Garamond", Georgia, serif; --mr-sans: "DM Sans", system-ui, sans-serif;
    }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { background: var(--mr-cream); color: var(--mr-ink); font-family: var(--mr-sans); font-size: 14px; line-height: 1.6; }
    @media print { body { background: white; font-size: 11.5px; } [data-no-print] { display: none !important; } .mr-page-break { page-break-before: always; } }
    .mr-toolbar { position: sticky; top: 0; z-index: 10; display: flex; justify-content: space-between; align-items: center; padding: .9rem 1.5rem; background: var(--mr-navy); }
    .mr-toolbar-btn { display: inline-flex; align-items: center; gap: .4rem; padding: .5rem 1rem; border-radius: 7px; border: 1px solid rgba(184,144,47,.4); background: transparent; color: var(--mr-cream); font: 700 .82rem var(--mr-sans); cursor: pointer; text-decoration: none; }
    .mr-toolbar-btn.mr-primary { background: var(--mr-gold); color: var(--mr-navy); border-color: var(--mr-gold); }
    .mr-container { max-width: 820px; margin: 0 auto; padding: 2.5rem 2rem 4rem; }
    .mr-header { text-align: center; margin-bottom: 2.5rem; }
    .mr-header .mr-eyebrow { font: 700 .72rem var(--mr-sans); letter-spacing: .14em; text-transform: uppercase; color: var(--mr-gold); }
    .mr-header h1 { font-family: var(--mr-serif); font-size: 2rem; color: var(--mr-navy); margin: .4rem 0 .2rem; }
    .mr-header p { color: var(--mr-muted); font-size: .9rem; }
    .mr-section { margin-bottom: 2rem; background: var(--mr-paper); border: 1px solid var(--mr-line); border-radius: 12px; padding: 1.5rem; }
    .mr-section h2 { font-family: var(--mr-serif); font-size: 1.25rem; color: var(--mr-navy); margin-bottom: 1rem; padding-bottom: .6rem; border-bottom: 2px solid var(--mr-gold); }
    .mr-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: .75rem; }
    .mr-kpi { background: rgba(184,144,47,.06); border-radius: 8px; padding: .8rem .9rem; }
    .mr-kpi span { display: block; font-size: .68rem; text-transform: uppercase; letter-spacing: .08em; color: var(--mr-muted); margin-bottom: .3rem; }
    .mr-kpi strong { font-family: var(--mr-serif); font-size: 1.35rem; color: var(--mr-navy); }
    .mr-score-row { display: flex; align-items: center; gap: 1.5rem; }
    .mr-score-badge { flex-shrink: 0; width: 92px; height: 92px; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 4px solid var(--mr-tone); }
    .mr-score-badge strong { font-family: var(--mr-serif); font-size: 1.7rem; color: var(--mr-navy); line-height: 1; }
    .mr-score-badge span { font-size: .62rem; color: var(--mr-muted); }
    .mr-score-status { font-family: var(--mr-serif); font-size: 1.3rem; color: var(--mr-navy); }
    .mr-table { width: 100%; border-collapse: collapse; font-size: .88rem; }
    .mr-table th { text-align: left; font-size: .68rem; text-transform: uppercase; letter-spacing: .08em; color: var(--mr-muted); padding: .4rem .5rem; border-bottom: 2px solid var(--mr-line); }
    .mr-table td { padding: .55rem .5rem; border-bottom: 1px solid rgba(221,213,197,.6); }
    .mr-table .mr-right { text-align: right; font-variant-numeric: tabular-nums; }
    .mr-actions { display: grid; gap: .6rem; }
    .mr-action { padding: .8rem 1rem; border-left: 3px solid var(--mr-gold); background: rgba(184,144,47,.06); border-radius: 0 6px 6px 0; font-size: .88rem; }
    .mr-footer { text-align: center; color: var(--mr-muted); font-size: .75rem; margin-top: 2rem; }
    .mr-pos { color: var(--mr-green); font-weight: 700; }
    .mr-neg { color: var(--mr-red); font-weight: 700; }
  </style>
</head>
<body>
  <div class="mr-toolbar" data-no-print>
    <a href="/parish/dashboard" class="mr-toolbar-btn" onclick="window.close(); return true;">&larr; Back</a>
    <div style="display:flex;gap:.5rem;">
      <button class="mr-toolbar-btn" onclick="window.print()">Print</button>
      <button class="mr-toolbar-btn mr-primary" onclick="window.print()">Save as PDF</button>
    </div>
  </div>
  <div class="mr-container">
    <div class="mr-header">
      <span class="mr-eyebrow">AGAPAY Stewardship</span>
      <h1>Monthly Stewardship Report</h1>
      <p>${htmlEscape(parishName)} &middot; ${htmlEscape(monthLabel)}</p>
    </div>

    <div class="mr-section">
      <h2>Stewardship Health</h2>
      <div class="mr-score-row">
        <div class="mr-score-badge" style="--mr-tone: var(--mr-${scoreTone === 'green' ? 'green' : scoreTone === 'red' ? 'red' : 'gold'});">
          <strong>${healthRes.score === null ? '—' : healthRes.score}</strong>
          <span>/ 100</span>
        </div>
        <div>
          <div class="mr-score-status">${htmlEscape(healthRes.status)}</div>
          <p style="color:var(--mr-muted);font-size:.85rem;margin-top:.2rem;">Calculated from ${healthRes.components.length} signal${healthRes.components.length === 1 ? '' : 's'}: ${healthRes.components.map((c) => htmlEscape(c.label)).join(', ')}.</p>
        </div>
      </div>
    </div>

    <div class="mr-section">
      <h2>Giving This Month &mdash; ${htmlEscape(monthLabel)}</h2>
      <div class="mr-kpi-grid">
        <div class="mr-kpi"><span>Collected</span><strong>${fmt(monthTotalCents)}</strong></div>
        <div class="mr-kpi"><span>Donors</span><strong>${monthRow?.donor_count || 0}</strong></div>
      </div>
    </div>

    <div class="mr-section">
      <h2>Giving Year-to-Date &amp; Budget Pace</h2>
      <div class="mr-kpi-grid">
        <div class="mr-kpi"><span>Annual Goal</span><strong>${fmt(goalCents)}</strong></div>
        <div class="mr-kpi"><span>Expected by Today</span><strong>${fmt(expectedByTodayCents)}</strong></div>
        <div class="mr-kpi"><span>Actual Collected</span><strong>${fmt(summaryRes.total_actual_cents)}</strong></div>
        <div class="mr-kpi"><span>${behindPaceCents > 0 ? 'Behind Pace' : 'Ahead of Pace'}</span><strong class="${behindPaceCents > 0 ? 'mr-neg' : 'mr-pos'}">${fmt(Math.abs(behindPaceCents))}</strong></div>
        <div class="mr-kpi"><span>Projected Year-End</span><strong>${fmt(summaryRes.run_rate_cents)}</strong></div>
        <div class="mr-kpi"><span>Pledge Fulfillment</span><strong>${summaryRes.fulfillment_rate_pct === null ? '—' : summaryRes.fulfillment_rate_pct + '%'}</strong></div>
      </div>
    </div>

    <div class="mr-section">
      <h2>Giving by Fund</h2>
      ${
        (fundsRes.funds || []).filter((f) => f.total_cents > 0).length
          ? `
        <table class="mr-table">
          <thead><tr><th>Fund</th><th class="mr-right">Transactions</th><th class="mr-right">Total</th><th class="mr-right">Share</th></tr></thead>
          <tbody>${(fundsRes.funds || [])
            .filter((f) => f.total_cents > 0)
            .map(
              (f) =>
                `<tr><td>${htmlEscape(f.fund_name)}</td><td class="mr-right">${f.transaction_count}</td><td class="mr-right">${fmt(f.total_cents)}</td><td class="mr-right">${f.pct_of_total}%</td></tr>`
            )
            .join('')}</tbody>
        </table>
      `
          : `<p style="color:var(--mr-muted);font-size:.88rem;">No fund-designated giving recorded for ${year} yet.</p>`
      }
    </div>

    <div class="mr-section">
      <h2>Restricted Funds</h2>
      ${
        restrictedFunds.length
          ? `
        <table class="mr-table">
          <thead><tr><th>Fund</th><th class="mr-right">Ending Balance</th></tr></thead>
          <tbody>${restrictedFunds.map((f) => `<tr><td>${htmlEscape(f.fund_name)}</td><td class="mr-right">${fmt(f.ending_balance_cents)}</td></tr>`).join('')}</tbody>
        </table>
        <p style="margin-top:.6rem;font-size:.85rem;color:var(--mr-muted);">Total restricted funds: <strong style="color:var(--mr-navy);">${fmt(restrictedTotalCents)}</strong></p>
      `
          : `<p style="color:var(--mr-muted);font-size:.88rem;">No restricted fund data recorded for ${year} yet.</p>`
      }
    </div>

    <div class="mr-section mr-page-break">
      <h2>Recurring Giving Health</h2>
      <div class="mr-kpi-grid">
        <div class="mr-kpi"><span>Recurring Donors</span><strong>${recurringRes.recurring_donor_count}</strong></div>
        <div class="mr-kpi"><span>Monthly Recurring Revenue</span><strong>${fmt(recurringRes.monthly_recurring_revenue_cents)}</strong></div>
        <div class="mr-kpi"><span>Avg Recurring Gift</span><strong>${fmt(recurringRes.avg_recurring_gift_cents)}</strong></div>
        <div class="mr-kpi"><span>% of Giving Recurring</span><strong>${recurringRes.pct_of_total_giving_recurring === null ? '—' : recurringRes.pct_of_total_giving_recurring + '%'}</strong></div>
        <div class="mr-kpi"><span>Failed Payments (90d)</span><strong class="${recurringRes.failed_payments_90d > 0 ? 'mr-neg' : ''}">${recurringRes.failed_payments_90d}</strong></div>
        <div class="mr-kpi"><span>Canceled Gifts (90d)</span><strong class="${recurringRes.canceled_gifts_90d > 0 ? 'mr-neg' : ''}">${recurringRes.canceled_gifts_90d}</strong></div>
      </div>
    </div>

    <div class="mr-section">
      <h2>Donor Retention</h2>
      <div class="mr-kpi-grid">
        <div class="mr-kpi"><span>Retention Rate</span><strong>${retentionRes.retention_rate_pct === null ? '—' : retentionRes.retention_rate_pct + '%'}</strong></div>
        <div class="mr-kpi"><span>Retained</span><strong>${retentionRes.retained}</strong></div>
        <div class="mr-kpi"><span>Lapsed</span><strong class="${retentionRes.lapsed > 0 ? 'mr-neg' : ''}">${retentionRes.lapsed}</strong></div>
        <div class="mr-kpi"><span>New Donors</span><strong class="mr-pos">${retentionRes.new_donors}</strong></div>
      </div>
    </div>

    <div class="mr-section">
      <h2>Upcoming Stewardship Actions</h2>
      <div class="mr-actions">
        ${actions.map((a) => `<div class="mr-action">${htmlEscape(a)}</div>`).join('')}
      </div>
    </div>

    <p class="mr-footer">Generated by AGAPAY Stewardship &middot; ${htmlEscape(now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))}</p>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html;charset=utf-8',
      'Content-Disposition': `inline; filename="stewardship-report-${monthLabel.replace(/\s+/g, '-')}.html"`,
    },
  });
}

// GET /api/parish/dashboard/:parishId/stewardship/report/monthly-financial
// A print-ready financial companion to the monthly stewardship report. Giving
// is date-based; expense and non-contribution revenue figures come from the
// parish's single authoritative fiscal-year snapshot until Accounting can
// calculate those ledgers month by month.
export async function handleStewardshipMonthlyFinancialReport(request, env, parishId) {
  const url = new URL(request.url);
  const token = url.searchParams.get('t') || getBearerToken(request);
  const expired = () =>
    new Response(
      "<!DOCTYPE html><html><body><p>Session expired. <a href='/parish/dashboard'>Return to dashboard</a></p></body></html>",
      { status: 401, headers: { 'Content-Type': 'text/html;charset=utf-8' } }
    );
  if (!parishId || !token) return expired();
  const found = await findRegistrationByParishId(env, parishId);
  if (!found || !(await verifyParishDashboardBearer(found.registration, token))) return expired();
  const gate = await requireStewardshipFeature(env, parishId);
  if (gate) return gate;

  const requestedYear = parseInt(url.searchParams.get('year') || new Date().getFullYear(), 10);
  const fallbackMonth = `${requestedYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const requestedMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(url.searchParams.get('month') || '')
    ? url.searchParams.get('month')
    : fallbackMonth;
  const [monthYear, monthNumber] = requestedMonth.split('-').map(Number);
  const year =
    Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100 ? requestedYear : monthYear;
  const monthStart = `${monthYear}-${String(monthNumber).padStart(2, '0')}-01`;
  const nextMonthDate = new Date(Date.UTC(monthYear, monthNumber, 1));
  const nextMonthStart = nextMonthDate.toISOString().slice(0, 10);
  const monthEnd = new Date(Date.UTC(monthYear, monthNumber, 0)).toISOString().slice(0, 10);
  const monthLabel = new Date(Date.UTC(monthYear, monthNumber - 1, 1)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });
  const parishName = found.registration?.parishName || found.registration?.name || 'Parish';
  const generatedOn = new Date();
  const authRequest = new Request(
    `${url.origin}/api/parish/dashboard/${encodeURIComponent(parishId)}/stewardship/financials?year=${year}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const [financialResponse, agapayMonth, outsideMonth] = await Promise.all([
    handleStewardshipFinancials(authRequest, env, parishId),
    d1First(
      env,
      `SELECT
        COALESCE(SUM(COALESCE(json_extract(data, '$.giftAmountCents'), json_extract(data, '$.amountCents'), 0)), 0) AS total_cents,
        COUNT(*) AS transaction_count
      FROM donor_offerings
      WHERE parish_id = ? AND payment_status IN ('paid','succeeded')
        AND created_at >= ? AND created_at < ?`,
      parishId,
      monthStart,
      nextMonthStart
    ),
    d1First(
      env,
      `SELECT COALESCE(SUM(amount_cents), 0) AS total_cents, COUNT(*) AS transaction_count
      FROM manual_income_entries
      WHERE parish_id = ? AND contribution_eligible = 1
        AND entry_date BETWEEN ? AND ?`,
      parishId,
      monthStart,
      monthEnd
    ),
  ]);
  const financials = await financialResponse.json().catch(() => ({}));
  if (!financialResponse.ok) {
    return new Response(`<p>${htmlEscape(financials.error || 'Unable to build financial report.')}</p>`, {
      status: financialResponse.status,
      headers: { 'Content-Type': 'text/html;charset=utf-8' },
    });
  }

  const snapshot = financials.snapshot || null;
  const totals = financials.totals || {};
  const contributions = financials.contributionTotals || {};
  const funds = financials.agapayRestrictedFunds || [];
  const assets = financials.externalAssets || [];
  const monthAgapayCents = Number(agapayMonth?.total_cents || 0);
  const monthOutsideCents = Number(outsideMonth?.total_cents || 0);
  const monthTotalCents = monthAgapayCents + monthOutsideCents;
  const fmt = (c) => {
    const value = Number(c || 0);
    return `${value < 0 ? '-$' : '$'}${(Math.abs(value) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  };
  const assetLabels = {
    investment: 'Investment',
    endowment: 'Endowment',
    real_property: 'Real property',
    external_fund: 'External fund',
    other: 'Other asset',
  };
  const reportStatus = snapshot
    ? `Authoritative snapshot · Version ${snapshot.version}`
    : 'Live contributions · Snapshot not yet completed';
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${htmlEscape(parishName)} — Monthly Financial Report — ${htmlEscape(monthLabel)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{--navy:#061522;--blue:#17364b;--gold:#b18a3e;--cream:#f6f1e8;--paper:#fffdf8;--ink:#171715;--muted:#6f6a60;--line:#ddd5c5;--red:#8a2929;--green:#2e6b4a;--serif:"Cormorant Garamond",Georgia,serif;--sans:"DM Sans",system-ui,sans-serif}
    html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{background:var(--cream);color:var(--ink);font:14px/1.55 var(--sans)}
    .toolbar{position:sticky;top:0;z-index:10;display:flex;justify-content:space-between;gap:1rem;padding:.9rem 1.5rem;background:var(--navy)}
    .btn{display:inline-flex;align-items:center;padding:.5rem 1rem;border:1px solid rgba(177,138,62,.5);border-radius:7px;background:transparent;color:var(--cream);font:700 .82rem var(--sans);text-decoration:none;cursor:pointer}.btn.primary{background:var(--gold);border-color:var(--gold);color:var(--navy)}
    .page{max-width:900px;margin:0 auto;padding:2.5rem 2rem 4rem}
    .hero{position:relative;overflow:hidden;padding:2.1rem 2.25rem;margin-bottom:1.4rem;border-radius:14px;background:var(--navy);color:var(--cream)}
    .hero::after{content:"";position:absolute;right:-55px;top:-90px;width:240px;height:240px;border:1px solid rgba(177,138,62,.25);border-radius:50%;box-shadow:0 0 0 32px rgba(177,138,62,.06)}
    .eyebrow{display:block;margin-bottom:.4rem;color:#d6b86f;font-size:.7rem;font-weight:700;letter-spacing:.15em;text-transform:uppercase}.hero h1{font:600 2.2rem/1.05 var(--serif)}.hero p{margin-top:.45rem;color:rgba(246,241,232,.72)}.status{display:inline-flex;margin-top:1rem;padding:.3rem .6rem;border:1px solid rgba(214,184,111,.35);border-radius:999px;color:#e8cf93;font-size:.68rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase}
    .section{margin-bottom:1.25rem;padding:1.4rem 1.5rem;border:1px solid var(--line);border-radius:12px;background:var(--paper)}.section h2{margin-bottom:.9rem;padding-bottom:.55rem;border-bottom:2px solid var(--gold);color:var(--navy);font:600 1.35rem var(--serif)}.section-note{margin:-.45rem 0 .9rem;color:var(--muted);font-size:.78rem}
    .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:.7rem}.kpi{padding:.85rem .9rem;border-radius:8px;background:rgba(6,21,34,.045)}.kpi span{display:block;margin-bottom:.22rem;color:var(--muted);font-size:.65rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase}.kpi strong{color:var(--navy);font:600 1.4rem var(--serif)}.positive{color:var(--green)!important}.negative{color:var(--red)!important}
    table{width:100%;border-collapse:collapse;font-size:.84rem}th{padding:.4rem .5rem;border-bottom:2px solid var(--line);color:var(--muted);font-size:.64rem;letter-spacing:.07em;text-align:left;text-transform:uppercase}td{padding:.58rem .5rem;border-bottom:1px solid rgba(221,213,197,.65)}th.num,td.num{text-align:right;font-variant-numeric:tabular-nums}.fund-name strong,.fund-name small{display:block}.fund-name small{color:var(--muted);font-size:.68rem}
    .formula{margin-top:.75rem;padding:.65rem .75rem;border-radius:7px;background:rgba(177,138,62,.08);color:var(--muted);font-size:.76rem}.empty{color:var(--muted);font-size:.85rem}.footer{margin-top:1.8rem;color:var(--muted);font-size:.72rem;text-align:center}
    @media(max-width:620px){.page{padding:1rem}.hero{padding:1.5rem}.hero h1{font-size:1.8rem}.table-wrap{overflow-x:auto}table{min-width:650px}.toolbar{padding:.7rem}}
    @media print{body{background:#fff;font-size:11px}.toolbar{display:none}.page{max-width:none;padding:.2in}.hero{break-inside:avoid}.section{break-inside:avoid;margin-bottom:.14in;padding:.16in}.page-break{break-before:page}}
  </style>
</head>
<body>
  <div class="toolbar">
    <a class="btn" href="/parish/dashboard" onclick="window.close();return true;">&larr; Back</a>
    <div><button class="btn" onclick="window.print()">Print</button> <button class="btn primary" onclick="window.print()">Save as PDF</button></div>
  </div>
  <main class="page">
    <header class="hero">
      <span class="eyebrow">AGAPAY Financial Stewardship</span>
      <h1>Monthly Financial Report</h1>
      <p>${htmlEscape(parishName)} &middot; ${htmlEscape(monthLabel)}</p>
      <span class="status">${htmlEscape(reportStatus)}</span>
    </header>
    <section class="section">
      <h2>${htmlEscape(monthLabel)} Contributions</h2>
      <div class="kpis">
        <div class="kpi"><span>Through AGAPAY</span><strong>${fmt(monthAgapayCents)}</strong></div>
        <div class="kpi"><span>Outside AGAPAY</span><strong>${fmt(monthOutsideCents)}</strong></div>
        <div class="kpi"><span>Monthly Total</span><strong class="positive">${fmt(monthTotalCents)}</strong></div>
        <div class="kpi"><span>Transactions / Entries</span><strong>${Number(agapayMonth?.transaction_count || 0) + Number(outsideMonth?.transaction_count || 0)}</strong></div>
      </div>
    </section>
    <section class="section">
      <h2>${year} Financial Position</h2>
      <p class="section-note">Contribution totals are live. Other revenue and expenses come from the authoritative fiscal-year snapshot.</p>
      <div class="kpis">
        <div class="kpi"><span>AGAPAY Contributions</span><strong>${fmt(contributions.agapayContributionsCents)}</strong></div>
        <div class="kpi"><span>Outside Contributions</span><strong>${fmt(contributions.outsideContributionsCents)}</strong></div>
        <div class="kpi"><span>Other Revenue</span><strong>${fmt(snapshot?.otherRevenueCents)}</strong></div>
        <div class="kpi"><span>Total Income</span><strong>${fmt(totals.totalIncomeCents)}</strong></div>
        <div class="kpi"><span>Total Expenses</span><strong class="negative">${fmt(totals.totalExpenseCents)}</strong></div>
        <div class="kpi"><span>Net ${Number(totals.netCents || 0) >= 0 ? 'Surplus' : 'Deficit'}</span><strong class="${Number(totals.netCents || 0) >= 0 ? 'positive' : 'negative'}">${fmt(totals.netCents)}</strong></div>
      </div>
    </section>
    <section class="section">
      <h2>Restricted Fund Balances</h2>
      ${
        funds.length
          ? `<div class="table-wrap"><table>
        <thead><tr><th>Fund</th><th class="num">Opening</th><th class="num">AGAPAY</th><th class="num">Outside</th><th class="num">Deductions</th><th class="num">Ending</th></tr></thead>
        <tbody>${funds
          .map(
            (fund) => `<tr>
          <td class="fund-name"><strong>${htmlEscape(fund.name)}</strong>${fund.adjustmentNotes ? `<small>${htmlEscape(fund.adjustmentNotes)}</small>` : ''}</td>
          <td class="num">${fmt(fund.openingBalanceCents)}</td><td class="num positive">${fmt(fund.agapayReceivedCents)}</td>
          <td class="num positive">${fmt(fund.outsideReceivedCents)}</td><td class="num negative">${fmt(fund.deductionsCents)}</td>
          <td class="num ${Number(fund.endingBalanceCents || 0) < 0 ? 'negative' : 'positive'}">${fmt(fund.endingBalanceCents)}</td>
        </tr>`
          )
          .join('')}</tbody>
      </table></div>
      <p class="formula">Ending balance = opening balance + contributions received − expenses and deductions.</p>`
          : `<p class="empty">No donor-restricted funds are configured.</p>`
      }
    </section>
    <section class="section page-break">
      <h2>Externally Held Assets</h2>
      ${
        assets.length
          ? `<div class="table-wrap"><table>
        <thead><tr><th>Asset</th><th>Type</th><th>Valuation Date</th><th>Note</th><th class="num">Value</th></tr></thead>
        <tbody>${assets.map((asset) => `<tr><td><strong>${htmlEscape(asset.name)}</strong></td><td>${htmlEscape(assetLabels[asset.assetType] || 'External asset')}</td><td>${htmlEscape(asset.asOfDate || 'Not dated')}</td><td>${htmlEscape(asset.notes || '')}</td><td class="num">${fmt(asset.valueCents)}</td></tr>`).join('')}</tbody>
      </table></div>`
          : `<p class="empty">No externally held assets have been entered.</p>`
      }
    </section>
    ${snapshot?.notes ? `<section class="section"><h2>Treasurer Notes</h2><p>${htmlEscape(snapshot.notes).replace(/\n/g, '<br />')}</p></section>` : ''}
    <section class="section">
      <h2>Reporting Basis</h2>
      <p class="section-note" style="margin:0">Monthly contribution activity covers ${htmlEscape(monthStart)} through ${htmlEscape(monthEnd)}. Fiscal-year contributions are calculated from AGAPAY and contribution-qualified outside entries. Until the Accounting suite launches, other revenue, expenses, restricted-fund deductions, and externally held assets are maintained in the authoritative snapshot rather than calculated from a monthly ledger.</p>
    </section>
    <p class="footer">Generated by AGAPAY &middot; ${htmlEscape(generatedOn.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))}</p>
  </main>
</body>
</html>`;
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html;charset=utf-8',
      'Content-Disposition': `inline; filename="financial-report-${requestedMonth}.html"`,
    },
  });
}

// ── PLEDGE SYNC HELPER ───────────────────────────────────────────────────────
// Call this from handleDonorDashboard (in handlers/donor.js) whenever a donor
// saves their pledge amount. Pass the donor's email, their default_parish_id,
// and the new pledgeAmountCents value.
//
// Usage (in handlers/donor.js, after writing pledgeAmountCents to donor row):
//
//   if (donorRow.default_parish_id) {
//     await syncPledgeToHousehold(env, donorEmail, donorRow.default_parish_id, pledgeAmountCents);
//   }
//
export async function syncPledgeToHousehold(env, donorEmail, parishId, pledgeAmountCents) {
  if (!parishId || !parishId.trim()) return;
  const year = new Date().getFullYear();
  await env.AGAPAY_DB.prepare(
    `
    INSERT INTO household_pledges (donor_email, parish_id, fiscal_year, target_amount_cents)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(donor_email, fiscal_year) DO UPDATE SET
      target_amount_cents = excluded.target_amount_cents,
      parish_id           = excluded.parish_id,
      updated_at          = datetime('now')
  `
  )
    .bind(donorEmail, parishId, year, pledgeAmountCents)
    .run();
}
