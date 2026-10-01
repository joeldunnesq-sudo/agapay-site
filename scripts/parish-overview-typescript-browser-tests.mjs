import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { captureBrowserErrors } from './lib/browser-error-gate.mjs';
/* global loadGivingSummary, renderGivingSummary, pdxAnimateCount, pdxDrawSparkline */
const source = await readFile(new URL('../public/parish/features/giving/overview.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await context.newPage();
    const gate = captureBrowserErrors(page);
    let status = 200;
    let body = JSON.stringify({
      summary: {
        year: 2026,
        ytdCents: 10000,
        grossGiftCents: 12500,
        giverCount: 3,
        giftCount: 4,
        averageGiftCents: 2500,
        feeCoveragePercent: 150,
        monthly: [{ amountCents: 100 }, { amountCents: 100 }],
      },
    });
    const requests = [];
    await context.route('**/*', async (route) => {
      if (route.request().url() === 'https://overview.test/')
        return route.fulfill({
          contentType: 'text/html',
          body:
            '<button id="refresh">Refresh</button>' +
            [
              'givingSummaryPane',
              'givingSummaryStatus',
              'pdxHeroTotal',
              'pdxHeroRange',
              'pdxHeroSub',
              'pdxHeroTitle',
              'pdxKpiDonors',
              'pdxKpiAvgGift',
              'pdxKpiRecurring',
              'pdxKpiGiftCount',
              'pdxKpiDonorsMeta',
              'pdxKpiAvgGiftMeta',
              'pdxKpiGiftCountMeta',
            ]
              .map((id) => `<div id="${id}"></div>`)
              .join('') +
            '<svg id="pdxHeroSpark"></svg>',
        });
      requests.push(route.request().url());
      await route.fulfill({ status, contentType: 'application/json', body });
    });
    try {
      await page.goto('https://overview.test/');
      await page.addScriptTag({
        content: `let currentParish={parishId:'p / one'};let insightCalls=0;let stripeCalls=0;
function authHeaders(){return {'x-parish-session':'synthetic'};}
function loadGivingOverviewInsights(){insightCalls++;}
function loadStripeVolume(){stripeCalls++;}
function money(v){return '$'+Number(v)/100;}
function shortDate(v){return v?String(v):'';}
function escapeHtml(v){return String(v||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');}`,
      });
      await page.addScriptTag({ content: source });
      await page.evaluate(() => loadGivingSummary(document.querySelector('#refresh')));
      assert.equal(requests[0], 'https://overview.test/api/parish/dashboard/p%20%2F%20one/giving-summary');
      await page.waitForFunction(() => document.querySelector('#pdxHeroTotal').textContent === '$100');
      assert.equal(await page.locator('#pdxKpiDonors').textContent(), '3');
      assert.match(await page.locator('#pdxKpiAvgGiftMeta').textContent(), /100%/);
      assert.equal(await page.locator('#pdxHeroSpark circle').count(), 2);
      await page.waitForFunction(
        () => document.querySelector('#pdxHeroSpark path[stroke]').style.strokeDashoffset === '0'
      );
      assert.equal(await page.locator('#givingSummaryStatus').evaluate((node) => node.hidden), true);
      assert.equal(await page.evaluate('stripeCalls'), 1);
      status = 503;
      body = JSON.stringify({ detail: '<img src=x> failed' });
      await page.evaluate(() => loadGivingSummary(document.querySelector('#refresh')));
      assert.equal(await page.locator('#givingSummaryPane').textContent(), '<img src=x> failed');
      assert.equal(await page.locator('#givingSummaryPane img').count(), 0);
      assert.equal(await page.locator('#givingSummaryStatus').evaluate((node) => node.hidden), false);
      assert.equal(await page.locator('#refresh').isEnabled(), true);
      assert.equal(await page.evaluate('stripeCalls'), 1);
      assert.equal(await page.locator('#pdxHeroTotal').textContent(), '$100');
      status = 200;
      body = '{';
      await page.evaluate(() => loadGivingSummary(document.querySelector('#refresh')));
      assert.equal(await page.locator('#pdxHeroTotal').textContent(), '—');
      assert.equal(await page.locator('#givingSummaryStatus').evaluate((node) => node.hidden), true);
      assert.equal(await page.evaluate('stripeCalls'), 2);
      await page.evaluate(() => renderGivingSummary({ dataSource: 'not_connected' }));
      assert.match(await page.locator('#pdxHeroSub').textContent(), /Connect Stripe/);
      await page.evaluate(() => renderGivingSummary({ monthly: [], feeCoveragePercent: -5, lastGiftAt: '<img>' }));
      assert.match(await page.locator('#pdxHeroSpark').textContent(), /No monthly data/);
      assert.equal(await page.locator('#pdxHeroSub img').count(), 0);
      assert.match(await page.locator('#pdxKpiAvgGiftMeta').textContent(), /Net after fees/);
      await page.evaluate(() => {
        pdxAnimateCount(null, 1);
        pdxDrawSparkline(null, [1, 2]);
        document.querySelector('#givingSummaryPane').remove();
      });
      const before = requests.length;
      await page.evaluate(() => loadGivingSummary());
      assert.equal(requests.length, before);
      gate.assertClean();
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
console.log(
  'PASS - summary desktop/mobile animation, flat chart, fees, escaped failures, retry cleanup, malformed JSON, disconnected and missing DOM'
);
