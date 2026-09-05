import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Route every request locally: this test never submits a lead or sends real email.
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const submissions = [];
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'agapay.test') return route.fulfill({ status: 204, body: '' });
    if (url.pathname === '/api/contact') {
      submissions.push(route.request().postDataJSON());
      return route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
    }
    let path = url.pathname;
    if (path === '/') path = '/index.html';
    else if (path === '/give' || path === '/give/') path = '/give/index.html';
    else if (!path.split('/').at(-1).includes('.')) path += '.html';
    try {
      return route.fulfill({ body: await readFile(`public${path}`), contentType:
        path.endsWith('.js') ? 'text/javascript' : path.endsWith('.html') ? 'text/html' :
          path.endsWith('.css') ? 'text/css' : 'application/octet-stream' });
    } catch { return route.fulfill({ status: 404, body: '' }); }
  });
  const ready = () => page.waitForFunction(() => typeof window.getAgapayAttribution === 'function');
  const contact = async () => {
    await page.locator('[name=name]').fill('Test User');
    await page.locator('[name=email]').fill('test@example.com');
    await page.locator('[name=topic]').selectOption({ index: 1 });
    await page.locator('[name=message]').fill('Test message');
    const response = page.waitForResponse('**/api/contact');
    await page.locator('button[type=submit]').click();
    await response;
    await page.locator('#formStatus.visible').waitFor();
    assert.match(await page.locator('#formStatus').textContent(), /Message sent/);
  };
  await page.goto('https://agapay.test/give?utm_source=facebook&utm_medium=paid&utm_campaign=agapay-give');
  await ready();
  await page.evaluate(() => { location.href = '/about'; });
  await page.waitForURL('**/about');
  await ready();
  await page.evaluate(() => { location.href = '/give/request-demo'; });
  await page.waitForURL('**/give/request-demo');
  await ready();
  await page.locator('[name=name]').fill('Test User');
  await page.locator('[name=email]').fill('test@example.com');
  await page.locator('[name=parish]').fill('Test Parish');
  await page.locator('[name=role]').selectOption({ index: 1 });
  const demoResponse = page.waitForResponse('**/api/contact');
  await page.locator('button[type=submit]').click();
  await demoResponse;
  assert.equal(submissions[0].attribution.firstTouch.category, 'Meta / Paid');
  assert.equal(submissions[0].attribution.lastTouch.campaign, 'agapay-give');
  await page.goto('https://agapay.test/contact');
  await ready();
  await contact();
  assert.equal(submissions[1].attribution.firstTouch.category, 'Meta / Paid');
  assert.equal(submissions[1].attribution.lastTouch.category, 'Direct');
  await page.route('**/attribution.js', (route) => route.abort());
  await page.reload();
  await contact();
  assert.equal(submissions[2].attribution, null);
  console.log('PASS - Chromium demo navigation, direct return contact, and blocked tracking module submissions');
} finally { await browser.close(); }
