import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
import { openParishFixture, parish } from './lib/parish-browser-fixture.mjs';

const browser = await chromium.launch({ headless: true });
const publicRoot = resolve('public');
const campaign = { id: 'roof', slug: 'roof', name: 'Restore our church', description: 'A home for prayer. Help restore our parish roof.', status: 'active', goalCents: 10000000, raisedCents: 6500000, giftCount: 42, photos: [], updates: [] };
let payload;
try {
  const context = await browser.newContext();
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'parish-website.test') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Our parish campaign</title><style>body{margin:0;font:16px system-ui}main{max-width:1140px;margin:auto}.intro{padding:24px}iframe{max-width:100%}</style><main><div class="intro"><h1>Help restore our parish</h1><p>Join our community in caring for the church we call home.</p></div><div class="elementor-widget-html"><div class="elementor-widget-container" id="widget"></div></div></main>' });
    if (url.hostname === 'checkout.stripe.com') return route.fulfill({ contentType: 'text/html', body: '<h1>Synthetic secure checkout</h1>' });
    if (url.hostname !== 'agapay.test') return route.fulfill({ body: '', contentType: 'text/css' });
    if (url.pathname === '/security.js') return route.fulfill({ body: '', contentType: 'text/javascript' });
    if (url.pathname === '/api/campaign') return route.fulfill({ json: { campaign, parish: { id: 'test', name: 'St. Andrew Orthodox Church', city: 'Chicago', state: 'IL' } } });
    if (url.pathname === '/api/create-checkout-session') { payload = route.request().postDataJSON(); return route.fulfill({ json: { url: 'https://checkout.stripe.com/c/pay/synthetic' } }); }
    const pathname = url.pathname.startsWith('/give/campaign-embed/') || /-campaign$/.test(url.pathname) ? '/give/parish-giving/index.html' : url.pathname;
    const file = resolve(publicRoot, '.' + pathname); assert.ok(file.startsWith(publicRoot));
    const contentType = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[extname(file)] || 'application/octet-stream';
    return route.fulfill({ contentType, body: await readFile(file) });
  });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('https://parish-website.test/restore-our-church');
  await page.addScriptTag({ url: 'https://agapay.test/campaign-box.js' });
  // Elementor inserts and replaces widget markup after initial page load.
  await page.evaluate(() => { document.getElementById('widget').innerHTML = '<div data-agapay-campaign="roof" data-parish="test" data-primary="#733c43" data-background="#faf7f0"></div>'; });
  const frame = page.frameLocator('#widget iframe');
  await frame.locator('#campaignContent').waitFor({ state: 'visible' });
  assert.equal(await frame.locator('.agapay-campaign-brand').count(), 0);
  assert.equal(await frame.locator('.campaign-footer strong').textContent(), 'AGAPAY');
  assert.equal(await frame.locator('.campaign-footer img').isVisible(), true);
  assert.match(await frame.locator('#shareFacebook').getAttribute('href'), /parish-website.test%2Frestore-our-church/);
  assert.equal(await frame.locator('#giveBtn').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(115, 60, 67)');
  await page.waitForFunction(() => parseInt(document.querySelector('#widget iframe').style.height) > 1100);
  const height = await page.locator('#widget iframe').evaluate(node => node.style.height);
  await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { origin: 'https://malicious.test', data: { type: 'agapay:campaign-resize', height: 9999 } })));
  assert.equal(await page.locator('#widget iframe').evaluate(node => node.style.height), height);
  await page.addScriptTag({ url: 'https://agapay.test/campaign-box.js' });
  assert.equal(await page.locator('#widget iframe').count(), 1, 'repeated loader is idempotent');
  await page.evaluate(() => { const widget = document.getElementById('widget'); widget.replaceChildren(widget.firstElementChild.cloneNode(true)); });
  await frame.locator('#campaignContent').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#widget iframe').count(), 1, 'cloned Elementor widgets mount once');
  await page.evaluate(() => { const other = document.createElement('div'); other.innerHTML = '<div id="second" data-agapay-campaign="roof" data-parish="test" data-primary="#124633"></div>'; document.querySelector('main').append(other); });
  await page.frameLocator('#second iframe').locator('#campaignContent').waitFor({ state: 'visible' });
  assert.equal(await page.frameLocator('#second iframe').locator('#giveBtn').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(18, 70, 51)');
  await frame.locator('#campaignFirstName').fill('Test'); await frame.locator('#campaignEmail').fill('test@example.test');
  const popupEvent = page.waitForEvent('popup'); await frame.locator('#giveBtn').click();
  const popup = await popupEvent; await popup.waitForURL('https://checkout.stripe.com/**');
  assert.equal(payload.giftType, 'campaign'); assert.equal(payload.campaign, 'roof'); assert.equal(payload.parishId, 'test');
  assert.equal(payload.returnPath, '/give/test/roof-campaign');
  assert.equal(page.url(), 'https://parish-website.test/restore-our-church'); await popup.close();
  await frame.locator('body').evaluate(() => { window.open = () => null; });
  await frame.locator('#giveBtn').click();
  await frame.locator('#campaignCheckoutStatus a').waitFor({ state: 'visible' });
  assert.equal(await frame.locator('#campaignCheckoutStatus a').getAttribute('target'), '_blank');
  assert.equal(await frame.locator('#campaignCheckoutStatus a').getAttribute('href'), 'https://checkout.stripe.com/c/pay/synthetic');
  await page.locator('#second').evaluate(node => node.remove());
  await mkdir('artifacts/campaign-embed', { recursive: true });
  async function settledHeight() {
    for (let attempt = 0; attempt < 40; attempt++) {
      const contentHeight = await frame.locator('body').evaluate(node => Math.ceil(node.getBoundingClientRect().height));
      const frameHeight = await page.locator('#widget iframe').evaluate(node => node.clientHeight);
      if (Math.abs(frameHeight - contentHeight) <= 2) return;
      await page.waitForTimeout(50);
    }
    throw new Error('Campaign iframe did not resize to show its complete content');
  }
  await settledHeight();
  await page.screenshot({ path: 'artifacts/campaign-embed/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await settledHeight();
  await page.screenshot({ path: 'artifacts/campaign-embed/mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await frame.locator('body').evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);

  const fixture = await openParishFixture(browser, () => ({ parish: { ...parish, subscriptionTier: 'giving', campaigns: [campaign], onboarding: { enabled: true, state: 'LIVE' } } }));
  try {
    await fixture.open(); await fixture.page.waitForFunction(() => document.body.classList.contains('dashboard-ready'));
    await fixture.page.locator('#nav-campaigns').click(); await fixture.page.locator('[data-campaign-embed="roof"]').click();
    await fixture.page.locator('#campaignEmbedPage').fill('https://parish-website.test/restore-our-church');
    // Preview response is intentionally local; public embed behavior is tested above.
    await fixture.page.route('**/give/campaign-embed/**', route => route.fulfill({ body: '<h1>Campaign preview</h1>', contentType: 'text/html' }));
    await fixture.page.locator('#campaignEmbedIntro').fill('Parish <script>alert(1)</script> story');
    await fixture.page.locator('[data-preview]').click();
    const code = await fixture.page.locator('#campaignEmbedCode').inputValue();
    assert.match(code, /<h2>Restore our church<\/h2>/); assert.match(code, /&lt;script&gt;/); assert.match(code, /<iframe /); assert.match(code, /campaign-box.js/);
    const pasted = await context.newPage();
    await pasted.goto('https://parish-website.test/restore-our-church');
    // WordPress stripping the script still leaves the native introduction and iframe.
    await pasted.evaluate(snippet => { document.getElementById('widget').innerHTML = snippet; }, code.replaceAll('https://parish.test', 'https://agapay.test'));
    await pasted.frameLocator('#widget iframe').locator('#campaignContent').waitFor({ state: 'visible' });
    assert.equal(await pasted.locator('#widget h2').textContent(), campaign.name);
    assert.match(await pasted.locator('#widget p').first().textContent(), /<script>alert\(1\)<\/script>/);
    assert.equal(await pasted.locator('#widget iframe').getAttribute('height'), '1400');
    await pasted.addScriptTag({ url: 'https://agapay.test/campaign-box.js' });
    await pasted.frameLocator('#widget iframe').locator('#campaignContent').waitFor({ state: 'visible' });
    assert.equal(await pasted.locator('#widget iframe').count(), 1);
    await pasted.close();
    await fixture.page.locator('#campaignEmbedPage').fill('javascript:alert(1)'); await fixture.page.locator('[data-preview]').click();
    assert.equal(await fixture.page.locator('#campaignEmbedCode').inputValue(), '');
    fixture.assertClean();
  } finally { await fixture.close(); }
  await context.close();
  console.log('PASS - Elementor dynamic insertion, cloned widgets, repeated loaders, isolated themes, native intro, mobile branding, sharing, and campaign checkout');
} finally { await browser.close(); }
