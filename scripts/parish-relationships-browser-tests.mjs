import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const sample = { days: 30, trackingSince: '2026-09-30', retention: null, emailConfigured: true, history: [], onboarding: { registered: 2, verified: 2, connected: 1, firstGift: 1 }, parishes: [
  { reference: 'p1', name: 'Saint Nicholas Orthodox Church', eligible: true, hasFeast: true, preferences: { anniversary: false, feast: false, recipient: 'treasurer@example.test', feastRecipient: 'priest@example.test', timeZone: 'America/Chicago' }, attention: null, occasions: [{ kind: 'anniversary', date: '2026-10-12', title: '1 year signup anniversary' }, { kind: 'feast', date: '2026-12-19', title: 'Saint Nicholas' }] },
  { reference: 'p2', name: 'Holy Trinity Orthodox Parish', eligible: true, hasFeast: false, preferences: { anniversary: false, feast: false, recipient: 'priest@example.test', feastRecipient: 'priest@example.test', timeZone: 'America/New_York' }, attention: { tone: 'amber', label: 'Finish payment setup' }, occasions: [{ kind: 'anniversary', date: '2026-11-08', title: '1 year signup anniversary' }] },
] };
mkdirSync('artifacts/parish-relationships', { recursive: true });
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 } });
    const errors = []; let saves = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'care.test') return route.abort();
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: readFileSync('public/admin.html', 'utf8') });
      if (url.pathname === '/api/admin/relationships') {
        if (route.request().method() === 'POST') { const body = route.request().postDataJSON(); assert.equal(body.reference, 'p1'); assert.equal(body.preferences.anniversary, true); saves++; return route.fulfill({ json: { preferences: body.preferences } }); }
        if (url.searchParams.has('preview')) return route.fulfill({ json: { message: { subject: 'A year of generosity', html: '<h1>Happy anniversary</h1>' }, note: 'Preview only. No email sent.' } });
        return route.fulfill({ json: sample });
      }
      if (url.pathname === '/admin/app.js') return route.fulfill({ contentType: 'text/javascript', body: "function authHeaders(){return {}} function handleAuthFailure(){return false} function switchTab(){} function loadDetail(){}" });
      if (url.pathname.endsWith('.js') && !['/admin/relationships.js', '/admin/metrics.js'].includes(url.pathname)) return route.fulfill({ contentType: 'text/javascript', body: '' });
      try { return route.fulfill({ contentType: url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.js') ? 'text/javascript' : 'image/png', body: readFileSync(`public${url.pathname}`) }); } catch { return route.fulfill({ status: 404, body: '' }); }
    });
    await page.goto('https://care.test');
    await page.evaluate(() => loadParishRelationships());
    await page.locator('#careContent .care-milestone').first().waitFor();
    assert.match(await page.locator('#parishRetention').innerText(), /Collecting history/);
    assert.equal(await page.locator('#careContent .care-milestone').count(), 3);
    assert.equal(await page.locator('#careContent .care-manage').evaluate(el => el.open), false);
    await page.locator('#parishCare').scrollIntoViewIfNeeded();
    await page.locator('#parishCare').screenshot({ path: `artifacts/parish-relationships/care-${width}.png` });
    await page.locator('[data-manage="p1"]').first().click();
    await page.locator('[data-preview="anniversary"]').click();
    await page.getByText('Preview ready. No email was sent.').waitFor();
    assert.equal(saves, 0, 'Preview does not change settings or send');
    await page.locator('#careAnniversary').check();
    await page.getByRole('button', { name: 'Save email preferences' }).click();
    await page.getByText('Saved. Annual messages follow these preferences; no email was sent now.').waitFor();
    assert.equal(saves, 1);
    assert.equal(await page.locator('#careDialog').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, 'Modal fits viewport');
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#careDialog').evaluate(el => el.open), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'No horizontal overflow');
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally { await browser.close(); }
console.log('PASS - desktop/mobile parish care layout, preview, preferences, keyboard dismissal, and no overflow');
