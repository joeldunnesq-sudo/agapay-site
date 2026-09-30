'use strict';

async function loadAccountingCoreReport(id) {
  const period = accountingReportPeriod();
  const key = id === 'expenses' ? 'activities' : id;
  const paths = {
    activities: 'statement-of-activities',
    position: 'statement-of-financial-position',
    trialBalance: 'trial-balance',
  };
  try {
    const query = new URLSearchParams({ from: period.start, to: period.end, asOf: period.end });
    const response = await fetch(accountingApi(`/reports/${paths[key]}?${query}`), { headers: authHeaders() });
    const payload = await response.json();
    if (!response.ok || !payload.report) throw new Error(payload.message || 'This report is unavailable.');
    accountingData.reports[key] = payload.report;
    accountingCustomReport = null;
  } catch (error) {
    accountingCustomReport = { error: error.message };
  }
  renderAccountingPane();
}

function accountingPriorYear(date) {
  const [year, month, day] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year - 1, month, 0)).getUTCDate();
  return `${year - 1}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

function accountingGeneralLedgerReport() {
  const period = accountingReportPeriod(),
    groups = new Map();
  for (const entry of accountingReportLedgerRows('0001-01-01', period.end)) {
    const number = entry.accountNumber;
    const group = groups.get(number) || { name: `${number} ${entry.accountName}`, opening: 0, entries: [] };
    if (entry.date < period.start) group.opening += Number(entry.debitAmount || 0) - Number(entry.creditAmount || 0);
    else group.entries.push(entry);
    groups.set(number, group);
  }
  const rows = [];
  let debit = 0,
    credit = 0;
  for (const [, group] of [...groups].sort(([a], [b]) => String(a).localeCompare(String(b)))) {
    rows.push({ kind: 'section', label: group.name });
    let balance = group.opening;
    rows.push({ label: `Opening balance at ${period.start}`, balance });
    for (const entry of group.entries.sort(
      (a, b) => a.date.localeCompare(b.date) || String(a.entryNumber).localeCompare(String(b.entryNumber))
    )) {
      const dr = Number(entry.debitAmount || 0),
        cr = Number(entry.creditAmount || 0);
      balance += dr - cr;
      debit += dr;
      credit += cr;
      rows.push({
        label: `${entry.date} | ${entry.entryNumber}\n${entry.description || ''}`,
        fund: entry.fund,
        debit: dr,
        credit: cr,
        balance,
      });
    }
    rows.push({
      kind: 'subtotal',
      label: `Ending balance - ${group.name}`,
      debit: group.entries.reduce((a, b) => a + Number(b.debitAmount || 0), 0),
      credit: group.entries.reduce((a, b) => a + Number(b.creditAmount || 0), 0),
      balance,
    });
  }
  rows.push({ kind: 'grand', label: 'Total period postings', debit, credit });
  return {
    title: 'General Ledger',
    subtitle: `${period.start} through ${period.end}`,
    columns: [
      { key: 'label', label: 'Account / transaction' },
      { key: 'fund', label: 'Fund' },
      { key: 'debit', label: 'Debit', money: true },
      { key: 'credit', label: 'Credit', money: true },
      { key: 'balance', label: 'Balance (Dr / negative Cr)', money: true },
    ],
    rows,
    disclaimer:
      'Running balances are calculated separately for each account. Credit balances are shown in parentheses. Opening balances include all posted activity before the selected period.',
  };
}
