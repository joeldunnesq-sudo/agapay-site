import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { captureBrowserErrors } from './lib/browser-error-gate.mjs';
/* global loadRecurringHealth, renderRecurringHealth, currentParish: writable */
const source = await readFile(new URL('../public/parish/features/giving/recurring.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await context.newPage();
    const gate = captureBrowserErrors(page);
    let response = {
      status: 200,
      body: JSON.stringify({
        health: { activeCount: 3, failedThisMonthCount: 1, lapsedCount: 2, monthlyRecurringCents: 12500 },
      }),
    };
    let release;
    let hold = false;
    const requests = [];
    await context.route('**/*', async (route) => {
      if (route.request().url() === 'https://recurring.test/')
        return route.fulfill({
          contentType: 'text/html',
          body: '<button id="refresh" onclick="loadRecurringHealth(this)">Refresh</button><div id="pdxKpiRecurring"></div><div id="pdxKpiRecurringMeta"></div><div id="recurringHealthPane"></div>',
        });
      requests.push({ url: route.request().url(), headers: route.request().headers() });
      if (hold)
        await new Promise((resolve) => {
          release = resolve;
        });
      await route.fulfill({ status: response.status, contentType: 'application/json', body: response.body });
    });
    try {
      await page.goto('https://recurring.test/');
      await page.addScriptTag({
        content: `let currentParish = null;
function authHeaders() { return {'x-parish-session': 'synthetic-session'}; }
function escapeHtml(value) { return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function money(cents) { return '$' + Number(cents) / 100; }
function pdxAnimateCount(element, value) { element.textContent = value; }
`,
      });
      await page.addScriptTag({ content: source });
      await page.evaluate(() => loadRecurringHealth(document.querySelector('#refresh')));
      assert.equal(requests.length, 0, 'unloaded parish does not request health');
      await page.evaluate(() => {
        currentParish = { parishId: 'parish / one' };
      });
      assert.equal(await page.evaluate(() => currentParish.parishId), 'parish / one');
      hold = true;
      await page.locator('#refresh').click();
      await page.waitForFunction(() => document.querySelector('#refresh').disabled);
      assert.match(await page.locator('#recurringHealthPane').textContent(), /Checking recurring/);
      await page.waitForFunction(() => document.querySelector('#refresh').classList.contains('loading'));
      for (let attempt = 0; !release && attempt < 500; attempt++)
        await new Promise((resolve) => setTimeout(resolve, 10));
      assert.ok(release, 'request reached the paused route');
      hold = false;
      release();
      await page.waitForFunction(() => !document.querySelector('#refresh').disabled);
      assert.equal(requests[0].url, 'https://recurring.test/api/parish/dashboard/parish%20%2F%20one/recurring-health');
      assert.equal(requests[0].headers['x-parish-session'], 'synthetic-session');
      assert.equal(await page.locator('.pdx-donut-num').textContent(), '6');
      assert.equal(await page.locator('#pdxKpiRecurring').textContent(), '3');
      assert.match(await page.locator('#pdxKpiRecurringMeta').textContent(), /3need attention/);
      assert.match(await page.locator('.pdx-legend-note').textContent(), /Expected monthly: \$125/);
      await page.waitForFunction(
        () => Number.parseFloat(document.querySelector('[data-arc="lapsed"]').style.strokeDashoffset) < 0
      );
      const offsets = await page
        .locator('[data-arc]')
        .evaluateAll((nodes) => nodes.map((n) => n.style.strokeDashoffset));
      assert.ok(Math.abs(Number.parseFloat(offsets[1]) + 2 * Math.PI * 70 * 0.5) < 0.001);
      assert.ok(Math.abs(Number.parseFloat(offsets[2]) + 2 * Math.PI * 70 * (0.5 + 2 / 6)) < 0.001);
      response = {
        status: 503,
        body: JSON.stringify({ detail: '<img src=x onerror=alert(1)> unavailable', error: 'ignored' }),
      };
      await page.evaluate(() => loadRecurringHealth(document.querySelector('#refresh')));
      assert.equal(await page.locator('#recurringHealthPane img').count(), 0);
      assert.equal(
        await page.locator('#recurringHealthPane').textContent(),
        '<img src=x onerror=alert(1)> unavailable'
      );
      assert.equal(await page.locator('#refresh').isEnabled(), true);
      assert.equal(await page.locator('#refresh').getAttribute('class'), '');
      response = { status: 200, body: '{' };
      await page.evaluate(() => loadRecurringHealth(document.querySelector('#refresh')));
      assert.ok((await page.locator('#recurringHealthPane').textContent()).length > 0);
      assert.equal(await page.locator('#refresh').isEnabled(), true);
      response = { status: 200, body: '{}' };
      await page.evaluate(() => loadRecurringHealth(document.querySelector('#refresh')));
      assert.match(await page.locator('#recurringHealthPane').textContent(), /No recurring gifts yet/);
      assert.match(await page.locator('#pdxKpiRecurringMeta').textContent(), /healthy/);
      await page.evaluate(() => renderRecurringHealth({ activeCount: '2', monthlyRecurringCents: '5000' }));
      assert.equal(await page.locator('.pdx-donut-num').textContent(), '2');
      assert.match(await page.locator('.pdx-legend-note').textContent(), /All recurring gifts are healthy/);
      await page.evaluate(() => document.querySelector('#recurringHealthPane').remove());
      const before = requests.length;
      await page.evaluate(() => loadRecurringHealth(document.querySelector('#refresh')));
      assert.equal(requests.length, before, 'missing pane does not fetch');
      assert.equal(await page.locator('#refresh').isEnabled(), true);
      gate.assertClean();
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
console.log(
  'PASS - recurring classic globals, scoped request, loading, chart styles, escaped errors, retry, empty and missing DOM at desktop/mobile widths'
);
