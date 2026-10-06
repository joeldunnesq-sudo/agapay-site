import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { captureBrowserErrors } from './lib/browser-error-gate.mjs';
/* global loadWeeklyFunds */
const source = await readFile(new URL('../public/parish/features/giving/weekly-funds.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await context.newPage();
    const gate = captureBrowserErrors(page);
    let requests = 0;
    let failure = false;
    let complete = true;
    let empty = false;
    let hold = false;
    let release;
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/')
        return route.fulfill({
          contentType: 'text/html',
          body: '<p id="weeklyFundsPeriod"></p><div id="weeklyFundsPane"></div><button id="refresh" onclick="loadWeeklyFunds(this)">Refresh</button>',
        });
      requests++;
      assert.equal(url.search, '?view=weekly-funds');
      assert.equal(route.request().headers()['x-parish-session'], 'synthetic');
      const old = hold;
      if (hold)
        await new Promise((resolve) => {
          release = resolve;
        });
      await route.fulfill({
        status: failure ? 503 : 200,
        contentType: 'application/json',
        body: JSON.stringify({
          error: failure ? '<img src=x onerror=alert(1)>' : undefined,
          weeklyFunds: {
            available: true,
            complete,
            reason: 'Not verified',
            period: { label: old ? 'Old week' : 'Current week', timezone: 'UTC' },
            parishNetCents: 10000,
            grossGiftCents: 11000,
            giftCount: empty ? 0 : 6,
            estimatedFeeCount: 1,
            generatedAt: '2026-10-01T12:00:00Z',
            allocations: empty
              ? []
              : Array.from({ length: 6 }, (_, i) => ({
                  key: String(i),
                  label: i === 0 ? '<img src=x onerror=alert(1)>' : 'Fund ' + i,
                  netCents: i === 0 ? 20000 : i === 1 ? -100 : 1000,
                })),
          },
        }),
      });
    });
    try {
      await page.goto('https://weekly.test/');
      await page.addScriptTag({
        content: `let currentParish={parishId:'p',funds:[]};function authHeaders(){return {'x-parish-session':'synthetic'};}function escapeHtml(v){const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML;}function moneyFull(v){return '$'+(Number(v||0)/100).toFixed(2);}`,
      });
      await page.addScriptTag({ content: source });
      await page.evaluate(() => loadWeeklyFunds());
      assert.equal(requests, 1);
      assert.match(await page.locator('#weeklyFundsPeriod').textContent(), /Current week/);
      assert.equal(await page.locator('.fr-weekly-row').count(), 6);
      assert.equal(await page.locator('img').count(), 0);
      assert.equal(
        await page
          .locator('.fr-weekly-track i')
          .nth(0)
          .evaluate((n) => n.style.width),
        '100%'
      );
      assert.equal(
        await page
          .locator('.fr-weekly-track i')
          .nth(1)
          .evaluate((n) => n.style.width),
        '0%'
      );
      await page.getByText('View all 6 funds').click();
      assert.equal(await page.locator('details').evaluate((n) => n.open), true);
      await page.evaluate(() => loadWeeklyFunds());
      assert.equal(requests, 1, 'fresh cache reused');
      await page.evaluate("currentParish.funds=[{id:'new'}]");
      await page.evaluate(() => loadWeeklyFunds());
      assert.equal(requests, 2, 'catalog invalidates cache');
      await page.evaluate('weeklyFundsCache.get("p").at-=60001');
      await page.evaluate(() => loadWeeklyFunds());
      assert.equal(requests, 3, 'expired cache refetched');
      hold = true;
      await page.locator('#refresh').click();
      await page.waitForFunction(() => document.getElementById('refresh').disabled);
      for (let i = 0; !release && i < 500; i++) await new Promise((r) => setTimeout(r, 10));
      assert.ok(release);
      assert.equal(requests, 4, 'manual refresh bypasses cache');
      hold = false;
      await page.evaluate("currentParish={parishId:'other',funds:[]}");
      await page.evaluate(() => loadWeeklyFunds());
      release();
      release = undefined;
      await page.waitForFunction(() => !document.getElementById('refresh').disabled);
      assert.match(
        await page.locator('#weeklyFundsPeriod').textContent(),
        /Current week/,
        'stale parish response ignored'
      );
      failure = true;
      await page.evaluate(() => loadWeeklyFunds(document.getElementById('refresh')));
      assert.equal(await page.locator('img').count(), 0);
      assert.match(await page.locator('#weeklyFundsPane').textContent(), /<img/);
      assert.equal(await page.locator('#refresh').isEnabled(), true);
      failure = false;
      complete = false;
      await page.getByRole('button', { name: 'Retry weekly totals' }).click();
      await page.waitForFunction(() => document.getElementById('weeklyFundsPane').textContent.includes('Not verified'));
      complete = true;
      empty = true;
      await page.getByRole('button', { name: 'Retry weekly totals' }).click();
      await page.waitForFunction(() =>
        document.getElementById('weeklyFundsPane').textContent.includes('No recorded gifts')
      );
      const before = requests;
      await page.evaluate('currentParish=null');
      await page.evaluate(() => loadWeeklyFunds());
      await page.evaluate("currentParish={parishId:'missing'};document.getElementById('weeklyFundsPane').remove()");
      await page.evaluate(() => loadWeeklyFunds());
      assert.equal(requests, before);
      gate.assertClean();
    } finally {
      await context.close();
    }
  }
  console.log(
    'PASS weekly funds desktop/mobile cache, refresh, stale parish, escaping, bounds, failure/retry and empty states'
  );
} finally {
  await browser.close();
}
