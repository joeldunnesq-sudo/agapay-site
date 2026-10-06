import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { captureBrowserErrors } from './lib/browser-error-gate.mjs';
/* global loadGivingHistory, filterHistory, exportHistoryCsv, capturedDownload */
const source = await readFile(new URL('../public/parish/features/giving/history.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await context.newPage();
    const gate = captureBrowserErrors(page);
    let fail = false,
      empty = false;
    const now = new Date();
    const gifts = [
      {
        id: 'new',
        date: now.toISOString(),
        donorName: '=SUM(1,2)',
        donorEmail: '"quote"@example.test',
        fund: '<img src=x onerror=alert(1)>',
        amountCents: 12000,
        giftAmountCents: 10000,
        parishNetCents: 9700,
        totalFeeCents: 300,
        recurring: true,
        coverFees: true,
      },
      {
        id: 'outside',
        date: new Date(now.getTime() - 86400000).toISOString(),
        donorName: 'Outside',
        source: 'outside',
        sourceLabel: 'Cash',
        amountCents: 2500,
        fundId: 'cash',
        type: 'candle',
        commemorationNames: ['Special Intention'],
      },
      { id: 'old', date: '2001-01-01', amountCents: 5000, donorName: 'Old gift' },
      { id: 'invalid', date: 'invalid', amountCents: 1000, donorName: 'Invalid date' },
    ];
    const manual = [{ id: 'manual', amountCents: 500, type: 'candle' }];
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/')
        return route.fulfill({
          contentType: 'text/html',
          body: `<input id="histSearch"><select id="histTypeFilter"><option>all</option><option>recurring</option><option>one_time</option><option>candle</option></select><select id="histFundFilter"></select><select id="histRangeFilter"><option>ytd</option><option>all</option><option>30d</option><option>90d</option></select>${['histStatTotal', 'histStatAmount', 'histStatAvg', 'histStatRecurring', 'histStatDonors', 'historyHeroContext', 'historyResultCount', 'historyTrendPanel', 'historyFundPanel', 'historyTableWrap'].map((id) => '<div id="' + id + '"></div>').join('')}<button id="refresh">Refresh</button>`,
        });
      assert.equal(url.pathname, '/api/parish/dashboard/p/giving-history');
      assert.equal(route.request().headers()['x-parish-session'], 'synthetic');
      return route.fulfill({
        status: fail ? 503 : 200,
        contentType: 'application/json',
        body: JSON.stringify(
          fail ? { detail: '<img src=x> unavailable' } : { gifts: empty ? [] : gifts, manualAccountingGifts: manual }
        ),
      });
    });
    try {
      await page.goto('https://history.test/');
      await page.addScriptTag({
        content: `let currentParish={parishId:'p'};let capturedDownload;let lastStatus;let candleRows;let giverRenders=0;let optionsRenders=0;
function authHeaders(){return {'x-parish-session':'synthetic'};}
function escapeHtml(v){const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML;}
function escapeAttr(v){return escapeHtml(v).replaceAll('"','&quot;');}
function money(v){return '$'+(Number(v||0)/100).toFixed(2);}const moneyFull=money;
function fullDate(v){return String(v||'');}function setStatus(v){lastStatus=v;}
function renderCandleGiving(){candleRows=[...allGifts,...manualAccountingGifts];}
function renderGiversPanel(){giverRenders++;}function renderGivingOptionsEditor(){optionsRenders++;}
function downloadBlob(name,blob){capturedDownload={name,blob};}`,
      });
      await page.addScriptTag({ content: source });
      await page.evaluate(() => loadGivingHistory(document.getElementById('refresh')));
      assert.equal(await page.locator('#refresh').isEnabled(), true);
      assert.equal(await page.locator('#histStatTotal').textContent(), '2');
      assert.equal(await page.locator('#histStatAmount').textContent(), '$125.00');
      assert.equal(await page.locator('#histStatAvg').textContent(), '$62.50');
      assert.equal(await page.locator('#histStatDonors').textContent(), '2');
      assert.equal(await page.evaluate('candleRows.length'), 5);
      assert.equal(await page.evaluate('giverRenders'), 2);
      assert.equal(await page.evaluate('optionsRenders'), 1);
      assert.equal(await page.locator('img').count(), 0);
      assert.match(await page.locator('#historyTableWrap').textContent(), /Not verified/);
      assert.equal(await page.locator('.parish-history-bar-column').count(), 6);
      await page.locator('#histTypeFilter').selectOption('recurring');
      await page.evaluate(() => filterHistory());
      assert.equal(await page.locator('#histStatTotal').textContent(), '1');
      await page.evaluate(() => exportHistoryCsv());
      const csv = await page.evaluate(async () => ({
        name: capturedDownload.name,
        text: await capturedDownload.blob.text(),
        type: capturedDownload.blob.type,
      }));
      assert.match(csv.name, /^p-giving-history-\d{4}-\d{2}-\d{2}\.csv$/);
      assert.equal(csv.type, 'text/csv;charset=utf-8;');
      assert.ok(csv.text.includes('"\'=SUM(1,2)"'));
      assert.ok(csv.text.includes('"""quote""@example.test"'));
      assert.ok(csv.text.includes('"97.00","100.00","3.00","Yes"'));
      await page.locator('#histTypeFilter').selectOption('candle');
      await page.evaluate(() => filterHistory());
      await page.evaluate(() => exportHistoryCsv());
      assert.ok((await page.evaluate('capturedDownload.blob.text()')).includes('"","25.00","","Not verified"'));
      await page.locator('#histTypeFilter').selectOption('all');
      await page.locator('#histSearch').fill('special intention');
      await page.evaluate(() => filterHistory());
      assert.equal(await page.locator('#histStatTotal').textContent(), '1');
      await page.locator('#histSearch').fill('');
      await page.locator('#histFundFilter').selectOption('cash');
      await page.evaluate(() => filterHistory());
      assert.equal(await page.locator('#histStatTotal').textContent(), '1');
      await page.locator('#histFundFilter').selectOption('all');
      for (const range of ['30d', '90d', 'all']) {
        await page.locator('#histRangeFilter').selectOption(range);
        await page.evaluate(() => filterHistory());
        assert.equal(await page.locator('#histStatTotal').textContent(), range === 'all' ? '4' : '2');
      }
      await page.locator('#histSearch').fill('absent');
      await page.evaluate(() => filterHistory());
      await page.evaluate(() => exportHistoryCsv());
      assert.match(await page.evaluate('lastStatus'), /No gifts to export/);
      assert.match(await page.locator('#historyTableWrap').textContent(), /No gifts match/);
      await page.locator('#histSearch').fill('');
      fail = true;
      await page.evaluate(() => loadGivingHistory(document.getElementById('refresh')));
      assert.equal(await page.locator('#refresh').isEnabled(), true);
      assert.equal(await page.locator('img').count(), 0);
      assert.match(await page.locator('#historyTableWrap').textContent(), /<img src=x> unavailable/);
      assert.equal(await page.evaluate('allGifts.length'), 4, 'failed refresh preserves shared cache');
      fail = false;
      empty = true;
      await page.evaluate(() => loadGivingHistory());
      assert.equal(await page.locator('#histStatTotal').textContent(), '0');
      assert.match(await page.locator('#historyTableWrap').textContent(), /No gift history found/);
      await page.evaluate('currentParish=null');
      await page.evaluate(() => loadGivingHistory());
      assert.match(await page.evaluate('lastStatus'), /Load a parish first/);
      gate.assertClean();
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
console.log(
  'PASS history desktop/mobile shared caches, filters, totals, outside gifts, escaped markup, safe CSV and refresh recovery'
);
