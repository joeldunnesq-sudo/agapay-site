import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { captureBrowserErrors } from './lib/browser-error-gate.mjs';
/* global renderGiversPanel, renderGiversDirectory, setGiversSort */
const source = await readFile(new URL('../public/parish/features/giving/givers.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await context.newPage();
    const gate = captureBrowserErrors(page);
    let mode = 'success',
      requests = 0;
    await context.route('**/*', async (route) => {
      const u = new URL(route.request().url());
      if (u.pathname === '/')
        return route.fulfill({
          contentType: 'text/html',
          body: `<form id="export"><input id="givingExportMonth" type="month"><select id="givingExportGroup"><option>date</option><option>giver</option></select><button type="submit">Export</button></form><span id="givingExportStatus"></span><input id="pdxGvSearch">${['giverStatCount', 'giverStatTotal', 'pdxGvKpiMedian', 'giverStatRecurring', 'pdxGvKpiCountMeta', 'pdxGvKpiTotalMeta', 'pdxGvKpiRecurringMeta', 'giverStatLast', 'pdxGvTitle', 'pdxGvRecurringPct', 'pdxGvRecurringSub', 'pdxGvLeaderboard', 'pdxGvNudgeList', 'giversPane'].map((id) => '<div id="' + id + '"></div>').join('')}<div id="sort"><button id="name">Name</button><button id="amount">Amount</button></div>`,
        });
      requests++;
      assert.equal(u.pathname, '/api/parish/dashboard/p/giving-history');
      assert.equal(u.searchParams.get('month'), '2026-09');
      assert.equal(u.searchParams.get('format'), 'csv');
      assert.equal(route.request().headers()['x-parish-session'], 'synthetic');
      if (mode === 'denied')
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: '<img src=x> Denied' }),
        });
      if (mode === 'invalid') return route.fulfill({ contentType: 'application/json', body: '{}' });
      return route.fulfill({
        contentType: 'text/csv;charset=utf-8',
        headers: {
          'Content-Disposition': mode === 'empty' ? '' : 'attachment; filename="verified.csv"',
          'X-AGAPAY-Export-Rows': mode === 'empty' ? '0' : '2',
        },
        body: 'Date,Amount\n2026-09-01,10.00',
      });
    });
    try {
      await page.goto('https://givers.test/');
      await page.addScriptTag({
        content: `let currentParish={parishId:'p'};let allGifts=[];let captured;let statements=0;let nudges=0;function authHeaders(){return {'x-parish-session':'synthetic'};}function escapeHtml(v){const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML;}function money(v){return '$'+(Number(v||0)/100).toFixed(2);}function shortDate(v){return v||'';}function populateGivingStatementsPanel(){statements++;}function checkNudgeEligibility(){nudges++;}function downloadBlob(name,blob){captured={name,blob};}`,
      });
      await page.addScriptTag({ content: source });
      await page.evaluate(
        `(()=>{const now=new Date();const old=new Date(now.getTime()-100*86400000).toISOString();allGifts=[{id:'1',donorName:'Zoe <img src=x>',donorEmail:'ZOE@example.test',date:now.toISOString(),amountCents:10000,recurring:true},{id:'2',donorName:'Zoe',donorEmail:' zoe@example.test ',date:now.toISOString(),giftAmountCents:2500,amountCents:3000,source:'outside'},{id:'3',giverKey:'amy',donorName:'Amy',date:old,amountCents:5000,recurring:true},{id:'4',amountCents:1000,date:old}];})()`
      );
      await page.evaluate(() => renderGiversPanel());
      assert.equal(await page.locator('#giverStatCount').textContent(), '3');
      assert.equal(await page.locator('#giverStatTotal').textContent(), '$185.00');
      assert.equal(await page.locator('#pdxGvKpiMedian').textContent(), '$50.00');
      assert.equal(await page.locator('#giverStatRecurring').textContent(), '2');
      assert.equal(await page.locator('img').count(), 0);
      assert.match(await page.locator('#giversPane').textContent(), /1 outside/);
      assert.equal(await page.locator('.pdx-gv-nudge.lapsed').count(), 1);
      assert.equal(await page.evaluate('statements'), 1);
      assert.equal(await page.evaluate('nudges'), 1);
      assert.match(await page.locator('#givingExportMonth').inputValue(), /^\d{4}-\d{2}$/);
      await page.evaluate(() => setGiversSort('name', document.getElementById('name')));
      assert.equal(await page.locator('.pdx-gv-dir-name').first().textContent(), 'Amy');
      assert.equal(await page.locator('#name').getAttribute('class'), 'active');
      await page.evaluate(() => setGiversSort('gifts'));
      assert.match(await page.locator('.pdx-gv-dir-name').first().textContent(), /Zoe/);
      await page.evaluate(() => setGiversSort('recency'));
      assert.match(await page.locator('.pdx-gv-dir-name').first().textContent(), /Zoe/);
      await page.locator('#pdxGvSearch').fill('zoe@');
      await page.evaluate(() => renderGiversDirectory());
      assert.equal(await page.locator('.pdx-gv-dir-card').count(), 1);
      await page.locator('#pdxGvSearch').fill('absent');
      await page.evaluate(() => renderGiversDirectory());
      assert.match(await page.locator('#giversPane').textContent(), /No givers match/);
      await page.evaluate(
        `window.submitExport=()=>exportGiversMonthlyCsv({preventDefault(){},currentTarget:document.getElementById('export'),submitter:null})`
      );
      await page.locator('#givingExportMonth').fill('');
      await page.evaluate('window.submitExport()');
      assert.equal(requests, 0);
      assert.match(await page.locator('#givingExportStatus').textContent(), /Choose a giving month/);
      await page.locator('#givingExportMonth').fill('2026-09');
      await page.locator('#givingExportGroup').selectOption('giver');
      await page.evaluate('window.submitExport()');
      assert.equal(await page.evaluate('captured.name'), 'verified.csv');
      assert.match(await page.evaluate('captured.blob.text()'), /Date,Amount/);
      assert.match(await page.locator('#givingExportStatus').textContent(), /Exported 2 transactions.*giver/);
      mode = 'denied';
      await page.evaluate('window.submitExport()');
      assert.match(await page.locator('#givingExportStatus').textContent(), /Denied/);
      assert.equal(await page.locator('img').count(), 0);
      mode = 'invalid';
      await page.evaluate('window.submitExport()');
      assert.match(await page.locator('#givingExportStatus').textContent(), /not a CSV/);
      mode = 'empty';
      await page.evaluate('window.submitExport()');
      assert.equal(await page.evaluate('captured.name'), 'giving-2026-09-by-giver.csv');
      assert.match(await page.locator('#givingExportStatus').textContent(), /column headers/);
      assert.equal(await page.locator('button[type=submit]').isEnabled(), true);
      await page.evaluate('allGifts=[]');
      await page.evaluate(() => renderGiversPanel());
      assert.match(await page.locator('#giversPane').textContent(), /No paid gifts/);
      const before = requests;
      await page.evaluate('currentParish=null');
      await page.evaluate('window.submitExport()');
      assert.equal(requests, before);
      gate.assertClean();
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
console.log(
  'PASS givers desktop/mobile grouping, statistics, sorting/search, lapsed donors, escaped markup and monthly CSV validation/retry'
);
