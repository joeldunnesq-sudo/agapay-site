import { htmlEscape } from '../lib/format.js';

export function councilReportPeriod(url, now = new Date()) {
  const rawMonth = url.searchParams.get('month');
  const rawYear = url.searchParams.get('year') || String(now.getUTCFullYear());
  if (!/^\d{4}$/.test(rawYear) || Number(rawYear) < 2000 || Number(rawYear) > 2100) return null;
  const month = rawMonth || `${rawYear}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  if (!/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, number] = month.split('-').map(Number);
  if (url.searchParams.has('year') && year !== Number(rawYear)) return null;
  return {
    year,
    requestedMonth: month,
    monthStart: `${month}-01`,
    monthEnd: new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10),
    nextMonthStart: new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10),
    monthLabel: new Date(Date.UTC(year, number - 1, 1)).toLocaleDateString('en-US', {
      timeZone: 'UTC',
      month: 'long',
      year: 'numeric',
    }),
  };
}

export function accountingCouncilReport(parishName, period, monthly, yearToDate) {
  const esc = htmlEscape;
  const money = (value) => Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const totals = (data) =>
    `<div class="totals"><div><span>Income</span><strong>${money(data.totalIncomeCents / 100)}</strong></div><div><span>Expenses</span><strong>${money(data.totalExpenseCents / 100)}</strong></div><div><span>Income less expenses</span><strong>${money(data.netCents / 100)}</strong></div></div>`;
  const funds = monthly.restrictedFunds.filter((f) =>
    [f.beginningBalanceCents, f.totalReceivedCents, f.totalDisbursedCents, f.endingBalanceCents].some(Number)
  );
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(parishName)} — Monthly Financial Report — ${esc(period.monthLabel)}</title>
  <style>*{box-sizing:border-box}body{margin:0;background:#f6f1e8;color:#172b36;font:16px/1.5 system-ui,sans-serif}.toolbar{position:sticky;top:0;display:flex;justify-content:space-between;padding:16px 24px;background:#071e2a}.toolbar a,.toolbar button{color:#fff;background:transparent;border:1px solid #b18a3e;border-radius:6px;padding:9px 16px;font:inherit;text-decoration:none;cursor:pointer}.toolbar button:last-child{background:#b18a3e;color:#071e2a}main{max-width:1050px;margin:auto;padding:32px 24px}header{background:#071e2a;color:#fff;padding:30px;border-radius:12px}h1,h2{font-family:Georgia,serif;font-weight:500}h1{margin:8px 0;font-size:36px}h2{margin:0 0 16px;font-size:26px}.eyebrow{color:#d6b86f;text-transform:uppercase;letter-spacing:.12em;font-size:12px}.source{display:inline-block;padding:5px 10px;border:1px solid #b18a3e;border-radius:20px;color:#e5cf96}section{margin-top:22px;background:#fffdf8;padding:24px;border:1px solid #ded6c6;border-radius:10px}.note{color:#605e56;font-size:14px}.totals{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.totals div{padding:16px;background:#f3f0e9;border-radius:8px}.totals span{display:block;font-size:13px}.totals strong{display:block;font:28px Georgia,serif;margin-top:8px}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:right;padding:12px 8px;border-bottom:1px solid #ded6c6}th:first-child,td:first-child{text-align:left}th{font-size:12px;color:#605e56}footer{font-size:12px;margin-top:24px;color:#605e56}@media(max-width:600px){main{padding:16px}.totals{grid-template-columns:1fr}table{min-width:650px}h1{font-size:28px}}@media print{body{background:white;font-size:11px}.toolbar{display:none}main{padding:0;max-width:none}section,header{break-inside:avoid}section{padding:16px}.totals strong{font-size:22px}.table-wrap{overflow:visible}table{font-size:11px}th,td{padding:7px}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>
  <nav class="toolbar"><a href="/parish/dashboard" onclick="window.close(); return true;">← Back</a><div><button onclick="window.print()">Print</button> <button onclick="window.print()">Save as PDF</button></div></nav><main>
  <header><span class="eyebrow">AGAPAY · Parish council finances</span><h1>Monthly Financial Report</h1><p>${esc(parishName)} · ${esc(period.monthLabel)}</p><span class="source">Live from Accounting · Posted entries only</span></header>
  <section><h2>${esc(period.monthLabel)} activity</h2><p class="note">${esc(period.monthStart)} through ${esc(period.monthEnd)}</p>${totals(monthly)}</section>
  <section><h2>Year-to-date activity</h2><p class="note">January 1 through ${esc(period.monthEnd)}. These are activity totals, not bank balances.</p>${totals(yearToDate)}</section>
  <section><h2>Restricted fund balances</h2><p class="note">Balances and changes during ${esc(period.monthLabel)}. Funds with no balance or activity are omitted.</p>${funds.length ? `<div class="table-wrap"><table><thead><tr><th>Fund</th><th>Beginning</th><th>Received / transfers in</th><th>Used / transfers out</th><th>Ending</th></tr></thead><tbody>${funds.map((f) => `<tr><td>${esc(f.fundName)}</td><td>${money(f.beginningBalanceCents / 100)}</td><td>${money(f.totalReceivedCents / 100)}</td><td>${money(f.totalDisbursedCents / 100)}</td><td>${money(f.endingBalanceCents / 100)}</td></tr>`).join('')}</tbody></table></div>` : '<p>No restricted fund balances or activity for this month.</p>'}<p class="note">Ending balance = beginning balance + received and transfers in − used and transfers out.</p></section>
  <section><h2>Reporting basis</h2><p>This report reads completed Accounting entries for the selected dates. Drafts and saved meeting snapshots are not included. Giving already recorded in Accounting is counted once.</p><p>Income less expenses is different from cash movement. Include the Accounting balance sheet, cash-flow report, and budget comparison when needed for council review.</p><p>Saved meeting packets remain separate historical copies. Generating this report does not change them.</p></section><footer>Generated ${esc(new Date().toISOString().slice(0, 10))} · AGAPAY · Review before council distribution</footer></main></body></html>`;
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html;charset=utf-8',
      'Content-Disposition': `inline; filename="financial-report-${period.requestedMonth}.html"`,
      'Cache-Control': 'no-store',
    },
  });
}
