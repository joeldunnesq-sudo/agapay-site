import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const output = '../screenshots';
await mkdir(output, { recursive: true });
const accounts = [
  { id: 'cash', accountNumber: '1010', name: 'Operating bank', category: 'asset' },
  { id: 'rev', accountNumber: '4010', name: 'General Donations', category: 'revenue' },
  { id: 'fee', accountNumber: '5840', name: 'Payment Processing Fees', category: 'expense' },
];
const funds = [
  { id: 'general', code: 'GENERAL', name: 'General Operating', restrictionType: 'unrestricted', isDefault: 1 },
  { id: 'building', code: 'BUILDING', name: 'Building Fund', restrictionType: 'donor_restricted_temporary' },
];
const ledger = [];
function entry(date, number, amount, account, fund = 'general') {
  const f = funds.find((f) => f.id === fund),
    a = accounts.find((a) => a.id === account);
  ledger.push({
    date,
    entryNumber: number,
    accountNumber: a.accountNumber,
    accountName: a.name,
    description: number === 'GIFT-1' ? 'Sunday tithe <script>never run</script>' : number,
    fundCode: f.code,
    fundName: f.name,
    creditAmount: account === 'rev' ? amount : 0,
    debitAmount: account === 'rev' ? 0 : amount,
    sourceType: 'giving',
  });
  ledger.push({
    date,
    entryNumber: number,
    accountNumber: '1010',
    accountName: 'Operating bank',
    description: number,
    fundCode: f.code,
    fundName: f.name,
    debitAmount: account === 'rev' ? amount : 0,
    creditAmount: account === 'rev' ? 0 : amount,
    sourceType: 'giving',
  });
}
entry('2026-09-01', 'OLD-GIFT', 1000, 'rev');
entry('2026-10-01', 'GIFT-1', 10330, 'rev');
entry('2026-10-02', 'FEE-1', 330, 'fee');
entry('2026-10-03', 'BUILDING-1', 5000, 'rev', 'building');
entry('2026-11-01', 'NEW-GIFT', 2000, 'rev');
const setup = {
  currentFiscalYear: { id: 'fy2026', startDate: '2026-01-01', endDate: '2026-12-31', name: '2026' },
  settings: { baseCurrency: 'USD' },
  initialization: { operational: true },
};
function activity(from = '2026-01-01', to = '2026-11-03') {
  const rows = [];
  for (const a of accounts.filter((a) => a.category !== 'asset'))
    for (const f of funds) {
      const amount = ledger
        .filter((l) => l.accountNumber === a.accountNumber && l.fundCode === f.code && l.date >= from && l.date <= to)
        .reduce(
          (s, l) => s + (a.category === 'revenue' ? l.creditAmount - l.debitAmount : l.debitAmount - l.creditAmount),
          0
        );
      if (amount)
        rows.push({
          accountId: a.id,
          accountNumber: a.accountNumber,
          accountName: a.name,
          category: a.category,
          fundId: f.id,
          restrictionType: f.restrictionType,
          amount,
        });
    }
  const sum = (c) => rows.filter((r) => r.category === c).reduce((s, r) => s + r.amount, 0);
  return {
    startDate: from,
    endDate: to,
    rows,
    totals: { revenue: sum('revenue'), expenses: sum('expense'), changeInNetAssets: sum('revenue') - sum('expense') },
  };
}
const position = {
  asOfDate: '2026-10-31',
  rows: [{ accountNumber: '1010', accountName: 'Operating bank', category: 'asset', amount: 16000 }],
  totals: { assets: 16000, liabilities: 0, netAssets: 16000, difference: 0 },
  validation: { status: 'validated' },
};
const budgets = [
  { id: 'draft', name: 'Next revision', status: 'draft', versionNumber: 4 },
  { id: 'approved', name: '2026 Treasurer Demonstration Budget — Active Funds', status: 'approved', versionNumber: 3 },
  { id: 'locked', name: 'Original parish plan', status: 'locked', versionNumber: 1 },
];
const browser = await chromium.launch({ headless: true });
const errors = [],
  requests = [];
let failActivities = false,
  denyClose = false,
  delaySummary = false;
let releaseSummary;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, timezoneId: 'America/Chicago' });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-11-03T16:00:00Z') });
  await page.route('**/*', async (route) => {
    const u = new URL(route.request().url()),
      p = u.pathname;
    if (u.hostname !== 'ux.test') return route.fulfill({ body: '' });
    if (p === '/')
      return route.fulfill({
        contentType: 'text/html',
        body: '<html><head><meta charset="utf-8"><link rel="stylesheet" href="/parish/redesign.css"><link rel="stylesheet" href="/parish/accounting-reports.css"><style>*{box-sizing:border-box}body{margin:0;padding:30px;background:#f6f3ec;color:#173a47;font-family:Arial,sans-serif}#accountingPane{max-width:1360px;margin:auto}button,input,select{font:inherit}button{cursor:pointer}</style></head><body><div hidden id="accountingTierLabel"></div><div hidden id="accountingTierCopy"></div><div hidden id="accountingParishName"></div><div hidden id="accountingFiscalYear"></div><main id="accountingPane"></main></body></html>',
      });
    if (p.includes('/api/')) {
      requests.push(p + u.search);
      const json = (v) => route.fulfill({ json: { ok: true, ...v } });
      if (p.endsWith('/setup')) return json({ overview: setup, tier: 'advanced_operations' });
      if (p.endsWith('/workspace-reference')) return json({ accounts, accountCatalog: accounts, funds });
      if (p.endsWith('/journals')) return json({ entries: [] });
      if (p.endsWith('/general-ledger')) return json({ rows: ledger });
      if (p.endsWith('/trial-balance')) return json({ report: { rows: [] } });
      if (p.endsWith('/statement-of-activities')) {
        if (failActivities) return route.fulfill({ status: 500, json: { message: 'Fixture report retry required' } });
        return json({
          report: activity(u.searchParams.get('from') || undefined, u.searchParams.get('to') || undefined),
        });
      }
      if (p.endsWith('/statement-of-financial-position')) return json({ report: position });
      if (p.endsWith('/fund-activity')) return json({ report: { rows: [] } });
      if (p.endsWith('/recurring-transactions')) return json({ items: [] });
      if (p.endsWith('/ledger/status')) return json({ status: { operational: true } });
      if (p.endsWith('/bank/accounts')) return json({ accounts: [] });
      if (p.endsWith('/bank/reconciliations'))
        return json({ sessions: [{ status: 'voided' }, { status: 'completed' }, { status: 'in_progress' }] });
      if (p.endsWith('/close/workspace')) {
        if (denyClose) return route.fulfill({ status: 403, json: { message: 'Forbidden' } });
        return json({ sessions: [{ status: 'completed' }] });
      }
      if (p.endsWith('/payables/overview')) {
        if (delaySummary) await new Promise((r) => (releaseSummary = r));
        return json({ overview: { openPayables: 202315, awaitingApproval: 2 } });
      }
      if (p.endsWith('/budgets')) return json({ budgets });
      if (p.endsWith('/variance')) {
        const end = `2026-${u.searchParams.get('throughMonth').padStart(2, '0')}-31`,
          a = activity('2026-01-01', end);
        return json({
          report: {
            budget: { name: budgets.find((b) => p.includes('/' + b.id + '/')).name },
            throughDate: end,
            rows: a.rows.map((r) => ({
              ...r,
              account: r.accountName,
              budget: 20000,
              actual: r.amount,
              variance: r.amount - 20000,
              varianceLabel: r.category === 'expense' ? 'favorable' : 'unfavorable',
            })),
          },
        });
      }
      throw Error('Unmocked API ' + p);
    }
    try {
      const file = path.join('public', p);
      return route.fulfill({
        body: await readFile(file),
        contentType: p.endsWith('.js')
          ? 'text/javascript'
          : p.endsWith('.css')
            ? 'text/css'
            : 'application/octet-stream',
      });
    } catch {
      return route.fulfill({ status: 404, body: '' });
    }
  });
  await page.goto('https://ux.test/');
  await page.evaluate(() => {
    window.currentParish = { parishId: 'st-fiacre', name: 'St Fiacre (Demo)', accountingAvailable: true };
    window.authHeaders = () => ({});
    window.moduleIncluded = () => true;
    window.accountingActivationGuard = async () => false;
    window.ParishFeatureRegistry = { register() {} };
    window.escapeHtml = (v) =>
      String(v ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
      );
    window.escapeAttr = window.escapeHtml;
  });
  for (const name of ['assets', 'workspace', 'treasurer', 'report-documents', 'report-loaders', 'reports'])
    await page.addScriptTag({ url: `/parish/features/accounting/${name}.js` });
  await page.addScriptTag({ url: '/parish/features/accounting.js' });
  await page.evaluate(() => {
    renderAccountingPane = () => {
      const pane = document.getElementById('accountingPane');
      accountingView === 'overview' ? renderAccountingOverview(pane) : renderAccountingReports(pane);
    };
  });
  await page.evaluate(() => loadAccountingTab(true));
  await page.waitForFunction(() => !accountingOverviewSummaries.loading);
  assert.match(await page.locator('#accountingPane').textContent(), /2 awaiting approval/);
  assert.match(await page.locator('#accountingPane').textContent(), /1 open/);
  assert.equal(
    await page.evaluate(() => accountingData.payables),
    null,
    'Summary does not masquerade as full payables workspace'
  );
  assert.ok(!requests.some((p) => p.includes('/payables/vendors')), 'Overview skips heavy payables workspace');
  await page.screenshot({ path: output + '/overview-desktop.png', fullPage: true });
  await page.evaluate(() => {
    accountingView = 'reports';
    accountingReportView = 'library';
    renderAccountingPane();
  });
  assert.deepEqual(await page.evaluate(() => accountingReportPeriod()), { start: '2026-01-01', end: '2026-10-31' });
  await page.getByRole('searchbox', { name: 'Find a report' }).fill('within budget');
  assert.equal(await page.locator('.acct-report-library-card:visible').count(), 1);
  await page.getByRole('searchbox', { name: 'Find a report' }).fill('not-a-report');
  assert.match(await page.locator('#accountingReportSearchStatus').textContent(), /No matching/);
  await page.getByRole('searchbox', { name: 'Find a report' }).fill('');
  await page.screenshot({ path: output + '/report-library-desktop.png', fullPage: true });
  await page.evaluate(() => openAccountingReport('activities'));
  assert.equal(await page.locator('.acct-statement').count(), 1);
  await page.screenshot({ path: output + '/income-desktop.png', fullPage: true });
  const before = await page.evaluate(() => accountingStatementDocument());
  await page.locator('.acct-statement tbody .detail').first().locator('.number .acct-report-drill').last().click();
  assert.equal(await page.locator('.acct-report-detail').count(), 1);
  assert.match(await page.locator('.acct-detail-summary').textContent(), /163.30/);
  assert.doesNotMatch(await page.locator('#accountingTransactionResults').textContent(), /NEW-GIFT/);
  await page.getByRole('button', { name: 'GIFT-1', exact: true }).click();
  assert.equal(await page.locator('.acct-journal-preview tbody tr').count(), 2);
  assert.equal(await page.locator('script').filter({ hasText: 'never run' }).count(), 0);
  await page.screenshot({ path: output + '/transactions-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Back to Income Statement' }).click();
  assert.deepEqual(await page.evaluate(() => accountingStatementDocument()), before);
  await page.locator('.acct-statement tbody .detail').first().locator('.number .acct-report-drill').nth(1).click();
  assert.match(await page.locator('#accountingTransactionResults').textContent(), /BUILDING-1/);
  assert.doesNotMatch(await page.locator('#accountingTransactionResults').textContent(), /GIFT-1/);
  await page.getByRole('button', { name: 'Back to Income Statement' }).click();
  await page.evaluate(() => openAccountingReport('budgetActual'));
  assert.equal(await page.getByLabel('Budget version').inputValue(), 'approved');
  assert.ok(requests.some((p) => p.includes('/budgets?fiscalYearId=fy2026')));
  assert.ok(requests.some((p) => p.includes('/approved/variance?throughMonth=10')));
  await page.screenshot({ path: output + '/budget-desktop.png', fullPage: true });
  await page.getByLabel('Budget version').selectOption('locked');
  await page.waitForFunction(() => !accountingReportLoading);
  assert.equal(await page.getByLabel('Budget version').inputValue(), 'locked');
  await page.getByRole('button', { name: 'Fiscal YTD through today', exact: true }).click();
  await page.waitForFunction(() => !accountingReportLoading);
  assert.equal(await page.locator('[name=end]').inputValue(), '2026-10-31');
  assert.match(await page.locator('.acct-form-status').textContent(), /whole fiscal months/);
  await page.evaluate(() => openAccountingReport('activities'));
  failActivities = true;
  await page.getByRole('button', { name: 'Last completed month', exact: true }).click();
  await page.waitForFunction(() => !accountingReportLoading);
  assert.equal(await page.locator('[name=start]').inputValue(), '2026-01-01');
  assert.match(await page.locator('.acct-form-status').textContent(), /retry required/);
  failActivities = false;
  await page.evaluate(() => {
    accountingReportDateRange = null;
    accountingSelectedBudgetId = '';
  });
  assert.deepEqual(await page.evaluate(() => accountingReportPeriod()), { start: '2026-01-01', end: '2026-10-31' });
  assert.equal(await page.evaluate(() => accountingSelectedBudgetId), 'locked');
  // A newer draft cannot become the prior approved comparison. Fund details stay scoped.
  await page.evaluate(() => {
    accountingSelectedBudgetId = 'approved';
    return openAccountingReport('comparativeBudget');
  });
  assert.doesNotMatch(await page.locator('.acct-statement').textContent(), /Next revision/);
  assert.match(await page.locator('.acct-statement').textContent(), /Original parish plan/);
  await page.evaluate(() => openAccountingReport('budgetActual'));
  await page.locator('.acct-statement tbody .detail').nth(1).locator('.number .acct-report-drill').click();
  assert.match(await page.locator('#accountingTransactionResults').textContent(), /BUILDING-1/);
  assert.doesNotMatch(await page.locator('#accountingTransactionResults').textContent(), /GIFT-1/);
  await page.getByRole('button', { name: 'Back to Budget to Actual' }).click();
  // Pagination must retain totals across all matches, not only the visible page.
  const pagination = await page.evaluate(() => {
    const saved = accountingData.ledger;
    const first = saved.find((r) => r.accountNumber === '4010');
    accountingData.ledger = Array.from({ length: 65 }, (_, i) => ({ ...first, entryNumber: 'PAGE-' + i }));
    accountingTransactionDetail = { label: 'Test account', accountNumber: '4010' };
    accountingTransactionSearch = '';
    accountingTransactionPage = 0;
    const total = accountingReportTransactionRows().length;
    const html = accountingReportTransactionTable();
    accountingData.ledger = saved;
    accountingTransactionDetail = null;
    return { total, visible: (html.match(/PAGE-/g) || []).length, html };
  });
  assert.equal(pagination.total, 65);
  assert.equal(pagination.visible, 100);
  assert.match(pagination.html, /1–50 of 65/);
  // Fiscal years need not begin in January; presets use local calendar dates.
  assert.deepEqual(
    await page.evaluate(() => {
      const saved = accountingData.setup;
      accountingData.setup = { currentFiscalYear: { startDate: '2026-07-01', endDate: '2027-06-30' } };
      const value = accountingPeriodPreset('ytd');
      accountingData.setup = saved;
      return value;
    }),
    { start: '2026-07-01', end: '2026-10-31' }
  );
  denyClose = true;
  await page.evaluate(() => {
    accountingView = 'overview';
    return loadAccountingOverviewSummaries(true);
  });
  assert.match(await page.locator('#accountingPane').textContent(), /Unavailable/);
  assert.match(await page.locator('#accountingPane').textContent(), /2 awaiting approval/);
  // A summary finishing while another view is open must not replace that screen.
  delaySummary = true;
  await page.evaluate(() => {
    void loadAccountingOverviewSummaries(true);
    accountingView = 'reports';
    accountingReportView = 'library';
    renderAccountingPane();
  });
  await page.waitForTimeout(30);
  releaseSummary();
  await page.waitForFunction(() => !accountingOverviewSummaries.loading);
  assert.equal(await page.locator('.acct-report-library-head').count(), 1);
  delaySummary = false;
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => {
      accountingView = 'reports';
      accountingReportView = 'library';
      renderAccountingPane();
    });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'No page overflow in library'
    );
    await page.screenshot({ path: `${output}/library-${width}.png`, fullPage: true });
    await page.evaluate(() => openAccountingReport('activities'));
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'Table scroll stays inside statement'
    );
    await page.screenshot({ path: `${output}/income-${width}.png`, fullPage: true });
  }
  assert.deepEqual(errors, []);
  await writeFile(
    '../ux-browser-validation.json',
    JSON.stringify(
      {
        passed: true,
        checks: [
          'overview automatic light summaries',
          'permission isolation',
          'late summary navigation safety',
          'report search',
          'shared local fiscal periods',
          'budget selection persistence',
          'no silent month expansion',
          'date failure rollback',
          'account and restriction drilldown',
          'full journal detail',
          'safe HTML escaping',
          'mobile and tablet overflow',
        ],
        requests,
      },
      null,
      2
    )
  );
  console.log(
    'PASS - treasurer report discovery, shared fiscal dates, budget selection, transaction and journal drilldowns, automatic summaries, failure isolation and responsive layouts'
  );
} finally {
  await browser.close();
}
