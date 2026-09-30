import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const html = readFileSync('public/admin.html', 'utf8');
const app = readFileSync('public/admin/app.js', 'utf8');
// Exercise the real tab navigation without making authenticated API requests.
const navigation = app.slice(app.indexOf('    function toggleMobileMore(force)'), app.indexOf('    function populateAdminAccountingParishes()'));
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'admin.test') return route.abort();
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
      if (url.pathname === '/admin/app.js') return route.fulfill({ contentType: 'text/javascript', body: `let activeTab = 'overview'; function loadParishSupportTickets() {} ${navigation}` });
      if (url.pathname.endsWith('.js') && !['/admin/navigation.js', '/admin/metrics.js'].includes(url.pathname)) return route.fulfill({ contentType: 'text/javascript', body: '' });
      try {
        return route.fulfill({ contentType: url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.js') ? 'text/javascript' : 'image/png', body: readFileSync(`public${url.pathname}`) });
      } catch { return route.fulfill({ status: 404, body: '' }); }
    });
    await page.goto('https://admin.test');
    assert.equal(await page.locator('#adminWorkspaceLinks').count(), 0);
    assert.equal(await page.locator('.sidebar-toolbox').evaluate(el => el.open), false);
    await page.evaluate(() => renderAdminOverviewMetrics({
      complete: true, weekStart: '2026-09-28T00:00:00Z', generatedAt: '2026-09-30T12:00:00Z',
      newRegistrations: 3, cancellations: 1, undatedCancellations: 0, unknownPriceSubscriptions: 0,
      monthlyRecurringCents: 23800, annualRecurringCents: 285600, activePaidSubscriptions: 2,
    }));
    assert.equal(await page.locator('#weeklySignups').textContent(), '3');
    assert.equal(await page.locator('#monthlyRecurringRevenue').textContent(), '$238.00');
    assert.equal(await page.locator('#nav-overview').getAttribute('aria-current'), 'page');
    const trigger = page.locator('.admin-find-button');
    await trigger.click();
    await page.locator('#adminToolSearch').fill('billing');
    assert.equal(await page.locator('#adminFinderResults button').count(), 1);
    await page.locator('#adminToolSearch').press('Enter');
    assert.equal(await page.locator('#tab-giving').getAttribute('class'), 'tab-panel active');
    assert.equal(await page.locator('#nav-giving').getAttribute('aria-current'), 'page');
    await page.keyboard.press('Control+k');
    await page.locator('#adminToolSearch').fill('nothing-matches');
    assert.match(await page.locator('#adminFinderCount').textContent(), /No tools found/);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#adminToolFinder').evaluate(el => el.open), false);
    await trigger.click();
    await page.locator('#adminToolSearch').fill('contacts');
    await page.locator('#adminToolSearch').press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.admin-secondary-workspace').evaluate(el => el.open), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'contactLeadsCard');
    await trigger.click();
    await page.locator('#adminToolSearch').fill('support');
    await page.locator('#adminFinderResults button').click();
    assert.equal(await page.locator('#tab-support').getAttribute('class'), 'tab-panel active');
    await trigger.click();
    await page.locator('#adminFinderClose').click();
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
    await page.evaluate(() => switchTab('overview'));
    await page.locator('.admin-secondary-workspace').evaluate(el => { el.open = false; });
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'page must fit the viewport');
    await page.screenshot({ path: `artifacts/admin-navigation-${width}.png`, fullPage: true });
    await page.evaluate(() => renderAdminOverviewMetrics(null));
    assert.equal(await page.locator('#weeklySignups').textContent(), '—');
    assert.match(await page.locator('#adminMetricsNote').textContent(), /unavailable/);
    assert.equal(await page.locator('#adminMetricsCard').getAttribute('aria-busy'), 'false');
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS - Admin finder, keyboard navigation, section shortcuts, focus, and responsive layout');
} finally {
  await browser.close();
}
