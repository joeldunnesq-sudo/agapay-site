import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const parish = {
    id: 'synthetic-parish',
    name: 'Synthetic Church',
    givingPlusEnabled: true,
    funds: [{ id: 'building', name: 'Building Fund', description: 'Building needs' }],
  };
  await page.addInitScript(() => {
    localStorage.setItem('agapayDonorEmail', 'synthetic@example.test');
    localStorage.setItem('agapayDonorToken', 'synthetic-session');
    localStorage.setItem(
      'agapayDonorProfile',
      JSON.stringify({ email: 'synthetic@example.test', defaultParishId: 'synthetic-parish' })
    );
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'fund.test')
      return route.fulfill({
        body: '',
        contentType: url.hostname.includes('fonts') ? 'text/css' : 'application/javascript',
      });
    if (url.pathname.startsWith('/api/'))
      return route.fulfill({ json: url.pathname === '/api/parishes' ? { parishes: [parish] } : {} });
    const path = url.pathname === '/myagapay/giving/give' ? '/myagapay/giving/give.html' : url.pathname;
    try {
      return route.fulfill({
        body: await readFile(resolve('public', '.' + path)),
        contentType:
          { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' }[extname(path)] ||
          'application/octet-stream',
      });
    } catch {
      return route.fulfill({ status: 404, body: '' });
    }
  });
  await page.goto('https://fund.test/myagapay/giving/give?parish=synthetic-parish');
  await page.waitForFunction(() => document.getElementById('parish').value === 'synthetic-parish');
  await page.evaluate((parish) => renderActiveFunds(parish, { confirmed: true }), parish);
  const link = page.locator('.active-funds-card a').filter({ hasText: 'Donate' }).first();
  assert.match(await link.getAttribute('href'), /quick=1/);
  assert.match(await link.getAttribute('href'), /fund=building/);
  await link.click();
  await page.waitForFunction(() => document.body.classList.contains('quick-give-mode'));
  assert.equal(await page.locator('#fund').inputValue(), 'building');
  assert.equal(await page.locator('#fundFields').isVisible(), false);
  assert.match(await page.locator('#quickGiveContext').textContent(), /Building Fund/);
  assert.equal(await page.locator('#amount').isVisible(), true);
  assert.deepEqual(errors, []);
  console.log(
    'PASS - designated fund Donate opens the donation form with its fund selected and no repeated fund picker'
  );
} finally {
  await browser.close();
}
