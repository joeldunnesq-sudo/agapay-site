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
    designatedFundsEnabled: true,
    funds: [
      { id: 'general', name: 'General Operating Fund' },
      ...['Choir', 'Education', 'Outreach'].map((name) => ({ id: name.toLowerCase(), name })),
      { id: 'building', name: 'Building Fund', description: 'Building needs' },
      { id: 'retired', name: 'Closed Fund', active: false },
    ],
  };
  await page.addInitScript(() => {
    localStorage.setItem('agapayDonorEmail', 'synthetic@example.test');
    localStorage.setItem('agapayDonorToken', 'synthetic-session');
    localStorage.setItem(
      'agapayDonorProfile',
      JSON.stringify({ email: 'synthetic@example.test', defaultParishId: 'synthetic-parish' })
    );
  });
  let checkoutFails = true;
  let challengeFails = false;
  const checkoutBodies = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'challenges.cloudflare.com') {
      if (challengeFails) return route.abort();
      return route.fulfill({
        contentType: 'application/javascript',
        body: `window.turnstile = {render(target, options) { const button = document.createElement('button'); button.type='button'; button.textContent='Verify you are human'; button.onclick=()=>options.callback('synthetic-verified-token'); target.append(button); }, reset() { window.agapayTurnstileToken=''; }};`,
      });
    }
    if (url.hostname !== 'fund.test')
      return route.fulfill({
        body: '',
        contentType: url.hostname.includes('fonts') ? 'text/css' : 'application/javascript',
      });
    if (url.pathname === '/api/create-checkout-session') {
      checkoutBodies.push(route.request().postDataJSON());
      return route.fulfill({
        status: checkoutFails ? 403 : 200,
        json: checkoutFails
          ? { error: 'Security check is required. Please refresh and try again.' }
          : { url: 'https://fund.test/synthetic-checkout' },
      });
    }
    if (url.pathname === '/synthetic-checkout')
      return route.fulfill({ contentType: 'text/html', body: '<h1>Synthetic Stripe destination</h1>' });
    if (url.pathname.startsWith('/api/'))
      return route.fulfill({
        json:
          url.pathname === '/api/parishes'
            ? { parishes: [parish] }
            : url.pathname === '/api/donor/dashboard'
              ? {
                  parish,
                  donor: { email: 'synthetic@example.test', defaultParishId: parish.id, defaultParish: parish },
                }
              : url.pathname === '/api/security/config'
                ? { turnstileEnabled: true, turnstileSiteKey: 'synthetic-key' }
                : {},
      });
    const path =
      url.pathname === '/myagapay/giving/give'
        ? '/myagapay/giving/give.html'
        : url.pathname === '/myagapay/giving'
          ? '/myagapay/index.html'
          : url.pathname;
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
  await page.goto('https://fund.test/myagapay/giving');
  const fundList = page.locator('#activeFunds');
  const link = fundList.getByRole('link', { name: 'Give to Building Fund' });
  await link.waitFor();
  assert.equal(await fundList.getByText('Closed Fund').count(), 0);
  assert.equal(await fundList.locator('.active-funds-card').count(), 5);
  assert.match(await link.getAttribute('href'), /quick=1/);
  assert.match(await link.getAttribute('href'), /fund=building/);
  assert.equal(await link.getByText('Building needs', { exact: true }).isVisible(), false);
  assert.equal(
    await link.evaluate((row) => Math.round(row.getBoundingClientRect().width)),
    await fundList.evaluate((list) => list.clientWidth - 34)
  );
  await link.getByText('Building Fund', { exact: true }).click();
  await page.waitForFunction(() => document.body.classList.contains('quick-give-mode'));
  assert.equal(await page.locator('#fund').inputValue(), 'building');
  assert.equal(await page.locator('#fundFields').isVisible(), false);
  assert.match(await page.locator('#quickGiveContext').textContent(), /Building Fund/);
  assert.equal(await page.locator('#amount').isVisible(), true);
  const checkout = page.getByRole('button', { name: 'Continue to AGAPAY checkout', exact: true });
  await checkout.click();
  await page.getByText('Complete “Verify you are human” above. Your checkout will continue automatically.').waitFor();
  assert.equal(checkoutBodies.length, 0, 'checkout must wait for verification instead of posting an empty token');
  await page.getByRole('button', { name: 'Verify you are human', exact: true }).click();
  await page.locator('#donorCheckoutStatus').filter({ hasText: 'security challenge' }).waitFor();
  assert.equal(await checkout.isEnabled(), true);
  assert.equal(checkoutBodies[0].giftType, 'fund');
  assert.equal(checkoutBodies[0].fundId, 'building');
  assert.equal(checkoutBodies[0].parishId, 'synthetic-parish');
  assert.equal(await page.locator('#donorCheckoutStatus').isVisible(), true);
  checkoutFails = false;
  await checkout.click();
  await page.getByRole('button', { name: 'Verify you are human', exact: true }).click();
  await page.waitForURL('https://fund.test/synthetic-checkout');
  assert.equal(checkoutBodies.length, 2);
  assert.equal(checkoutBodies[1].turnstileToken, 'synthetic-verified-token');
  assert.equal(checkoutBodies[1].fundId, 'building');
  challengeFails = true;
  await page.goto('https://fund.test/myagapay/giving/give?parish=synthetic-parish&giftType=stewardship&quick=1');
  await page.getByText('The security check could not load.', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Continue to AGAPAY checkout', exact: true }).click();
  await page.locator('#donorCheckoutStatus').filter({ hasText: 'security challenge' }).waitFor();
  assert.equal(checkoutBodies.length, 2, 'blocked challenge must not send a checkout request');
  assert.deepEqual(errors, []);
  console.log(
    'PASS - designated fund Donate opens the donation form with its fund selected and no repeated fund picker'
  );
} finally {
  await browser.close();
}
