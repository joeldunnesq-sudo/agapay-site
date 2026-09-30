'use strict';

// One financial statement model for the screen, CSV, print, and PDF.
function accountingStatementMoney(cents) {
  const value = Number(cents || 0);
  if (!value) return '-';
  const amount = (Math.abs(value) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return value < 0 ? `(${amount})` : amount;
}

function accountingStatementDocument() {
  const id = accountingReportView;
  const custom = accountingCustomReport;
  const source = custom || accountingData.reports[id === 'expenses' ? 'activities' : id];
  if (!source || source.error) throw new Error(source?.error || 'Open a report before downloading it.');
  const period = accountingReportPeriod();
  const definition = ACCOUNTING_REPORT_LIBRARY.find((item) => item.id === id);
  const statement = {
    title: source.title || definition?.title || 'Financial Report',
    parish: currentParish?.name || currentParish?.parishName || 'Parish',
    currency: accountingData.setup?.settings?.baseCurrency || 'USD',
    basis: 'Posted ledger activity',
    period:
      source.subtitle ||
      (id === 'position' || id === 'trialBalance'
        ? `As of ${source.asOfDate || source.endDate || period.end}`
        : `${source.startDate || period.start} through ${source.endDate || period.end}`),
    columns: [],
    rows: [],
    notes: [],
  };
  const row = (kind, cells) => statement.rows.push({ kind, cells });
  const section = (label) => row('section', [label]);
  const money = (label, key) => ({ label, key, money: true });
  const accountName = (item) => `${item.accountNumber || ''}  ${item.accountName || item.name || ''}`.trim();
  const sum = (items, key) => items.reduce((total, item) => total + Number(item[key] || 0), 0);
  const totalCells = (items, label) =>
    statement.columns.map((col, index) => (index === 0 ? label : col.money ? sum(items, col.key) : ''));
  if (source.disclaimer) statement.notes.push(source.disclaimer);
  if (source.validation?.status && source.validation.status !== 'validated')
    statement.notes.push(`Review required: ${(source.validation.reasonCodes || []).join(', ').replaceAll('_', ' ')}.`);

  if (id === 'trialBalance') {
    statement.columns = [{ label: 'Account' }, money('Debit', 'endingDebit'), money('Credit', 'endingCredit')];
    for (const item of source.rows || []) row('detail', [accountName(item), item.endingDebit, item.endingCredit]);
    const debit = sum(source.rows || [], 'endingDebit'),
      credit = sum(source.rows || [], 'endingCredit');
    row('grand', ['Total', debit, credit]);
    if (debit !== credit)
      statement.notes.push(
        `Trial balance difference: ${accountingStatementMoney(debit - credit)} ${statement.currency}.`
      );
  } else if (id === 'activities') {
    statement.subtitle = 'Statement of Activities (Profit and Loss)';
    statement.columns = [
      { label: 'Account' },
      money('Without donor restrictions'),
      money('With donor restrictions'),
      money('Total'),
    ];
    const groupTotals = {};
    for (const [category, label] of [
      ['revenue', 'Revenue and support'],
      ['expense', 'Expenses'],
    ]) {
      section(label);
      const groups = new Map();
      for (const item of (source.rows || []).filter((entry) => entry.category === category)) {
        const key = item.accountId || item.accountNumber || item.accountName;
        const grouped = groups.get(key) || { label: accountName(item), without: 0, with: 0 };
        grouped[/^donor_restricted/.test(item.restrictionType || '') ? 'with' : 'without'] += Number(item.amount || 0);
        groups.set(key, grouped);
      }
      const items = [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
      for (const item of items) row('detail', [item.label, item.without, item.with, item.without + item.with]);
      const totals = [sum(items, 'without'), sum(items, 'with')];
      groupTotals[category] = totals;
      row('subtotal', [`Total ${label.toLowerCase()}`, ...totals, totals[0] + totals[1]]);
    }
    const net = groupTotals.revenue.map((value, i) => value - groupTotals.expense[i]);
    row('grand', ['Change in net assets', ...net, net[0] + net[1]]);
    statement.notes.push(
      'Board-designated funds are included without donor restrictions. This statement presents posted activity; restriction releases require correctly classified journal entries.'
    );
  } else if (id === 'position') {
    statement.subtitle = 'Statement of Financial Position';
    statement.columns = [{ label: 'Account' }, money('Amount')];
    for (const [category, label, totalKey] of [
      ['asset', 'Assets', 'assets'],
      ['liability', 'Liabilities', 'liabilities'],
      ['net_asset', 'Net assets', 'netAssets'],
    ]) {
      section(label);
      const items = (source.rows || []).filter((item) => item.category === category);
      if (category === 'net_asset' && source.netAssetsByRestriction) {
        row('detail', ['Without donor restrictions', source.netAssetsByRestriction.withoutDonorRestrictions]);
        row('detail', ['With donor restrictions', source.netAssetsByRestriction.withDonorRestrictions]);
      } else for (const item of items) row('detail', [accountName(item), item.amount]);
      if (category === 'net_asset' && !source.netAssetsByRestriction) {
        const unclosed = Number(source.totals?.netAssets || 0) - sum(items, 'amount');
        if (unclosed) row('detail', ['Unclosed revenue less expenses', unclosed]);
      }
      row('subtotal', [`Total ${label.toLowerCase()}`, source.totals?.[totalKey] || 0]);
    }
    row('grand', [
      'Total liabilities and net assets',
      Number(source.totals?.liabilities || 0) + Number(source.totals?.netAssets || 0),
    ]);
    if (source.totals?.difference)
      statement.notes.push(
        `Balance sheet difference: ${accountingStatementMoney(source.totals.difference)} ${statement.currency}. Review before distribution.`
      );
  } else if (id === 'expenses') {
    statement.columns = [{ label: 'Expense account' }, money('Amount', 'amount')];
    const groups = new Map();
    for (const item of (source.rows || []).filter((entry) => entry.category === 'expense')) {
      const key = accountName(item);
      groups.set(key, (groups.get(key) || 0) + Number(item.amount || 0));
    }
    for (const [label, amount] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) row('detail', [label, amount]);
    row('grand', ['Total expenses', [...groups.values()].reduce((a, b) => a + b, 0)]);
  } else if (custom) {
    statement.columns = custom.columns;
    const items = custom.rows || [];
    const cells = (item) => statement.columns.map((col) => item[col.key] ?? (col.money ? 0 : ''));
    if (id === 'cashFlows') {
      for (const [key, label] of [
        ['operating', 'Cash flows from operating activities'],
        ['investing', 'Cash flows from investing activities'],
        ['financing', 'Cash flows from financing activities'],
      ]) {
        section(label);
        const part = items.filter((item) => item.section === key);
        for (const item of part) row('detail', cells(item));
        row(
          'subtotal',
          statement.columns.map((col, i) =>
            i === 0 ? `Net cash from ${key} activities` : col.money ? sum(part, col.key) : ''
          )
        );
      }
      for (const item of items.filter((entry) => entry.section === 'reconciliation')) row('grand', cells(item));
    } else if (
      ['comparativeIncome', 'comparativePeriods', 'budgetActual', 'comparativeBudget', 'budgetByFund'].includes(id)
    ) {
      const totals = {};
      for (const [category, label] of [
        ['revenue', 'Revenue and support'],
        ['expense', 'Expenses'],
      ]) {
        section(label);
        const part = items.filter((item) => item.category === category);
        for (const item of part) row('detail', cells(item));
        totals[category] = totalCells(part, `Total ${label.toLowerCase()}`);
        row('subtotal', totals[category]);
      }
      const other = items.filter((item) => !['revenue', 'expense'].includes(item.category));
      if (other.length) {
        section('Other accounts');
        for (const item of other) row('detail', cells(item));
      }
      row(
        'grand',
        statement.columns.map((col, i) =>
          i === 0 ? 'Revenue less expenses' : col.money ? totals.revenue[i] - totals.expense[i] : ''
        )
      );
    } else {
      for (const item of items) row(item.kind || 'detail', cells(item));
      if (id !== 'generalLedger') row('grand', totalCells(items, 'Total'));
    }
  }
  if (!statement.rows.some((item) => item.kind === 'detail'))
    statement.notes.push('No posted activity for the selected period.');
  return statement;
}

function accountingStatementHtml(report) {
  const columns = report.columns;
  return `<article class="acct-statement"><header><div class="acct-statement-parish">${escapeHtml(report.parish)}</div><h2>${escapeHtml(report.title)}</h2>${report.subtitle ? `<p>${escapeHtml(report.subtitle)}</p>` : ''}<p>${escapeHtml(report.period)}</p><small>${escapeHtml(report.basis)} · ${escapeHtml(report.currency)} · Negative amounts in parentheses</small></header><div class="acct-table-wrap"><table><thead><tr>${columns.map((col) => `<th scope="col" class="${col.money ? 'number' : ''}">${escapeHtml(col.label)}</th>`).join('')}</tr></thead><tbody>${report.rows.map((item) => (item.kind === 'section' ? `<tr class="section"><th colspan="${columns.length}" scope="rowgroup">${escapeHtml(item.cells[0])}</th></tr>` : `<tr class="${item.kind}">${columns.map((col, i) => `<td class="${col.money ? 'number' : ''}">${escapeHtml(col.money ? accountingStatementMoney(item.cells[i]) : (item.cells[i] ?? ''))}</td>`).join('')}</tr>`)).join('')}</tbody></table></div>${report.notes.map((note) => `<p class="acct-statement-note">${escapeHtml(note)}</p>`).join('')}</article>`;
}

function accountingStatementActions() {
  return '<button type="button" class="acct-refresh" onclick="downloadAccountingReportPdf(this)">Download PDF</button><button type="button" class="acct-refresh" onclick="printAccountingReport()">Print</button><button type="button" class="acct-refresh" onclick="downloadAccountingReport()">Export CSV</button>';
}

async function downloadAccountingReportPdf(button) {
  const label = button?.textContent;
  try {
    const report = accountingStatementDocument();
    if (button) {
      button.disabled = true;
      button.textContent = 'Preparing PDF…';
    }
    const { createAccountingReportPdf } = await import('/parish/accounting-report-pdf.js?v=20260930reports1');
    const bytes = await createAccountingReportPdf(report);
    const filename = `agapay-${report.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${accountingReportPeriod().end}.pdf`;
    downloadBlob(filename, new Blob([bytes], { type: 'application/pdf' }));
  } catch (error) {
    alert(error.message || 'Unable to create this PDF. Please try again.');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = label;
    }
  }
}
