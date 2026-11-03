import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
const output = '../screenshots';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const asset = {
  id: 'asset_fixture',
  tag: 'EQ-001',
  name: 'Parish hall sound system',
  acquisition_date: '2026-01-10',
  in_service_date: '2026-01-10',
  cost: 120000,
  salvage: 0,
  life_months: 60,
  method: 'straight_line',
  location: 'Parish hall',
  serial_number: 'SN-001',
  insurance_value: 140000,
  notes: 'Invoice and insurance schedule',
  status: 'active',
  version: 1,
  postedDepreciation: 18000,
  scheduledDepreciation: 20000,
  netBookValue: 102000,
};
const accounts = [
  { id: 'equipment', accountNumber: '1500', name: 'Equipment', category: 'asset', normalBalance: 'debit' },
  { id: 'accum', accountNumber: '1590', name: 'Accumulated depreciation', category: 'asset', normalBalance: 'credit' },
  { id: 'expense', accountNumber: '5900', name: 'Depreciation', category: 'expense', normalBalance: 'debit' },
];
let setupPosts = 0;
let posts = 0,
  fail = false;
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://assets.test/**', async (route) => {
    const u = new URL(route.request().url()),
      p = u.pathname;
    if (p === '/')
      return route.fulfill({
        contentType: 'text/html',
        body: '<html><head><meta charset="utf-8"><link rel="stylesheet" href="/parish/redesign.css"><link rel="stylesheet" href="/parish/accounting-reports.css"><style>*{box-sizing:border-box}body{margin:0;background:#f6f3ec;color:#173a47;font-family:Arial,sans-serif;padding:28px}button,input,select,textarea{font:inherit}button{cursor:pointer}main{max-width:1300px;margin:auto}</style></head><body><nav><button data-accounting-view="reports">Reports</button></nav><main id="accountingPane"></main></body></html>',
      });
    if (p.includes('/api/')) {
      if (p.endsWith('/account-setup')) {
        setupPosts++;
        return route.fulfill({ json: { ok: true } });
      }
      if (p.endsWith('/workspace-reference'))
        return route.fulfill({ json: { accounts, funds: [{ id: 'fund_general', name: 'General' }] } });
      if (p.endsWith('/attachments')) return route.fulfill({ json: { attachments: [] } });
      if (fail) return route.fulfill({ status: 503, json: { error: 'Synthetic asset outage' } });
      if (p.endsWith('/depreciation-preview'))
        return route.fulfill({
          json: {
            asset,
            depreciation: 2000,
            netBookValue: 100000,
            lines: [
              { accountId: 'expense', debitAmount: 2000, creditAmount: 0, description: 'Depreciation' },
              { accountId: 'accum', debitAmount: 0, creditAmount: 2000, description: 'Accumulated depreciation' },
            ],
          },
        });
      if (p.endsWith('/depreciation-post')) {
        posts++;
        return route.fulfill({ json: { journalId: 'fixture-journal' } });
      }
      if (p.endsWith('/acquisition-lines'))
        return route.fulfill({
          json: {
            rows: [
              {
                id: 'acquisition',
                available: 120000,
                entry_date: '2026-01-10',
                description: 'Equipment purchase',
                account_name: 'Equipment',
              },
            ],
          },
        });
      if (p.endsWith('/asset_fixture'))
        return route.fulfill({
          json: {
            asset,
            source: { journal_entry_id: 'acquisition' },
            movements: [],
            schedule: [{ throughDate: '2026-10-31', amount: 2000, accumulated: 20000, netBookValue: 100000 }],
          },
        });
      return route.fulfill({
        json: {
          rows: [asset],
          totals: { cost: 120000, accumulated: 18000, netBookValue: 102000 },
          policy: 'Full-month straight-line. Scheduled amounts require explicit posting.',
        },
      });
    }
    try {
      return route.fulfill({
        body: await readFile('public' + p),
        contentType: p.endsWith('.js') ? 'text/javascript' : 'text/css',
      });
    } catch {
      return route.fulfill({ status: 404, body: '' });
    }
  });
  await page.goto('https://assets.test/');
  await page.evaluate(() => {
    window.currentParish = { parishId: 'synthetic-assets' };
    window.authHeaders = () => ({});
    window.ParishFeatureRegistry = { register() {} };
    window.escapeHtml = (v) =>
      String(v ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
      );
    window.escapeAttr = window.escapeHtml;
    window.downloadBlob = (name, blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
  });
  for (const script of ['workspace', 'assets', 'report-documents', 'report-loaders', 'reports'])
    await page.addScriptTag({ url: '/parish/features/accounting/' + script + '.js' });
  await page.addScriptTag({ url: '/parish/features/accounting.js' });
  assert.equal(await page.locator('[data-accounting-view=assets]').count(), 1);
  await page.evaluate(() => installAccountingAssetsNavigation());
  assert.equal(await page.locator('[data-accounting-view=assets]').count(), 1, 'Navigation installation is idempotent');
  const navigationTarget = await page.evaluate(() => {
    const original = setAccountingView;
    let target = '';
    setAccountingView = (view) => {
      target = view;
    };
    document.querySelector('[data-accounting-view=assets]').click();
    setAccountingView = original;
    return target;
  });
  assert.equal(navigationTarget, 'assets');
  await page.evaluate((accounts) => {
    accountingData.accounts = accounts;
    accountingData.funds = [{ id: 'fund_general', name: 'General' }];
    accountingView = 'assets';
    accountingReportPeriod = () => ({ start: '2026-01-01', end: '2026-10-31' });
    renderAccountingPane = () => renderAccountingAssets(document.getElementById('accountingPane'));
  }, accounts);
  await page.evaluate(() => loadAccountingAssets());
  assert.match(await page.locator('main').textContent(), /1,020.00/);
  await page.getByRole('searchbox').fill('no match');
  assert.equal(await page.locator('#accountingAssetRows tr:visible').count(), 0);
  await page.getByRole('searchbox').fill('sound');
  assert.equal(await page.locator('#accountingAssetRows tr:visible').count(), 1);
  await page.screenshot({ path: output + '/assets-desktop.png', fullPage: true });
  await page.getByRole('button', { name: /EQ-001/ }).click();
  await page.getByRole('button', { name: 'Preview journal', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm and post depreciation' }).waitFor();
  assert.equal(posts, 0, 'A preview never posts');
  await page.screenshot({ path: output + '/asset-depreciation-preview.png', fullPage: true });
  await page.getByRole('button', { name: 'Confirm and post depreciation' }).click();
  await page.waitForFunction(() => !document.getElementById('accountingAssetPreview').textContent);
  assert.equal(posts, 1);
  await page.evaluate(() => closeAccountingAsset());
  await page.getByRole('button', { name: /Register an asset/ }).click();
  await page.getByRole('heading', { name: 'Register a parish asset' }).waitFor();
  assert.equal(await page.locator('select[name=acquisitionLineId] option').count(), 2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => closeAccountingAsset());
  await page.getByRole('button', { name: /Register an asset/ }).waitFor();
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    'Mobile page has no horizontal overflow'
  );
  await page.screenshot({ path: output + '/assets-mobile.png', fullPage: true });
  await page.evaluate(() => loadAccountingAssetReport());
  const document = await page.evaluate(() => {
    accountingReportView = 'assetRegister';
    return accountingStatementDocument();
  });
  assert.equal(document.title, 'Asset Register');
  assert.ok(document.rows.some((r) => r.kind === 'grand' && r.cells.includes(102000)));
  const downloaded = page.waitForEvent('download');
  await page.evaluate(() => downloadAccountingReportPdf(null));
  const file = await downloaded;
  await file.saveAs(output + '/asset-register-sample.pdf');
  const pdf = await PDFDocument.load(await readFile(output + '/asset-register-sample.pdf'));
  assert.ok(pdf.getPageCount() > 0);
  await page.evaluate(() => showAccountingAssetAccountSetup());
  assert.equal(await page.locator('fieldset').count(), 3);
  await page.getByRole('button', { name: 'Save asset account setup', exact: true }).click();
  await page.getByRole('button', { name: 'Set up asset accounts', exact: true }).waitFor();
  assert.equal(setupPosts, 1);
  // Untrusted asset names remain text in the live table.
  asset.name = '<img src=x onerror=alert(1)>';
  await page.evaluate(() => loadAccountingAssets());
  assert.equal(await page.locator('#accountingAssetRows img').count(), 0);
  fail = true;
  await page.evaluate(() => loadAccountingAssets());
  assert.match(await page.getByRole('alert').textContent(), /Synthetic asset outage/);
  assert.deepEqual(errors, []);
  console.log(
    'PASS asset desktop/mobile rendering, search, register form, read-only preview, explicit posting, printable model, escaping and failure recovery'
  );
} finally {
  await browser.close();
}
