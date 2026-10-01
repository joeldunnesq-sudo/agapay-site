import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { captureBrowserErrors } from './lib/browser-error-gate.mjs';
/* global loadGivingOverviewInsights, swGivingSourceComparison */
const source = await readFile(new URL('../public/parish/features/giving/insights.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await context.newPage();
    const gate = captureBrowserErrors(page);
    const requests = [];
    let failed = false;
    let hold = false;
    const held = [];
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/')
        return route.fulfill({ contentType: 'text/html', body: '<section id="givingOverviewInsights"></section>' });
      requests.push(url.pathname + url.search);
      if (hold && url.searchParams.get('year') === '2024') await new Promise((resolve) => held.push(resolve));
      const old = url.searchParams.get('year') === '2024';
      await route.fulfill({
        status: failed ? 503 : 200,
        contentType: 'application/json',
        body: JSON.stringify(
          failed
            ? { error: 'unavailable' }
            : {
                total_actual_cents: old ? 20000 : 10000,
                manual_income_cents: 2500,
                processing_fees: { label: old ? 'old fees' : 'new fees' },
              }
        ),
      });
    });
    try {
      await page.goto('https://insights.test/');
      await page.addScriptTag({
        content: `let currentParish={parishId:'p'};let allowed=false;
function isParishTier(){return allowed;}function isParishPlusActive(){return false;}
function authHeaders(){return {'x-parish-session':'synthetic'};}
function renderStewardshipFees(fees){return '<p>'+fees.label+'</p>';}`,
      });
      await page.addScriptTag({ content: source });
      await page.evaluate(() => loadGivingOverviewInsights());
      assert.equal(requests.length, 0);
      assert.equal(await page.locator('#givingOverviewInsights').evaluate((n) => n.hidden), true);
      await page.evaluate('allowed=true');
      await page.evaluate(() => loadGivingOverviewInsights());
      assert.equal(await page.locator('#givingOverviewInsights').evaluate((n) => n.hidden), false);
      assert.match(await page.locator('#givingOverviewComparison').textContent(), /\$100\.00/);
      assert.match(await page.locator('#givingOverviewComparison').textContent(), /75\.0%/);
      assert.match(await page.locator('#givingOverviewFees').textContent(), /new fees/);
      const before = requests.length;
      await page.locator('#givingOverviewInsightYear').fill('1999');
      await page.evaluate(() => loadGivingOverviewInsights());
      assert.equal(requests.length, before);
      hold = true;
      await page.locator('#givingOverviewInsightYear').fill('2024');
      await page.evaluate('window.oldInsightLoad=loadGivingOverviewInsights(); void 0');
      for (let i = 0; held.length < 2 && i < 500; i++) await new Promise((r) => setTimeout(r, 10));
      assert.equal(held.length, 2);
      await page.locator('#givingOverviewInsightYear').fill('2025');
      await page.evaluate(() => loadGivingOverviewInsights());
      hold = false;
      for (const release of held.splice(0)) release();
      await page.evaluate('window.oldInsightLoad');
      assert.match(await page.locator('#givingOverviewComparison').textContent(), /\$100\.00/);
      assert.doesNotMatch(await page.locator('#givingOverviewComparison').textContent(), /\$200\.00/);
      assert.equal(await page.locator('#givingOverviewFees').textContent(), 'new fees');
      hold = true;
      await page.locator('#givingOverviewInsightYear').fill('2024');
      await page.evaluate('window.oldInsightLoad=loadGivingOverviewInsights(); void 0');
      for (let i = 0; held.length < 2 && i < 500; i++) await new Promise((r) => setTimeout(r, 10));
      assert.equal(held.length, 2);
      await page.evaluate("currentParish={parishId:'other'}");
      await page.evaluate(() => loadGivingOverviewInsights());
      hold = false;
      for (const release of held.splice(0)) release();
      await page.evaluate('window.oldInsightLoad');
      assert.equal(await page.locator('#givingOverviewInsightYear').inputValue(), String(new Date().getFullYear()));
      assert.equal(await page.locator('#givingOverviewFees').textContent(), 'new fees');
      assert.ok(requests.some((x) => x.includes('/other/')));
      failed = true;
      await page.evaluate(() => loadGivingOverviewInsights());
      assert.equal(await page.getByRole('button', { name: 'Try again' }).count(), 2);
      failed = false;
      await page.getByRole('button', { name: 'Try again' }).first().click();
      await page.waitForFunction(() => !document.querySelector('#givingOverviewComparison button'));
      assert.match(await page.locator('#givingOverviewComparison').textContent(), /\$100\.00/);
      const invalid = await page.evaluate(() =>
        [
          {},
          { total_actual_cents: 10, manual_income_cents: 11 },
          { total_actual_cents: 10, manual_income_cents: -1 },
          { total_actual_cents: '10', manual_income_cents: 1 },
          { total_actual_cents: Number.MAX_SAFE_INTEGER + 1, manual_income_cents: 1 },
        ].map((s) => swGivingSourceComparison(s, 2026))
      );
      assert.ok(invalid.every((html) => html.includes('not available yet')));
      assert.match(
        await page.evaluate(() => swGivingSourceComparison({ total_actual_cents: 0, manual_income_cents: 0 }, 2026)),
        /No contributions recorded/
      );
      await page.locator('#givingOverviewInsights').evaluate((n) => n.remove());
      await page.evaluate(() => loadGivingOverviewInsights());
      gate.assertClean();
    } finally {
      for (const release of held) release();
      await context.close();
    }
  }
} finally {
  await browser.close();
}
console.log(
  'PASS - insights desktop/mobile entitlement, year validation, source totals, stale year/parish suppression, retry and missing DOM'
);
