import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { captureBrowserErrors } from './lib/browser-error-gate.mjs';
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    const errors = captureBrowserErrors(page);
    const apiRequests = [];
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'concept.test') return route.fulfill({ status: 200, body: '', contentType: 'text/css' });
      if (url.pathname.startsWith('/api/')) {
        apiRequests.push(url.pathname);
        return route.abort();
      }
      const resource = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
      const file = path.resolve('public', '.' + resource);
      assert.ok(file.startsWith(path.resolve('public') + path.sep));
      const body = await readFile(file);
      const ext = path.extname(file);
      return route.fulfill({
        status: 200,
        body,
        contentType:
          {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.png': 'image/png',
            '.ico': 'image/x-icon',
          }[ext] || 'application/octet-stream',
      });
    });
    await page.goto('https://concept.test/myagapay/bookstore-concept/');
    await page.waitForSelector('.product-card');
    assert.equal(await page.locator('.product-card').count(), 4);
    await page.locator('#search').fill('prayer rope');
    assert.equal(await page.locator('.product-card').count(), 1);
    assert.match(await page.locator('.product-title').textContent(), /Prayer Rope/);
    await page.locator('#search').fill('');
    await page.locator('[data-category="Icons"]').click();
    assert.equal(await page.locator('.product-card').count(), 1);
    await page.locator('[data-save="2"]').click();
    await page.locator('#saved-button').click();
    assert.equal(await page.locator('.product-card').count(), 1);
    await page.locator('.product-image').click();
    assert.equal(await page.locator('#product-dialog').evaluate((e) => e.open), true);
    await page.locator('#product-dialog [data-close]').click();
    await page.locator('[data-add="2"]').first().click();
    assert.equal(await page.locator('#bag-count').textContent(), '1');
    await page.locator('#bag-button').click();
    await page.locator('#checkout-preview').click();
    assert.match(await page.locator('#bag-summary').textContent(), /Preview only.*no order has been placed/);
    assert.deepEqual(apiRequests, []);
    errors.assertClean();
    await page.close();
  }
  console.log(
    'PASS - preserved Bookstore design concept works on desktop/mobile with typed controls, saved items, details and preview-only bag'
  );
} finally {
  await browser.close();
}
