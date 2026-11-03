import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
let requests = [];
try {
  const page = await browser.newPage({ serviceWorkers: 'block' });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'demo.test') return route.fulfill({ body: '' });
    if (url.pathname === '/api/campaign')
      return route.fulfill({
        json: {
          campaign: { id: 'fixture', slug: 'building', name: 'Building Fund', status: 'active' },
          parish: { parishId: 'test', name: 'Test Parish' },
        },
      });
    if (url.pathname === '/api/create-checkout-session') {
      requests.push(route.request().postDataJSON());
      return route.fulfill({ status: 400, json: { detail: 'Mock checkout stopped before payment' } });
    }
    try {
      const p =
        url.pathname === '/give/test/building-campaign'
          ? 'public/give/parish-giving/index.html'
          : path.join('public', url.pathname);
      return route.fulfill({
        body: await readFile(p),
        contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : 'text/html',
      });
    } catch {
      return route.fulfill({ status: 404, body: '' });
    }
  });
  await page.goto('https://demo.test/give/test/building-campaign');
  await page.locator('#campaignCheckoutForm').waitFor({ state: 'visible' });
  await page.locator('#campaignFirstName').fill('Fixture');
  await page.locator('#campaignEmail').fill('fixture@example.test');
  for (const checked of [true, false]) {
    await page.locator('#campaignCoverFees').setChecked(checked);
    const response = page.waitForResponse((r) => r.url().includes('/api/create-checkout-session'));
    await page.locator('#giveBtn').click();
    await response;
    await page.locator('#giveBtn').waitFor({ state: 'visible' });
    assert.equal(requests.at(-1).coverFees, checked);
    assert.equal(await page.locator('#feeTaxNote').isVisible(), true);
  }
  console.log('PASS - campaign checkout sends donor fee opt-in and opt-out correctly; all requests mocked');
} finally {
  await browser.close();
}
