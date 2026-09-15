import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const donor = { email: 'bookstore@example.test', donorName: 'Bookstore Member', defaultParishId: 'parish-a' };
const parishes = [
  { id: 'parish-a', name: 'Holy Trinity', city: 'Chicago', state: 'IL' },
  { id: 'parish-b', name: 'Saint Nicholas', city: 'Madison', state: 'WI' },
];
const product = (id, name, category, price, extra = {}) => ({
  id,
  variantId: `variant-${id}`,
  name,
  category,
  categoryLabel: category,
  description: 'Chosen with care by your parish.',
  priceCents: price,
  regularPriceCents: price,
  stockQuantity: 4,
  trackInventory: true,
  fulfillmentType: 'physical_pickup',
  ...extra,
});
let sale = true;
let activeParish = parishes[0];
const products = () => [
  product('book', 'Daily Prayers', 'book', sale ? 1800 : 2400, {
    regularPriceCents: 2400,
    onSale: sale,
    savingsPercent: 25,
    imageUrl: '/images/app/bookstore-still-life.png',
    unitsSold: 12,
  }),
  product('icon', 'Christ Pantocrator', 'icon', 3800),
  product('rope', 'Prayer Rope', 'prayer_rope', 1800),
  product('candle', 'Beeswax Candles', 'candle', 1600, { stockQuantity: 0 }),
];
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, serviceWorkers: 'block' });
  const checkout = [];
  const catalogParishes = [];
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'agapay.test') return route.fulfill({ status: 204, body: '' });
    if (url.pathname.startsWith('/api/')) {
      let payload = {};
      if (url.pathname === '/api/donor/dashboard') {
        if (route.request().method() === 'PATCH')
          activeParish = parishes.find((p) => p.id === route.request().postDataJSON().defaultParishId);
        payload = { donor: { ...donor, defaultParishId: activeParish.id }, parish: activeParish };
      }
      if (url.pathname.includes('/parishes')) payload = { parishes };
      if (url.pathname === '/api/donor/bookstore') {
        if (route.request().method() === 'POST') {
          checkout.push(route.request().postDataJSON());
          payload = { message: 'Checkout captured by test; no payment created.' };
        } else {
          const parishId = route.request().headers()['x-agapay-parish-id'];
          catalogParishes.push(parishId);
          payload = {
            available: true,
            products: parishId === 'parish-b' ? [product('b-book', 'Saint Nicholas Book', 'book', 1200)] : products(),
            orders: [],
          };
        }
      }
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
            : filename.endsWith('.png')
              ? 'image/png'
              : 'text/html',
      });
    } catch {
      return route.fulfill({ status: 404, body: '' });
    }
  });
  const page = await context.newPage();
  const assertCentered = async (selector) => {
    const bounds = await page.locator(selector).boundingBox();
    const viewport = page.viewportSize();
    assert.ok(bounds && Math.abs(bounds.x + bounds.width / 2 - viewport.width / 2) < 2, `${selector} horizontally centered`);
    assert.ok(Math.abs(bounds.y + bounds.height / 2 - viewport.height / 2) < 2, `${selector} vertically centered`);
  };
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.error(error.message);
  });
  await page.addInitScript(
    ({ donor }) => {
      localStorage.setItem('agapayDonorEmail', donor.email);
      localStorage.setItem('agapayDonorToken', 'test-session');
      localStorage.setItem('agapayDonorProfile', JSON.stringify(donor));
    },
    { donor }
  );
  await page.goto('https://agapay.test/myagapay/bookstore');
  const catalog = page.locator('#bookstoreProductCatalog');
  await mkdir('output', { recursive: true });
  await catalog.getByText('Daily Prayers', { exact: true }).waitFor();
  assert.equal(await catalog.locator('.bookstore-sale-ribbon').textContent(), 'Sale · 25% off');
  assert.equal(await catalog.locator('del').textContent(), '$24.00');
  assert.equal(await catalog.locator('.bookstore-price-sale strong').textContent(), '$18.00');
  assert.equal(await catalog.locator('.is-unavailable button.bookstore-product-add').isDisabled(), true);
  await page.screenshot({ path: 'output/bookstore-integrated-sale.png', fullPage: true });
  await page.locator('.bookstore-category-toggle').click();
  await assertCentered('#bookstoreCategoryDialog');
  await page.locator('#bookstoreCategoryFilters').getByRole('button', { name: /Sale/ }).click();
  assert.equal(await catalog.locator('article').count(), 1);
  await catalog.getByRole('button', { name: 'View details for Daily Prayers' }).click();
  const detail = page.locator('#bookstoreDetail');
  await assertCentered('#bookstoreDetail');
  assert.match(await detail.textContent(), /Sale · 25% off/);
  await detail.getByRole('button', { name: 'Add to your cart' }).click();
  assert.equal(await page.locator('#bookstoreBagCount').textContent(), '1');
  assert.equal(await page.locator('#bookstoreCartTotal').textContent(), '$18.00');
  await page.locator('#bookstorePickupNote').fill('After Sunday Liturgy');
  await page.locator('#bookstoreCoverFees').uncheck();
  await page.getByRole('button', { name: 'Checkout all items' }).click();
  await page.waitForFunction(() => document.querySelector('#donorStatus').textContent.includes('captured'));
  assert.equal(checkout[0].parishId, 'parish-a');
  assert.deepEqual(checkout[0].items, [{ productId: 'book', variantId: 'variant-book', quantity: 1 }]);
  assert.equal(checkout[0].coverFees, false);
  assert.equal(checkout[0].pickupNote, 'After Sunday Liturgy');
  await catalog.getByRole('button', { name: 'Save Daily Prayers' }).click();
  await page.locator('#bookstoreSavedToggle').click();
  assert.equal(await catalog.locator('article').count(), 1);
  await page.locator('#bookstoreSavedToggle').click();
  await page.locator('.bookstore-category-toggle').click();
  await page.locator('#bookstoreCategoryFilters').getByRole('button', { name: /^All / }).click();
  await page.locator('#bookstoreSort').selectOption('high');
  assert.match(await catalog.locator('article').first().textContent(), /Christ Pantocrator/);
  await page.locator('#bookstoreProductSearch').fill('rope');
  assert.equal(await catalog.locator('article').count(), 1);
  await page.locator('#bookstoreProductSearch').fill('');
  // End a sale in the backing fixture, then verify a fresh fetch removes the discount.
  sale = false;
  await page.reload();
  await catalog.getByText('Daily Prayers', { exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('#bookstoreProductCatalog .bookstore-sale-ribbon'));
  assert.equal(await catalog.locator('del').count(), 0);
  assert.equal(await page.locator('#bookstoreCategoryFilters').getByRole('button', { name: /Sale/ }).count(), 0);
  await mkdir('output', { recursive: true });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: 'output/bookstore-integrated-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await catalog.getByRole('button', { name: 'View details for Daily Prayers' }).click();
  await assertCentered('#bookstoreDetail');
  await detail.getByRole('button', { name: 'Add to your cart' }).click();
  await page.locator('#bookstoreMobileCartBar').click();
  assert.equal(await page.locator('#bookstoreCartPanel').evaluate((el) => el.inert), false);
  await page.getByRole('button', { name: 'Close cart', exact: true }).first().click();
  assert.equal(await page.locator('#bookstoreCartPanel').evaluate((el) => el.inert), true);
  await page.locator('#bookstoreParishTrigger').click();
  await page
    .locator('#bookstoreParishOptions')
    .getByRole('option', { name: /Saint Nicholas/ })
    .click();
  await catalog.getByText('Saint Nicholas Book', { exact: true }).waitFor();
  assert.equal(await page.locator('#bookstoreBagCount').textContent(), '0');
  assert.equal(await catalog.getByText('Daily Prayers', { exact: true }).count(), 0);
  assert.ok(catalogParishes.includes('parish-b'));
  await page.getByRole('button', { name: 'Orders', exact: true }).click();
  assert.equal(await page.locator('.bookstore-orders-card').isVisible(), true);
  assert.equal(await catalog.isVisible(), false);
  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await page.locator('.bookstore-manual-panel summary').click();
  await page.locator('#bookstoreCategory').selectOption('other');
  await page.locator('#bookstoreField_description').fill('Parish prayer booklet');
  await page.locator('#bookstorePrice').fill('8');
  await page.getByRole('button', { name: 'Add item to cart', exact: true }).click();
  assert.equal(await page.locator('#bookstoreBagCount').textContent(), '1');
  assert.equal(await page.locator('#bookstoreCartTotal').textContent(), '$8.00');
  await page.locator('.boutique-bag').click();
  assert.equal(await page.locator('#bookstoreCartPanel').evaluate((el) => el.inert), false);
  await page.getByRole('button', { name: 'Close cart', exact: true }).first().click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: 'output/bookstore-integrated-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    'PASS - integrated bookstore sale display, details, saved items, sorting, search, checkout payload, sale removal, mobile cart and parish isolation'
  );
} finally {
  await browser.close();
}
