import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  let response = { status: 409, body: { error: 'A donor account already exists for this email. Please log in.' } };
  let requests = 0;
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'signup.test') return route.abort();
    if (url.pathname === '/api/donor/signup') {
      requests++;
      return route.fulfill({ status: response.status, json: response.body });
    }
    if (url.pathname.startsWith('/api/'))
      return route.fulfill({ json: url.pathname.includes('security') ? { enabled: false } : { parishes: [] } });
    const path = url.pathname === '/myagapay/signup' ? '/myagapay/signup.html' : url.pathname;
    try {
      const body = await readFile(resolve('public', '.' + path));
      return route.fulfill({
        body,
        contentType:
          { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' }[extname(path)] ||
          'application/octet-stream',
      });
    } catch {
      return route.fulfill({ status: 404, body: '' });
    }
  });
  await page.goto('https://signup.test/myagapay/signup');
  await page.locator('#signupSubmit').click();
  assert.match(await page.locator('#signupStatus').textContent(), /required fields/);
  for (const [id, value] of Object.entries({
    donorName: 'Synthetic Person',
    donorEmail: 'synthetic@example.test',
    donorPassword: 'synthetic-password',
    addressLine1: '1 Test St',
    city: 'Test',
    state: 'TX',
    postalCode: '79401',
    country: 'US',
  }))
    await page.locator('#' + id).fill(value);
  await page.locator('#agreeTerms').check();
  await page.locator('#signupSubmit').click();
  await page.waitForFunction(() => document.getElementById('signupAccountActions').hidden === false);
  assert.equal(requests, 1);
  assert.match(await page.locator('#signupStatus').textContent(), /already exists/);
  assert.equal(await page.locator('#signupAccountActions').isVisible(), true);
  assert.equal(await page.locator('#signupSubmit').isEnabled(), true);
  response = { status: 403, body: { error: 'Security check is required. Please refresh and try again.' } };
  await page.locator('#signupSubmit').click();
  await page.waitForFunction(() => document.getElementById('signupStatus').textContent.includes('security challenge'));
  assert.equal(await page.locator('#signupSubmit').isEnabled(), true);
  assert.equal(await page.locator('#signupAccountActions').isVisible(), false);
  response = { status: 200, body: { donor: { email: 'synthetic@example.test' } } };
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('Storage blocked');
    };
  });
  await page.locator('#signupSubmit').click();
  await page.waitForFunction(() => document.getElementById('signupStatus').textContent.includes('Account created'));
  assert.equal(await page.locator('#signupNextStep').isVisible(), true);
  console.log('PASS - mobile signup validation, duplicate account, blocked challenge, and blocked storage feedback');
} finally {
  await browser.close();
}
