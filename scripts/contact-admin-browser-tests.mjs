import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
try {
  const adminPage = readFileSync('public/admin.html', 'utf8');
  assert.match(adminPage, /id="contactLeadsCard"/);
  assert.match(adminPage, /src="\/admin\/controllers\/contact-leads.js"/);
  const page = await browser.newPage();
  let retried = false;
  const lead = { id: 'test-lead', name: '<img src=x onerror="window.injected=true">', email: 'test@example.com', message: '<script>window.injected=true</script>', topic: 'Question', attempts: 1, notificationStatus: 'failed', retryAvailable: true };
  await page.route('https://admin.test/**', (route) => {
    if (route.request().url().includes('/api/admin/contact-leads')) {
      if (route.request().method() === 'POST') {
        retried = true;
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, lead: { ...lead, notificationStatus: 'sent' } }) });
      }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, leads: [{ ...lead, notificationStatus: retried ? 'sent' : 'failed', retryAvailable: !retried }], nextCursor: null }) });
    }
    return route.fulfill({ contentType: 'text/html', body: adminPage.match(/<section class="section-card" id="contactLeadsCard"[\s\S]*?<\/section>/)[0] });
  });
  await page.goto('https://admin.test');
  await page.addScriptTag({ content: "function authHeaders() { return { Authorization: 'Bearer test' }; }" });
  await page.addScriptTag({ content: readFileSync('public/admin/controllers/contact-leads.js', 'utf8') });
  await page.evaluate(() => loadContactLeads());
  assert.equal(await page.locator('#contactLeads img, #contactLeads script').count(), 0);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  await page.locator('summary').click();
  await page.getByRole('button', { name: 'Retry notification' }).click();
  await page.waitForFunction(() => document.getElementById('contactLeadsStatus').textContent.includes('Notification sent'));
  assert.ok(retried);
  assert.equal(await page.getByRole('button', { name: 'Retry notification' }).count(), 0);
  console.log('PASS - admin contact inbox escapes submitted content and retries through authenticated API');
} finally { await browser.close(); }
