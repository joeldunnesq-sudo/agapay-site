import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setContent(
    '<main style="max-width:980px;margin:24px auto;padding:16px"><div id="stewardshipOutsideGivingMount"></div><div id="comparison"></div><div id="accountingPane"></div></main>'
  );
  for (const file of [
    'parish/style.css',
    'parish/redesign.css',
    'styles/stewardship.css',
    'styles/stewardship-intelligence.css',
    'styles/stewardship-entry.css',
  ])
    await page.addStyleTag({ content: await readFile(new URL('../public/' + file, import.meta.url), 'utf8') });
  await page.evaluate(() => {
    window.escapeHtml = (value) =>
      String(value).replace(
        /[&<>"']/g,
        (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
      );
    window.escapeAttr = escapeHtml;
    window.currentParish = {
      parishId: 'test',
      timezone: 'America/Chicago',
      funds: [{ id: 'general', name: 'General Fund' }],
    };
    window.accountingMoney = (value) => (value / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    window.accountingData = {
      tier: 'advanced_operations',
      reports: {
        activities: {
          startDate: '2026-01-01',
          endDate: '2026-09-23',
          totals: { revenue: 120050, expenses: 80025, changeInNetAssets: 40025 },
          rows: [
            { accountNumber: '4100', accountName: 'Contributions', category: 'revenue', amount: 120050 },
            { accountNumber: '5100', accountName: 'Operating expenses', category: 'expense', amount: 80025 },
          ],
        },
      },
    };
    window.accountingReportView = 'library';
    window.accountingCustomReport = null;
    window.renderAccountingPane = () => renderAccountingReports(document.getElementById('accountingPane'));
    window.setAccountingView = (view) => {
      window.selectedView = view;
      renderAccountingPane();
    };
  });
  for (const file of ['stewardship/outside-giving', 'stewardship/reports', 'giving/insights', 'accounting/reports'])
    await page.addScriptTag({
      content: await readFile(new URL('../public/parish/features/' + file + '.js', import.meta.url), 'utf8'),
    });
  await page.evaluate(() => {
    ensureOutsideGivingCard();
    document.getElementById('comparison').innerHTML = swGivingSourceComparison(
      { total_actual_cents: 100000, manual_income_cents: 25000 },
      2026
    );
    openAccountingIncomeReport();
  });
  assert.equal(await page.evaluate(() => selectedView), 'reports');
  assert.match(await page.locator('.acct-income-summary').textContent(), /Net surplus.*\$400\.25/s);
  assert.match(await page.locator('.acct-income-summary').textContent(), /\$1,200\.50/);
  assert.match(await page.locator('.sw-giving-comparison').textContent(), /\$750\.00 · 75\.0%/);
  assert.match(await page.locator('.sw-giving-comparison').textContent(), /\$250\.00 · 25\.0%/);
  assert.equal(
    await page
      .locator('.sw-source-track i')
      .first()
      .evaluate((node) => node.style.width),
    '75%'
  );
  assert.match(
    await page.locator('.sw-outside-choices').textContent(),
    /Batch totals do not create individual donor statements/
  );
  await page.evaluate(() => {
    const pane = document.getElementById('stewardshipManualIncomePane');
    pane.hidden = false;
    pane.innerHTML = renderManualIncome({ entries: [] }, new Date().getFullYear());
  });
  assert.equal(await page.locator('[name="fundId"]').inputValue(), '');
  await page.locator('[name="fundId"]').selectOption('general');
  assert.equal(await page.locator('[name="sourceLabel"]').isVisible(), false);
  await page.locator('[name="source"]').selectOption('other_giving_platform');
  assert.equal(await page.locator('[name="sourceLabel"]').isVisible(), true);
  assert.equal(await page.locator('[name="sourceLabel"]').evaluate((node) => node.required), true);
  if (process.env.STEWARDSHIP_ENTRY_SCREENSHOT) {
    await mkdir('tmp/previews', { recursive: true });
    await page.screenshot({ path: 'tmp/previews/stewardship-entry-report.png', fullPage: true });
  }
  await page.setViewportSize({ width: 375, height: 812 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    'Entry, graph and report must fit a mobile screen'
  );
  await page.evaluate(() => {
    accountingData.reports.activities.totals.expenses = 130075;
    renderAccountingPane();
    window.printedReport = '';
    window.open = () => ({
      document: {
        write: (html) => {
          window.printedReport = html;
        },
        close() {},
      },
      focus() {},
    });
    printAccountingReport();
  });
  assert.match(await page.locator('.acct-income-summary').textContent(), /Net deficit.*-\$100\.25/s);
  assert.match(await page.evaluate(() => printedReport), /Net deficit.*-\$100\.25/s);
  await page.evaluate(() => {
    document.getElementById('comparison').innerHTML = swGivingSourceComparison(
      { total_actual_cents: 0, manual_income_cents: 0 },
      2025
    );
  });
  assert.match(await page.locator('.sw-giving-comparison').textContent(), /No contributions/);
  assert.equal(await page.locator('.sw-source-track').count(), 0);
  await page.evaluate(() => {
    document.getElementById('comparison').innerHTML = swGivingSourceComparison({}, 2026);
  });
  assert.match(await page.locator('.sw-giving-comparison').textContent(), /not available/);
  assert.deepEqual(errors, []);
  console.log(
    'PASS - outside entry defaults, source comparison amounts/shares/empty states, revenue-minus-expense surplus/deficit, print totals and mobile layout'
  );
} finally {
  await browser.close();
}
