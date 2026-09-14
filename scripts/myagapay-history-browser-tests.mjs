import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { captureBrowserErrors } from './lib/browser-error-gate.mjs';

const donor = { email: 'history@example.test', donorName: 'History Member', defaultParishId: 'test-parish' };
const orders = [
  {
    itemCategory: 'book',
    itemDescription: 'Prayer book <special>',
    status: 'completed',
    totalChargedCents: 1250,
    quantity: 1,
    createdAt: '2026-09-11T12:00:00Z',
  },
];
const offerings = [
  {
    fund: 'Parish support',
    parishId: 'test-parish',
    amountCents: 2500,
    paymentStatus: 'paid',
    frequency: 'once',
    createdAt: '2025-08-01T12:00:00Z',
  },
];
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, serviceWorkers: 'block' });
  let offline = false;
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'agapay.test') return route.fulfill({ status: 204, body: '' });
    if (url.pathname.startsWith('/api/')) {
      if (offline) return route.abort();
      let payload = {};
      if (url.pathname === '/api/donor/dashboard')
        payload = { donor, parish: { id: 'test-parish', name: 'Test Parish' } };
      if (url.pathname === '/api/donor/offerings') payload = { offerings };
      if (url.pathname === '/api/donor/bookstore') payload = { orders };
      return route.fulfill({ json: payload });
    }
    let filename = url.pathname;
    if (!filename.split('/').at(-1).includes('.')) filename += '.html';
    try {
      return route.fulfill({
        body: await readFile(new URL(`../public${filename}`, import.meta.url)),
        contentType: filename.endsWith('.js')
          ? 'text/javascript'
          : filename.endsWith('.css')
            ? 'text/css'
            : 'text/html',
      });
    } catch {
      return route.fulfill({ status: 404, body: '' });
    }
  });
  const page = await context.newPage();
  const errors = captureBrowserErrors(page);
  await page.addInitScript(
    ({ donor }) => {
      localStorage.setItem('agapayDonorEmail', donor.email);
      localStorage.setItem('agapayDonorToken', 'test-session');
      if (!localStorage.getItem('agapayDonorProfile'))
        localStorage.setItem('agapayDonorProfile', JSON.stringify(donor));
    },
    { donor }
  );
  await page.goto('https://agapay.test/myagapay/giving/history');
  await page.waitForFunction(() =>
    ['Live data', 'Unavailable'].includes(document.getElementById('offeringsStatus')?.textContent)
  );
  assert.equal(
    await page.locator('#offeringsStatus').textContent(),
    'Live data',
    await page.locator('#agapayHistoryTimeline').textContent()
  );
  assert.equal(await page.locator('.history-activity-row').count(), 2);
  const book = page.locator('.history-product-bookstore');
  assert.match(await book.textContent(), /Prayer book <special>/);
  assert.match(await book.textContent(), /\$12\.50/);
  assert.match(await book.textContent(), /Paid/);
  assert.equal(await book.locator('special').count(), 0, 'Order titles remain escaped');
  await page.locator('[data-history-filter="bookstore"]').click();
  assert.equal(await page.locator('.history-activity-row').count(), 1);
  await page.locator('#historyPeriodFilter').selectOption('2025');
  assert.equal(await page.locator('.history-activity-row').count(), 0);
  await page.locator('[data-history-filter="all"]').click();
  assert.equal(await page.locator('.history-activity-row').count(), 1);
  assert.match(await page.locator('#agapayHistoryTimeline').textContent(), /Parish support/);
  assert.equal(errors.errors.length, 0, JSON.stringify(errors.errors));
  offline = true;
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('.history-activity-row').length === 2);
  assert.match(await page.locator('#agapayHistoryTimeline').textContent(), /Prayer book <special>/);
  // Simulate changing parish after visiting its Bookstore, while history's old
  // unscoped cache still contains a purchase from the previous parish.
  await page.evaluate(() => {
    const profile = JSON.parse(localStorage.getItem('agapayDonorProfile'));
    profile.defaultParishId = 'second-parish';
    localStorage.setItem('agapayDonorProfile', JSON.stringify(profile));
    writeDonorCache('bookstore', {
      orders: [{ itemDescription: 'Legacy wrong parish purchase', createdAt: '2026-09-10' }],
    });
    writeDonorCache('bookstore:second-parish', {
      orders: [{ itemDescription: 'Second parish purchase', createdAt: '2026-09-12' }],
    });
  });
  await page.reload();
  await page.waitForFunction(() =>
    document.querySelector('#agapayHistoryTimeline')?.textContent.includes('Second parish purchase')
  );
  assert.doesNotMatch(await page.locator('#agapayHistoryTimeline').textContent(), /Legacy wrong parish|Prayer book/);
  await page.evaluate(() => {
    const profile = JSON.parse(localStorage.getItem('agapayDonorProfile'));
    profile.defaultParishId = '';
    localStorage.setItem('agapayDonorProfile', JSON.stringify(profile));
  });
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#offeringsStatus')?.textContent === 'Live data');
  assert.equal(
    await page.locator('.history-product-bookstore').count(),
    0,
    'No parish must not reuse another parish cache'
  );
  errors.assertClean();
  console.log(
    'PASS - History renders Bookstore purchases, escapes titles, filters by product/year, and restores cached activity'
  );
} finally {
  await browser.close();
}
