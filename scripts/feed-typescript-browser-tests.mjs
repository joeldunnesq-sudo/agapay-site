import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const script = await readFile(new URL('../public/myagapay/feed.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../public/myagapay/feed.html', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
const errors = [];
const announcements = [
  {
    id: 'pinned-1',
    title: '<Pinned & title>',
    body: '<Plain body>',
    bodyHtml: '<p>Server-rendered <strong>announcement</strong></p>',
    category: 'services',
    pinned: true,
    read: false,
    publishedAt: '2026-10-14',
    heroImageUrl: '/hero',
  },
  { id: 'general-2', title: 'General update', body: '<Unformatted body>', read: true, publishedAt: 'bad-date' },
  { id: 'event-3', title: 'Parish event', body: 'Event details', category: 'events', read: false },
];

async function fixture(options = {}) {
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(
    ({ announcements, options }) => {
      window.calls = [];
      window.unreadCounts = [];
      window.scenario = {
        feedStatus: 200,
        digestStatus: 200,
        saveStatus: 200,
        receiptStatus: 200,
        subscribed: false,
        ...options,
      };
      window.MyAgapayShell = {
        authHeaders: (extra) => ({ ...extra, Authorization: 'Bearer fixture-session' }),
        handleUnauthorized: (response) => response.status === 401,
        setFeedUnreadCount: (count) => window.unreadCounts.push(count),
      };
      window.fetch = async (url, options = {}) => {
        window.calls.push({ url, options });
        const scenario = window.scenario;
        if (url.endsWith('/read')) return new Response('{}', { status: scenario.receiptStatus });
        if (url.endsWith('/digest/subscription')) {
          if (options.method === 'POST') {
            if (scenario.saveNetworkError) throw new Error('Network interrupted');
            if (scenario.saveStatus === 200) scenario.subscribed = JSON.parse(options.body).subscribed;
            return new Response(
              JSON.stringify({
                subscribed: scenario.subscribed,
                error: scenario.saveStatus === 200 ? undefined : 'Preference save failed',
              }),
              { status: scenario.saveStatus }
            );
          }
          if (scenario.digestNetworkError) throw new Error('Preference network failed');
          return new Response(
            scenario.digestMalformed
              ? '{'
              : JSON.stringify({
                  subscribed: scenario.subscribed,
                  error: scenario.digestStatus === 200 ? undefined : 'Preference unavailable',
                }),
            { status: scenario.digestStatus }
          );
        }
        if (scenario.feedNetworkError) throw new Error('Feed network failed');
        return new Response(
          scenario.feedMalformed
            ? '{'
            : JSON.stringify({
                announcements: scenario.empty ? [] : announcements,
                unreadCount: scenario.unreadCount ?? 2,
                parish: { name: '<Parish name>' },
                error: scenario.feedStatus === 200 ? undefined : 'Feed unavailable',
              }),
          { status: scenario.feedStatus }
        );
      };
    },
    { announcements, options }
  );
  await page.route('**/*', (route) => {
    if (route.request().isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: html });
    if (new URL(route.request().url()).pathname === '/myagapay/feed.js')
      return route.fulfill({ contentType: 'application/javascript', body: script });
    return route.fulfill({
      contentType: route.request().resourceType() === 'script' ? 'application/javascript' : 'text/plain',
      body: '',
    });
  });
  await page.goto('https://agapay.test/myagapay/feed');
  await page.waitForFunction(() => window.calls.length >= 2);
  return page;
}

try {
  let page = await fixture();
  assert.equal(await page.locator('#feedParishName').textContent(), '<Parish name>');
  assert.equal(await page.locator('.feed-card').count(), 3);
  assert.equal(await page.locator('.feed-card.is-unread').count(), 2);
  assert.equal(await page.locator('.feed-card.is-pinned').count(), 1);
  assert.equal(
    await page.locator('[data-feed-id="pinned-1"] .feed-card-summary strong').textContent(),
    '<Pinned & title>'
  );
  assert.equal(await page.locator('[data-feed-id="general-2"] .feed-card-body').textContent(), '<Unformatted body>');
  assert.equal(await page.locator('[data-feed-id="pinned-1"] .feed-card-body strong').textContent(), 'announcement');
  assert.equal(await page.locator('#feedUnreadSummary').textContent(), '2 unread');
  assert.equal(await page.locator('#feedDigestToggle').isChecked(), false);
  assert.equal(await page.locator('#feedDigestToggle').isEnabled(), true);
  assert.equal(
    await page.evaluate(() => window.calls.filter((call) => call.options.method === 'POST').length),
    0,
    'Loading never changes consent or read state'
  );
  const initialCalls = await page.evaluate(() => window.calls);
  for (const call of initialCalls) {
    assert.equal(call.options.cache, 'no-store');
    assert.equal(call.options.headers.Authorization, 'Bearer fixture-session');
    assert.equal(call.options.headers['Content-Type'], 'application/json');
  }
  assert.deepEqual(
    await page.evaluate(() =>
      ['all', 'pinned', 'services', 'events', 'general'].map((filter) => announcementsForFilter(filter).length)
    ),
    [3, 1, 1, 1, 1]
  );
  await page.evaluate(() => setFeedCategoryFilter('pinned'));
  assert.equal(await page.locator('.feed-card').count(), 1);
  assert.equal(await page.locator('#feedCategoryFilters .is-active').getAttribute('aria-pressed'), 'true');
  await page.evaluate(() => setFeedCategoryFilter('unknown'));
  assert.equal(await page.locator('.feed-card').count(), 1, 'Unknown filter leaves selection unchanged');
  await page.evaluate(() => setFeedCategoryFilter('youth'));
  assert.match(await page.locator('#feedList').textContent(), /No youth announcements/);
  await page.evaluate(() => setFeedCategoryFilter('all'));
  await page.locator('[data-feed-id="pinned-1"] .feed-card-summary').click();
  await page.waitForFunction(() => document.getElementById('feedUnreadSummary').textContent === '1 unread');
  assert.equal(await page.locator('[data-feed-id="pinned-1"] .feed-card-detail').evaluate((el) => el.hidden), false);
  assert.equal(
    await page.locator('[data-feed-id="pinned-1"] .feed-card-summary').getAttribute('aria-expanded'),
    'true'
  );
  await page.locator('[data-feed-id="pinned-1"] .feed-card-summary').click();
  await page.locator('[data-feed-id="pinned-1"] .feed-card-summary').click();
  assert.equal(await page.evaluate(() => window.calls.filter((call) => call.url.endsWith('/read')).length), 1);
  await page.evaluate(() => {
    window.scenario.receiptStatus = 503;
  });
  await page.evaluate(() => openFeedAnnouncement('event-3'));
  assert.equal(await page.locator('#feedUnreadSummary').textContent(), '1 unread');
  assert.equal(
    await page.locator('[data-feed-id="event-3"]').evaluate((el) => el.classList.contains('is-unread')),
    true
  );
  await page.evaluate(async () => {
    await openFeedAnnouncement('event-3');
    window.scenario.receiptStatus = 200;
    await openFeedAnnouncement('event-3');
  });
  assert.equal(await page.locator('#feedUnreadSummary').evaluate((el) => el.hidden), true);
  assert.equal(await page.evaluate(() => window.unreadCounts.at(-1)), 0);
  await page.locator('#feedDigestToggle').check();
  await page.waitForFunction(() => document.getElementById('feedDigestToggleLabel').textContent === 'Digest on');
  assert.match(await page.locator('#feedDigestStatus').textContent(), /only when your parish publishes something new/);
  const save = await page.evaluate(() =>
    window.calls.find((call) => call.options.method === 'POST' && call.url.endsWith('/digest/subscription'))
  );
  assert.deepEqual(JSON.parse(save.options.body), { subscribed: true });
  await page.evaluate(() => {
    window.scenario.saveStatus = 503;
  });
  await page.locator('#feedDigestToggle').click();
  await page.waitForFunction(
    () => document.getElementById('feedDigestStatus').textContent === 'Preference save failed'
  );
  assert.equal(await page.locator('#feedDigestToggle').isChecked(), true, 'Failed save restores prior consent');
  assert.equal(await page.locator('#feedDigestToggle').isEnabled(), true);
  await page.evaluate(() => {
    window.scenario.saveStatus = 200;
    window.scenario.saveNetworkError = true;
  });
  await page.locator('#feedDigestToggle').click();
  await page.waitForFunction(() => document.getElementById('feedDigestStatus').textContent === 'Network interrupted');
  assert.equal(await page.locator('#feedDigestToggle').isChecked(), true);
  await page.evaluate(() => {
    window.scenario.saveNetworkError = false;
  });
  await page.locator('#feedDigestToggle').click();
  await page.waitForFunction(() => document.getElementById('feedDigestToggleLabel').textContent === 'Digest off');
  assert.match(await page.locator('#feedDigestStatus').textContent(), /won’t receive/);
  assert.equal(await page.evaluate(() => feedDate('bad-date')), '');
  await page.evaluate(() => {
    document.body.replaceChildren();
    renderParishFeed();
    setDigestPreferenceUi(false);
  });
  await page.close();

  for (const [options, expected] of [
    [{ empty: true, unreadCount: -5 }, 'No announcements yet'],
    [{ feedMalformed: true }, 'No announcements yet'],
    [{ feedStatus: 503 }, 'Feed unavailable'],
    [{ feedNetworkError: true }, 'Feed network failed'],
  ]) {
    page = await fixture(options);
    assert.match(
      await page.locator(options.feedStatus || options.feedNetworkError ? '#feedStatus' : '#feedList').textContent(),
      new RegExp(expected)
    );
    if (options.empty) assert.equal(await page.locator('#feedUnreadSummary').evaluate((el) => el.hidden), true);
    await page.close();
  }
  for (const options of [{ digestStatus: 503 }, { digestNetworkError: true }]) {
    page = await fixture(options);
    assert.equal(await page.locator('#feedDigestToggle').isEnabled(), false);
    assert.equal(await page.locator('#feedDigestToggleLabel').textContent(), 'Preference unavailable');
    await page.close();
  }
  page = await fixture({ digestMalformed: true });
  assert.equal(await page.locator('#feedDigestToggle').isChecked(), false);
  assert.equal(
    await page.locator('#feedDigestToggle').isEnabled(),
    true,
    'Existing malformed-JSON fallback is retained'
  );
  await page.close();
  page = await fixture({ feedStatus: 401, digestStatus: 401 });
  assert.equal(await page.locator('.feed-card').count(), 0);
  assert.equal(await page.locator('#feedDigestToggle').isEnabled(), false);
  await page.close();
  assert.deepEqual(errors, []);
  console.log(
    'PASS - announcement filters, escaped content, server HTML, read receipts/retry, unread badge, consent only on change, save rollback/retry, auth, malformed JSON and missing optional DOM'
  );
} finally {
  await browser.close();
}
