import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { captureBrowserErrors } from './lib/browser-error-gate.mjs';
/* global loadCommemorations, renderCommemorations, renderCandleGiving, isCandleGift */
const source = await readFile(new URL('../public/parish/features/giving/commemorations.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await context.newPage();
    const gate = captureBrowserErrors(page);
    let fail = false,
      requests = 0;
    await context.route('**/*', async (route) => {
      const u = new URL(route.request().url());
      if (u.pathname === '/')
        return route.fulfill({
          contentType: 'text/html',
          body: '<div id="commemorationQueuePane"></div><div id="candleGivingPane"></div><button id="refresh">Refresh</button>',
        });
      requests++;
      assert.equal(u.pathname, '/api/parish/dashboard/p/commemorations');
      assert.equal(route.request().headers()['x-parish-session'], 'synthetic');
      return route.fulfill({
        status: fail ? 503 : 200,
        contentType: 'application/json',
        body: JSON.stringify(
          fail
            ? { error: '<img src=x> unavailable' }
            : {
                entries: [
                  {
                    donorName: '<img src=x>',
                    createdAt: '2026-10-01',
                    commemorationKind: 'molieben_panikhida',
                    living: ['Living <name>', '', null],
                    departed: ['Departed'],
                  },
                ],
              }
        ),
      });
    });
    try {
      await page.goto('https://commemorations.test/');
      await page.addScriptTag({
        content: `let currentParish={parishId:'p'};let allGifts=[];let manualAccountingGifts=[];function authHeaders(){return {'x-parish-session':'synthetic'};}function escapeHtml(v){const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML;}function shortDate(v){return v||'';}function money(v){return '$'+(Number(v||0)/100).toFixed(2);}`,
      });
      await page.addScriptTag({ content: source });
      await page.evaluate(() => loadCommemorations(document.getElementById('refresh')));
      assert.equal(await page.locator('.pdx-commemoration-card').count(), 2);
      assert.equal(await page.locator('img').count(), 0);
      assert.equal(await page.locator('.pdx-commemoration-names').first().textContent(), 'Living <name>');
      assert.match(await page.locator('#commemorationQueuePane').textContent(), /Molieben \/ Panikhida/);
      fail = true;
      await page.evaluate(() => loadCommemorations(document.getElementById('refresh')));
      assert.equal(await page.locator('#refresh').isEnabled(), true);
      assert.equal(await page.locator('img').count(), 0);
      assert.match(await page.locator('#commemorationQueuePane').textContent(), /unavailable/);
      fail = false;
      await page.evaluate(() => loadCommemorations());
      assert.equal(await page.locator('.pdx-commemoration-card').count(), 2);
      await page.evaluate(() => renderCommemorations({ entries: [] }));
      assert.match(await page.locator('#commemorationQueuePane').textContent(), /No commemoration names/);
      await page.evaluate(() => renderCommemorations({ entries: [{ living: 'invalid', departed: null }] }));
      assert.match(await page.locator('#commemorationQueuePane').textContent(), /no names were attached/);
      assert.deepEqual(
        await page.evaluate(() => [
          isCandleGift({ fund: 'Candles' }),
          isCandleGift({ memo: 'vigil' }),
          isCandleGift({ description: 'intention' }),
          isCandleGift({ fund: 'General' }),
        ]),
        [true, true, true, false]
      );
      await page.evaluate(() => renderCandleGiving());
      assert.match(await page.locator('#candleGivingPane').textContent(), /No candle gifts/);
      await page.evaluate(
        `(()=>{const now=new Date();const old=new Date(now.getFullYear(),now.getMonth()-7,15).toISOString();allGifts=[{fund:'Candles',date:now.toISOString(),parishNetCents:1000},{fund:'Vigil',date:old,amountCents:1000},{fund:'General',date:now.toISOString(),amountCents:99000},{fund:'Candles',date:'invalid',amountCents:99000}];manualAccountingGifts=[{memo:'intention',date:now.toISOString(),amountCents:500}];})()`
      );
      await page.evaluate(() => renderCandleGiving());
      assert.equal(await page.locator('.pdx-candle-row').count(), 6);
      assert.equal(await page.locator('.pdx-candle-summary-total').textContent(), '$15.00');
      assert.match(await page.locator('.pdx-delta').textContent(), /50% vs/);
      await page.waitForFunction(() =>
        [...document.querySelectorAll('.pdx-candle-bar-fill')].every((el) => el.style.width === el.dataset.fill + '%')
      );
      await page.evaluate('manualAccountingGifts=[]');
      await page.evaluate(() => renderCandleGiving());
      assert.match(await page.locator('.pdx-delta').textContent(), /Flat/);
      await page.evaluate('allGifts[0].parishNetCents=500');
      await page.evaluate(() => renderCandleGiving());
      assert.match(await page.locator('.pdx-delta.down').textContent(), /50%/);
      const before = requests;
      await page.evaluate('currentParish=null');
      await page.evaluate(() => loadCommemorations());
      assert.equal(requests, before);
      await page.locator('#commemorationQueuePane').evaluate((n) => n.remove());
      await page.locator('#candleGivingPane').evaluate((n) => n.remove());
      await page.evaluate(() => {
        renderCommemorations({});
        renderCandleGiving();
      });
      gate.assertClean();
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
console.log(
  'PASS commemoration desktop/mobile names, escaping, errors/retry, candle classification, shared gifts, date buckets and trends'
);
