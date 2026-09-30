import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
try {
  const adminPage = readFileSync('public/admin.html', 'utf8');
  assert.match(adminPage, /id="contactLeadsCard"/);
  assert.match(adminPage, /src="\/admin\/controllers\/contact-leads.js\?v=[a-f0-9]+"/);
  const page = await browser.newPage();
  let retried = false;
  let scenario = 'retry';
  const requests = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const lead = {
    id: 'test-lead',
    name: '<img src=x onerror="window.injected=true">',
    email: 'test@example.com',
    message: '<script>window.injected=true</script>',
    topic: 'Question',
    attempts: 1,
    notificationStatus: 'failed',
    retryAvailable: true,
  };
  await page.route('https://admin.test/**', (route) => {
    if (route.request().url().includes('/api/admin/contact-leads')) {
      const request = route.request();
      const url = new URL(request.url());
      requests.push({
        path: url.pathname,
        before: url.searchParams.get('before'),
        method: request.method(),
        headers: request.headers(),
        body: request.postDataJSON(),
      });
      const json = (body, status = 200) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (scenario === 'load-error') return json({ error: 'Session expired.' }, 401);
      if (scenario === 'empty') return json({ leads: [], nextCursor: null });
      if (scenario === 'pages')
        return json({
          leads: [
            { ...lead, id: url.search ? 'page-two' : 'page-one', notificationStatus: 'sent', retryAvailable: false },
          ],
          nextCursor: url.search ? null : '2026-09-30|lead /?&',
        });
      if (scenario === 'review' || scenario === 'review-error') {
        if (request.method() === 'POST')
          return scenario === 'review-error' ? json({ error: 'Review changed; refresh.' }, 409) : json({ ok: true });
        return json({
          leads: [
            {
              ...lead,
              id: 'review /?&',
              generation: 4,
              attempts: 3,
              notificationStatus: 'legacy_unknown',
              retryAvailable: false,
              reviewRequired: true,
            },
          ],
          nextCursor: null,
        });
      }
      if (scenario === 'retry-error' && request.method() === 'POST') return json({ error: 'Retry unavailable.' }, 409);
      if (route.request().method() === 'POST') {
        retried = true;
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, lead: { ...lead, notificationStatus: 'sent' } }),
        });
      }
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          leads: [{ ...lead, notificationStatus: retried ? 'sent' : 'failed', retryAvailable: !retried }],
          nextCursor: null,
        }),
      });
    }
    return route.fulfill({
      contentType: 'text/html',
      body: adminPage.match(/<section class="section-card" id="contactLeadsCard"[\s\S]*?<\/section>/)[0],
    });
  });
  await page.goto('https://admin.test');
  await page.addScriptTag({
    content: "function authHeaders(extra = {}) { return { Authorization: 'Bearer test', ...extra }; }",
  });
  await page.addScriptTag({ content: readFileSync('public/admin/controllers/contact-leads.js', 'utf8') });
  await page.evaluate(() => loadContactLeads());
  assert.equal(await page.locator('#contactLeads img, #contactLeads script').count(), 0);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  await page.locator('summary').click();
  await page.getByRole('button', { name: 'Retry notification' }).click();
  await page.waitForFunction(() =>
    document.getElementById('contactLeadsStatus').textContent.includes('Notification sent')
  );
  assert.ok(retried);
  assert.equal(await page.getByRole('button', { name: 'Retry notification' }).count(), 0);
  scenario = 'pages';
  await page.evaluate(() => loadContactLeads());
  assert.equal(await page.locator('#contactLeadsMore').isVisible(), true);
  await page.evaluate(() => loadContactLeads(true));
  assert.equal(requests.at(-1).before, '2026-09-30|lead /?&');
  assert.equal(await page.locator('#contactLeads details').count(), 2);
  assert.equal(await page.locator('#contactLeadsMore').isVisible(), false);
  scenario = 'load-error';
  await page.evaluate(() => loadContactLeads());
  assert.equal(await page.locator('#contactLeadsStatus').textContent(), 'Session expired.');
  assert.equal(await page.locator('#contactLeads details').count(), 2);
  scenario = 'empty';
  await page.evaluate(() => loadContactLeads());
  assert.equal(await page.locator('#contactLeads details').count(), 0);
  assert.equal(await page.locator('#contactLeadsStatus').textContent(), 'No contact submissions found.');
  scenario = 'retry-error';
  retried = false;
  await page.evaluate(() => loadContactLeads());
  await page.locator('summary').click();
  await page.getByRole('button', { name: 'Retry notification' }).click();
  await page.waitForFunction(() => document.getElementById('contactLeadsStatus').textContent === 'Retry unavailable.');
  assert.equal(await page.getByRole('button', { name: 'Retry notification' }).isEnabled(), true);
  scenario = 'review';
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => loadContactLeads());
  await page.locator('summary').click();
  let acceptReview = false;
  page.on('dialog', (dialog) => (acceptReview ? dialog.accept() : dialog.dismiss()));
  const postsBeforeCancel = requests.filter((r) => r.method === 'POST').length;
  await page.getByRole('button', { name: 'Confirmed delivered', exact: true }).click();
  assert.equal(requests.filter((r) => r.method === 'POST').length, postsBeforeCancel);
  acceptReview = true;
  for (const [label, resolution] of [
    ['Confirmed delivered', 'delivered'],
    ['Confirmed not delivered — enable retry', 'confirmed_not_delivered'],
  ]) {
    await page.evaluate(() => loadContactLeads());
    await page.locator('summary').click();
    const reloaded = page.waitForResponse(
      (response) => response.request().method() === 'GET' && response.url().includes('/api/admin/contact-leads')
    );
    await page.getByRole('button', { name: label, exact: true }).click();
    await reloaded;
    const request = requests.filter((r) => r.method === 'POST').at(-1);
    assert.equal(request.path, '/api/admin/contact-leads/review%20%2F%3F%26/resolve');
    assert.deepEqual(request.body, { resolution, attempts: 3, generation: 4 });
    assert.equal(request.headers['content-type'], 'application/json');
  }
  scenario = 'review-error';
  await page.evaluate(() => loadContactLeads());
  await page.locator('summary').click();
  await page.getByRole('button', { name: 'Confirmed delivered', exact: true }).click();
  await page.waitForFunction(
    () => document.getElementById('contactLeadsStatus').textContent === 'Review changed; refresh.'
  );
  assert.equal(await page.getByRole('button', { name: 'Confirmed delivered', exact: true }).isEnabled(), true);
  assert.ok(requests.every((r) => r.headers.authorization === 'Bearer test'));
  assert.deepEqual(errors, []);
  console.log(
    'PASS - contact inbox preserves text safety, pagination, auth, retry recovery, confirmed delivery review payloads and stale-review recovery'
  );
} finally {
  await browser.close();
}
