import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { openParishFixture, parish } from './lib/parish-browser-fixture.mjs';
const browser = await chromium.launch({ headless: true });
const sample = {
  ...parish,
  subscriptionTier: 'parish',
  subscriptionTierLabel: 'Parish',
  parishLifeAvailable: true,
  communicationsEnabled: true,
  prayerRequestsEnabled: true,
  entitlements: {
    modules: { communications: { included: true }, bulletins: { included: true }, directory: { included: true } },
  },
};
const api = {
  '/communications': {
    body: {
      announcements: [
        {
          id: 'a1',
          title: 'Sunday services',
          body: 'Parish update',
          status: 'draft',
          category: 'general',
          updatedAt: '2026-11-23T10:00:00Z',
        },
      ],
    },
  },
  '/communications/teaching': {
    body: { posts: [{ id: 't1', title: 'Sunday homily', status: 'published', updatedAt: '2026-11-22T10:00:00Z' }] },
  },
  '/communications/video': { body: { videos: [], youtube: [] } },
  '/communications/blog': { body: { blog: null } },
  '/directory/admin/ministries': { body: { ministries: [] } },
  '/prayer-requests': { body: { requests: [], settings: {}, metrics: {} } },
  '/bulletins': { body: { bulletins: [], suggestions: null } },
};
const f = await openParishFixture(browser, () => ({ parish: sample }), api);
try {
  await f.page.setViewportSize({ width: 1440, height: 1000 });
  await f.open();
  await f.page.waitForFunction(() => document.body.classList.contains('dashboard-ready'));
  await f.page.evaluate(() => switchTab('communications'));
  await f.page.waitForFunction(() => document.getElementById('koinoniaPublishedTotal')?.textContent === '1');
  assert.equal(await f.page.locator('#koinoniaDraftTotal').textContent(), '1');
  for (const view of ['content', 'bulletins', 'ministries', 'prayers', 'connections', 'overview']) {
    await f.page.locator(`[data-koinonia-view="${view}"]`).click();
    assert.equal(await f.page.locator(`[data-koinonia-panel="${view}"]`).isVisible(), true);
    assert.equal(await f.page.locator('[data-koinonia-panel]:visible').count(), 1);
  }
  await f.page.screenshot({ path: '.tmp-koinonia-desktop.png', fullPage: true });
  await f.page.locator('[data-koinonia-view="content"]').click();
  assert.equal(await f.page.locator('.koinonia-library-row').count(), 2);
  await f.page.locator('#koinoniaContentFilter').selectOption('draft');
  assert.equal(await f.page.locator('.koinonia-library-row').count(), 1);
  await f.page.locator('.koinonia-library-row .btn').click();
  assert.equal(await f.page.locator('#announcementEditTitle').inputValue(), 'Sunday services');
  await f.page.evaluate(() => closeAnnouncementEditor());
  await f.page.locator('[data-koinonia-view="connections"]').click();
  await f.page.locator('#koinoniaCalendarUrl').fill('https://example.org/calendar.ics');
  await f.page.locator('[data-koinonia-view="overview"]').click();
  await f.page.locator('[data-koinonia-view="connections"]').click();
  assert.equal(await f.page.locator('#koinoniaCalendarUrl').inputValue(), 'https://example.org/calendar.ics');
  await f.page.setViewportSize({ width: 390, height: 844 });
  for (const view of ['overview', 'content', 'bulletins', 'ministries', 'prayers', 'connections']) {
    await f.page.locator(`[data-koinonia-view="${view}"]`).click();
    assert.equal(
      await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      view + ' mobile overflow'
    );
  }
  await f.page.locator('[data-koinonia-view="overview"]').click();
  await f.page.screenshot({ path: '.tmp-koinonia-mobile.png', fullPage: true });
  f.assertClean();
  console.log('PASS Koinonia navigation, summaries, content filter/edit, connection edit retention, mobile layout');
} finally {
  await f.close();
  await browser.close();
}
