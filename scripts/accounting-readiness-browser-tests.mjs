import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import { accountingNativeFixture } from './lib/accounting-native-fixture.mjs';
import {
  saveDimension,
  listDimensions,
  dimensionTransactions,
  classifyJournalLine,
} from '../src/accounting/dimensions/service.js';
import { dimensionReport } from '../src/accounting/dimensions/reporting.js';
import {
  saveReportPackage,
  listReportPackages,
  generateReportPackage,
  getReportPackageRun,
} from '../src/accounting/report-packages/service.js';
const f = await accountingNativeFixture(),
  { db, sqlite, actor } = f;
const dept = await saveDimension(db, actor, { kind: 'department', code: 'SCHOOL', name: 'Church School' });
await saveDimension(db, actor, { kind: 'project', code: 'ROOF', name: 'Roof repair' });
await f.journal('2026-01-12', [
  { accountId: 'acct_1010', debitAmount: 125000, creditAmount: 0 },
  { accountId: 'acct_4000', debitAmount: 0, creditAmount: 125000 },
]);
const preset = await saveReportPackage(db, actor, {
  name: 'Monthly council review',
  reportIds: ['activities', 'position', 'cashFlows', 'fundActivity', 'assets', 'departments', 'projects'],
});
const browser = await chromium.launch({ headless: true }),
  errors = [];
await mkdir('artifacts/parish-readiness/screenshots', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', async (dialog) => {
    errors.push(dialog.message());
    await dialog.dismiss();
  });
  await page.route('https://readiness.test/**', async (route) => {
    const u = new URL(route.request().url()),
      path = u.pathname,
      method = route.request().method();
    if (path === '/')
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/parish/redesign.css"><link rel="stylesheet" href="/parish/accounting-reports.css"><style>*{box-sizing:border-box}body{background:#f6f3ec;color:#173a47;font:16px Arial;margin:0;padding:24px}main{max-width:1280px;margin:auto}button,input,select,textarea{font:inherit}label{display:block}button{cursor:pointer}</style></head><body><main id="accountingPane"></main></body></html>',
      });
    if (path.startsWith('/api/')) {
      const p = path.slice('/api/accounting'.length),
        body = method === 'GET' ? null : route.request().postDataJSON();
      let data;
      if (p === '/dimensions')
        data =
          method === 'GET'
            ? { dimensions: await listDimensions(db, actor) }
            : { dimension: await saveDimension(db, actor, body) };
      else if (p === '/report-packages')
        data =
          method === 'GET'
            ? await listReportPackages(db, actor)
            : { package: await saveReportPackage(db, actor, body) };
      else if (p === '/budgets') data = { budgets: [] };
      else if (p === '/dimensions/transactions')
        data = await dimensionTransactions(
          db,
          actor,
          u.searchParams.get('from'),
          u.searchParams.get('to'),
          '',
          Object.fromEntries(u.searchParams)
        );
      else if (p.startsWith('/dimensions/transactions/'))
        data = { classification: await classifyJournalLine(db, actor, decodeURIComponent(p.split('/').at(-1)), body) };
      else if (p === '/dimensions/report')
        data = await dimensionReport(db, actor, 'parish', Object.fromEntries(u.searchParams));
      else if (p.endsWith('/generate')) data = await generateReportPackage(db, actor, 'parish', preset.id, body);
      else if (p.startsWith('/report-packages/runs/')) data = await getReportPackageRun(db, actor, p.split('/').at(-1));
      else return route.fulfill({ status: 404, json: { error: 'Unexpected fixture route ' + p } });
      return route.fulfill({ json: { ok: true, ...data } });
    }
    try {
      return route.fulfill({
        body: await readFile('public' + path),
        contentType: path.endsWith('.js')
          ? 'text/javascript'
          : path.endsWith('.css')
            ? 'text/css'
            : 'application/octet-stream',
      });
    } catch {
      return route.fulfill({ status: 404, body: '' });
    }
  });
  await page.goto('https://readiness.test/');
  await page.evaluate(() => {
    window.currentParish = { parishId: 'synthetic-readiness', name: 'St. Synthetic Orthodox Church' };
    window.accountingView = 'reports';
    window.accountingReportView = 'library';
    window.accountingData = { setup: { settings: { baseCurrency: 'USD' } } };
    window.accountingApi = (p) => '/api/accounting' + p;
    window.authHeaders = () => ({});
    window.escapeHtml = (v) =>
      String(v ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
      );
    window.escapeAttr = window.escapeHtml;
    window.accountingDate = (v) => v;
    window.accountingMoney = (n) => '$' + (n / 100).toFixed(2);
    window.accountingReportPeriod = () => ({ start: '2026-01-01', end: '2026-01-31' });
    window.accountingReportDateForm = () => '<p>Shared reporting dates: January 1–31, 2026</p>';
    window.setAccountingView = (v) => {
      window.accountingView = v;
    };
    window.renderAccountingPane = () => {};
    window.downloadBlob = (name, blob) => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = name;
      link.click();
    };
  });
  // Production functions are loaded unchanged; responses above use real service calculations.
  await page.addScriptTag({ content: await readFile('public/parish/features/accounting/report-documents.js', 'utf8') });
  const { transform } = await import('esbuild');
  await page.addScriptTag({
    content: (
      await transform(await readFile('src/browser/parish/features/accounting/readiness.ts', 'utf8'), {
        loader: 'ts',
        target: 'es2022',
      })
    ).code,
  });
  await page.evaluate(() => openAccountingReadiness());
  await page.getByRole('heading', { name: 'See the work behind the numbers' }).waitFor();
  await page.screenshot({
    path: 'artifacts/parish-readiness/screenshots/report-workspace-desktop.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Classify income & expenses', exact: true }).click();
  await page.getByLabel('Department').first().selectOption(dept.id);
  await page.getByLabel('Reason').first().fill('Council reporting classification');
  await page.getByRole('button', { name: 'Save classification', exact: true }).first().click();
  await page.getByText('Saved to the reporting audit trail.').waitFor();
  await page.getByRole('button', { name: '← Reporting workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Department report', exact: true }).click();
  await page.getByRole('heading', { name: 'Department income & expenses' }).waitFor();
  assert.match(await page.locator('#accountingPane').innerText(), /Church School/);
  await page.screenshot({
    path: 'artifacts/parish-readiness/screenshots/department-report-desktop.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: /View transactions for/ })
    .first()
    .click();
  await page.getByRole('heading', { name: 'Classify income & expenses' }).waitFor();
  assert.equal(await page.locator('form[data-line]').count(), 1);
  await page.getByRole('button', { name: '← Reporting workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Generate with selected dates', exact: true }).click();
  await page.getByRole('button', { name: 'Download council PDF', exact: true }).waitFor();
  assert.equal(await page.locator('.acct-statement').count(), 7);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download council PDF', exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs('artifacts/parish-readiness/council-package-synthetic.pdf');
  const pdf = await PDFDocument.load(await readFile('artifacts/parish-readiness/council-package-synthetic.pdf'));
  assert(pdf.getPageCount() >= 7);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => openAccountingReadiness());
  await page.getByRole('heading', { name: 'See the work behind the numbers' }).waitFor();
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    'Mobile page must not overflow horizontally'
  );
  await page.screenshot({ path: 'artifacts/parish-readiness/screenshots/report-workspace-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  await writeFile(
    'artifacts/parish-readiness/browser-evidence.json',
    JSON.stringify(
      {
        result: 'passed',
        synthetic: true,
        pdfPages: pdf.getPageCount(),
        checks: [
          'Desktop reporting workspace',
          'Audited transaction classification',
          'Department totals rendered from real services',
          'Seven-section council PDF',
          'Mobile layout without horizontal page overflow',
          'No browser exceptions',
        ],
      },
      null,
      2
    ) + '\n'
  );
  console.log(
    'PASS real-service reporting workspace, classification, department report, seven-section council PDF and mobile layout'
  );
} finally {
  await browser.close();
  sqlite.close();
}
