import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const parish = {
    id: 'synthetic-parish',
    name: 'Synthetic Church',
    givingPlusEnabled: true,
    pledgeTrackerEnabled: true,
    liturgicalCalendar: 'julian',
    campaigns: [
      { id: 'roof', name: 'Church Roof Restoration', description: 'Preserve our church for generations to come.' },
    ],
    feastCampaigns: [{ id: 'nativity-christ', name: 'Nativity Alms' }],
    nextFestalOffering: {
      campaignId: 'nativity-christ',
      feastId: 'nativity-christ',
      name: 'Nativity Alms',
      feastDate: '2027-01-07',
      startsAt: '2026-11-28',
      endsAt: '2027-01-14',
    },
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
                  donor: {
                    email: 'synthetic@example.test',
                    donorName: 'Jamie',
                    defaultParishId: parish.id,
                    defaultParish: parish,
                    pledgeAmountCents: 600000,
                    pledgeCadence: 'annual',
                  },
                  summary: { monthCents: 25000, ytdCents: 250000 },
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
  const expectedSections = [
    'Quick Give',
    'Active Funds',
    'Active Campaigns',
    'Prayer & Remembrance',
    'Next Festal Offering',
  ];
  for (const [layout, width] of [
    ['.donor-phone', 390],
    ['#giving-dashboard', 1280],
  ]) {
    await page.setViewportSize({ width, height: 844 });
    const dashboard = page.locator(layout);
    await dashboard.getByRole('heading', { name: 'Nativity Alms' }).waitFor();
    assert.deepEqual(
      await dashboard.locator('.mobile-section-head h2, .desktop-panel-head h2').allTextContents(),
      expectedSections
    );
    assert.equal(await dashboard.locator('.giving-summary-head a').getAttribute('href'), '/myagapay/giving/history');
    assert.equal(
      await dashboard.getByRole('link', { name: 'Commemorations' }).getAttribute('href'),
      '/myagapay/sacraments#commemorations'
    );
    assert.match(await dashboard.locator('.next-feast-card').textContent(), /Nov 28, 2026 – Jan 14, 2027/);
    assert.equal(await dashboard.getByRole('img', { name: 'Nativity of Christ icon' }).isVisible(), true);
    assert.match(
      await dashboard.getByRole('link', { name: 'Offer', exact: true }).getAttribute('href'),
      /campaign=nativity-christ/
    );
    assert.equal(await dashboard.getByText('Give to the campaign', { exact: true }).isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await mkdir('output', { recursive: true });
    await page.screenshot({ path: `output/giving-redesign-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
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
