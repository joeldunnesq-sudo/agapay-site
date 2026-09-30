import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';

const accounts = [
  { accountNumber: '1010', name: 'Operating bank', category: 'asset' },
  { accountNumber: '2000', name: 'Accounts payable', category: 'liability' },
  { accountNumber: '3000', name: 'Opening net assets', category: 'net_asset' },
  { accountNumber: '4010', name: 'Contributions', category: 'revenue' },
  { accountNumber: '5100', name: 'Ministry and outreach', category: 'expense' },
];
const activities = {
  startDate: '2026-01-01',
  endDate: '2026-09-30',
  totals: { revenue: 12500000, expenses: 8300000, changeInNetAssets: 4200000 },
  rows: [
    {
      accountNumber: '4010',
      accountName: 'Contributions',
      category: 'revenue',
      restrictionType: 'unrestricted',
      amount: 10000000,
    },
    {
      accountNumber: '4010',
      accountName: 'Contributions',
      category: 'revenue',
      restrictionType: 'donor_restricted_temporary',
      amount: 2500000,
    },
    { accountNumber: '5100', accountName: 'Ministry and outreach', category: 'expense', amount: 8300000 },
  ],
};
const position = {
  asOfDate: '2026-09-30',
  rows: [
    { accountNumber: '1010', accountName: 'Operating bank', category: 'asset', amount: 15700000 },
    { accountNumber: '1500', accountName: 'Accumulated depreciation', category: 'asset', amount: -500000 },
    { accountNumber: '2000', accountName: 'Accounts payable', category: 'liability', amount: 1000000 },
    { accountNumber: '3000', accountName: 'Opening net assets', category: 'net_asset', amount: 10000000 },
  ],
  totals: { assets: 15200000, liabilities: 1000000, netAssets: 14200000, difference: 0 },
};
const trial = {
  endDate: '2026-09-30',
  rows: [
    { accountNumber: '1010', accountName: 'Operating bank', endingDebit: 15200000, endingCredit: 0 },
    { accountNumber: '2000', accountName: 'Accounts payable', endingDebit: 0, endingCredit: 1000000 },
    { accountNumber: '3000', accountName: 'Opening net assets', endingDebit: 0, endingCredit: 10000000 },
    { accountNumber: '4010', accountName: 'Contributions', endingDebit: 0, endingCredit: 12500000 },
    { accountNumber: '5100', accountName: 'Ministry and outreach', endingDebit: 8300000, endingCredit: 0 },
  ],
};
const ledger = [
  {
    date: '2025-12-31',
    entryNumber: 'OPEN',
    accountNumber: '1010',
    accountName: 'Operating bank',
    debitAmount: 10000000,
    creditAmount: 0,
    fundName: 'General',
  },
  {
    date: '2025-12-31',
    entryNumber: 'OPEN',
    accountNumber: '3000',
    accountName: 'Opening net assets',
    debitAmount: 0,
    creditAmount: 10000000,
    fundName: 'General',
  },
  ...Array.from({ length: 70 }, (_, i) => [
    {
      date: '2026-08-12',
      entryNumber: `G-${i}`,
      description: 'Sunday offerings - community ministry support',
      accountNumber: '1010',
      accountName: 'Operating bank',
      debitAmount: 12500,
      creditAmount: 0,
      fundName: 'General',
    },
    {
      date: '2026-08-12',
      entryNumber: `G-${i}`,
      description: 'Sunday offerings - community ministry support',
      accountNumber: '4010',
      accountName: 'Contributions',
      debitAmount: 0,
      creditAmount: 12500,
      fundName: 'General',
    },
  ]).flat(),
  {
    date: '2026-08-13',
    entryNumber: 'E-1',
    description: 'Ministry supplies',
    accountNumber: '5100',
    accountName: 'Ministry and outreach',
    debitAmount: 12000,
    creditAmount: 0,
    fundName: 'General',
  },
  {
    date: '2026-08-13',
    entryNumber: 'E-1',
    description: 'Ministry supplies',
    accountNumber: '1010',
    accountName: 'Operating bank',
    debitAmount: 0,
    creditAmount: 12000,
    fundName: 'General',
  },
];
const browser = await chromium.launch();
await mkdir('output/pdf', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [],
    requests = [];
  page.on('dialog', async (dialog) => {
    errors.push(dialog.message());
    await dialog.dismiss();
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/')
      return route.fulfill({
        contentType: 'text/html',
        body: '<html><head><meta charset="utf-8"><link rel="stylesheet" href="/parish/accounting-reports.css"></head><body><main id="accountingPane"></main></body></html>',
      });
    if (url.pathname.startsWith('/api/')) {
      requests.push(url.pathname + url.search);
      let report = {};
      if (url.pathname.endsWith('/statement-of-activities'))
        report = { ...activities, startDate: url.searchParams.get('from'), endDate: url.searchParams.get('to') };
      else if (url.pathname.endsWith('/statement-of-financial-position')) report = position;
      else if (url.pathname.endsWith('/trial-balance')) report = trial;
      else if (url.pathname.endsWith('/statement-of-cash-flows'))
        report = {
          rows: [
            { section: 'operating', label: 'Change in net assets', amount: 4200000 },
            { section: 'operating', label: 'Change in accounts payable', amount: 1000000 },
            { section: 'investing', label: 'Equipment purchased', amount: -200000 },
            { section: 'reconciliation', label: 'Net change in cash', amount: 5000000 },
            { section: 'reconciliation', label: 'Cash at beginning of period', amount: 10000000 },
            { section: 'reconciliation', label: 'Cash at end of period', amount: 15000000 },
          ],
        };
      else if (url.pathname.endsWith('/statement-of-functional-expenses'))
        report = {
          rows: [
            {
              naturalCategory: 'Ministry and outreach',
              program: 7300000,
              managementAndGeneral: 1000000,
              fundraising: 0,
              total: 8300000,
            },
          ],
          simplification:
            'Administrative expenses are management-and-general; all other expenses are program. Fundraising is not separately tracked and is shown as zero.',
        };
      else if (url.pathname.endsWith('/net-asset-rollforward'))
        report = {
          rows: [
            {
              restrictionType: 'unrestricted',
              beginningBalance: 10000000,
              additions: 12500000,
              reductions: 8300000,
              endingBalance: 14200000,
            },
          ],
        };
      else if (url.pathname.endsWith('/budgets'))
        return route.fulfill({
          json: {
            budgets: [
              { id: 'b1', name: '2026 budget' },
              { id: 'b2', name: '2025 budget' },
            ],
          },
        });
      else if (url.pathname.endsWith('/variance'))
        report = {
          budget: { name: '2026 approved budget' },
          throughDate: '2026-12-31',
          rows: [
            {
              accountId: '4010',
              accountNumber: '4010',
              account: 'Contributions',
              category: 'revenue',
              fundId: 'general',
              budget: 12000000,
              actual: 12500000,
              variance: 500000,
              varianceLabel: 'favorable',
            },
            {
              accountId: '5100',
              accountNumber: '5100',
              account: 'Ministry and outreach',
              category: 'expense',
              fundId: 'general',
              budget: 9000000,
              actual: 8300000,
              variance: -700000,
              varianceLabel: 'favorable',
            },
          ],
        };
      return route.fulfill({ json: { report } });
    }
    try {
      return route.fulfill({
        body: await readFile(new URL(`../public${url.pathname}`, import.meta.url)),
        contentType: url.pathname.endsWith('.js')
          ? 'text/javascript'
          : url.pathname.endsWith('.css')
            ? 'text/css'
            : 'application/octet-stream',
      });
    } catch {
      return route.fulfill({ status: 404, body: '' });
    }
  });
  await page.goto('https://agapay.test/');
  await page.evaluate(
    ({ accounts, activities, position, trial, ledger }) => {
      Object.assign(window, {
        accountingData: {
          accounts,
          accountCatalog: accounts,
          ledger,
          tier: 'advanced_operations',
          funds: [{ id: 'general', name: 'General' }],
          setup: { settings: { baseCurrency: 'USD' } },
          reports: { activities, position, trialBalance: trial },
        },
        currentParish: { name: 'Holy Trinity Orthodox Church - Αγία Τριάδα' },
        accountingReportView: 'library',
        accountingCustomReport: null,
        accountingDepthComparative: false,
        escapeHtml: (value) =>
          String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;'),
        accountingDate: (value) => value,
        accountingMoney: (value) => '$' + (Number(value || 0) / 100).toFixed(2),
        accountingEmpty: (title, copy) => `<p>${title}: ${copy}</p>`,
        accountingApi: (path) => '/api' + path,
        authHeaders: () => ({}),
        restrictionLabel: (value) => value.replaceAll('_', ' '),
        downloadBlob: (name, blob) => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = name;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        },
      });
      window.escapeAttr = window.escapeHtml;
      window.renderAccountingPane = () => renderAccountingReports(document.getElementById('accountingPane'));
    },
    { accounts, activities, position, trial, ledger }
  );
  for (const file of ['report-documents', 'report-loaders', 'reports'])
    await page.addScriptTag({ url: `/parish/features/accounting/${file}.js` });
  await page.evaluate(() => {
    accountingReportDateRange = { start: '2026-01-01', end: '2026-09-30' };
  });
  const ids = await page.evaluate(() => ACCOUNTING_REPORT_LIBRARY.map((report) => report.id));
  assert.equal(ids.length, 16);
  for (const id of ids) {
    await page.evaluate((id) => openAccountingReport(id), id);
    assert.equal(await page.locator('.acct-statement').count(), 1, `${id} renders a financial statement`);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
    const result = await download;
    await result.saveAs(`output/pdf/${id}.pdf`);
    const pdf = await PDFDocument.load(await readFile(`output/pdf/${id}.pdf`));
    assert.ok(pdf.getPageCount() > 0, id);
    assert.match(pdf.getAuthor(), /Αγία Τριάδα/);
    if (id === 'generalLedger') assert.ok(pdf.getPageCount() > 2, 'Ledger paginates across several pages');
    if (id === 'trialBalance')
      assert.deepEqual(await page.locator('.acct-statement .grand td').allTextContents(), [
        'Total',
        '235,000.00',
        '235,000.00',
      ]);
    if (id === 'position')
      assert.match(await page.locator('.acct-statement').textContent(), /Unclosed revenue less expenses.*42,000\.00/s);
    if (id === 'activities')
      assert.deepEqual(await page.locator('.acct-statement .grand td').allTextContents(), [
        'Change in net assets',
        '17,000.00',
        '25,000.00',
        '42,000.00',
      ]);
    if (id === 'budgetActual') assert.deepEqual(await page.locator('.acct-statement .grand td').allTextContents(), ['Revenue less expenses', '30,000.00', '42,000.00', '12,000.00', '']);
    if (id === 'expenses')
      assert.doesNotMatch(await page.locator('.acct-statement tbody').textContent(), /Contributions/);
  }
  await page.evaluate(() => openAccountingReport('activities'));
  await page.locator('[name="start"]').fill('2026-06-01');
  await page.locator('[name="end"]').fill('2026-06-30');
  await page.getByRole('button', { name: 'Apply report dates' }).click();
  await page.waitForFunction(() =>
    document.querySelector('.acct-statement').textContent.includes('2026-06-01 through 2026-06-30')
  );
  assert.ok(requests.some((url) => url.includes('from=2026-06-01&to=2026-06-30')));
  const csvEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const csv = await csvEvent;
  await csv.saveAs('output/pdf/report.csv');
  assert.match(await readFile('output/pdf/report.csv', 'utf8'), /2026-06-01 through 2026-06-30/);
  assert.equal(await page.evaluate(() => accountingPriorYear('2024-02-29')), '2023-02-28');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log(
    'PASS - all 16 report PDFs download, financial totals, debit/credit columns, Greek fonts, ledger pagination, selected dates, CSV parity, and mobile layout'
  );
} finally {
  await browser.close();
}
