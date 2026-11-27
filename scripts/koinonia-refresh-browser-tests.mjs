import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const parish = {
  id: 'parish-a',
  name: 'Holy Trinity Orthodox Church',
  subscriptionTier: 'parish',
  communicationsEnabled: true,
  liturgicalCalendar: 'julian',
  directoryEnabled: true,
  signupsEnabled: true,
  exchangeEnabled: true,
  prayerRequestsEnabled: true,
  sacramentsEnabled: true,
};
const donor = { email: 'member@example.test', donorName: 'Parish Member', defaultParishId: parish.id };
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  let blocked = false;
  let readingsConnected = true;
  const limitedRequests = [];
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'agapay.test') return route.fulfill({ status: 204, body: '' });
    if (url.pathname.startsWith('/api/')) {
      let payload = {};
      if (blocked) limitedRequests.push(url.pathname);
      if (url.pathname === '/api/donor/dashboard') payload = { donor, parish };
      if (url.pathname === '/api/donor/koinonia-access' && blocked)
        return route.fulfill({
          status: 403,
          json: { code: 'household_verification_required', error: 'Verify your household.' },
        });
      if (url.pathname === '/api/donor/teaching' && blocked)
        return route.fulfill({ status: 403, json: { code: 'household_verification_required' } });
      if (url.pathname === '/api/listen/subscriptions' && blocked)
        payload = { subscriptions: [{ feedUrl: 'https://example.test/podcast.xml' }] };
      if (url.pathname === '/api/listen/rss' && blocked)
        return route.fulfill({
          contentType: 'application/rss+xml',
          body: '<rss><channel><title>Orthodox podcast</title><item><title>A public episode</title><guid>public-episode</guid><pubDate>Mon, 14 Sep 2026 12:00:00 GMT</pubDate><enclosure url="https://example.test/episode.mp3"/></item></channel></rss>',
        });
      if (url.pathname === '/api/donor/liturgical-day')
        payload = {
          date: '2026-09-14',
          today: {
            feastTitle: 'The Beginning of the Church Year',
            feastRank: 'great',
            fastingRule: 'No Fast (Bright Week)',
            tone: 4,
            saints: ['Saint Symeon'],
            saintStories: [{ title: 'Saint Symeon', story: 'A life of prayer.' }],
            sourceConnected: readingsConnected,
            readingAppointments: [
              {
                type: 'epistle',
                ref: '1 Timothy 2:1–7',
                preview: '2:1 I exhort therefore, that, first of all, supplications, prayers … '.repeat(32),
              },
              { type: 'gospel', ref: 'Luke 4:16–22' },
            ],
          },
        };
      if (url.pathname === '/api/donor/parish-calendar') payload = { connected: true, events: [] };
      if (url.pathname === '/api/donor/groups')
        payload = { groups: [{ id: 'choir', name: 'Parish Choir', role: 'participant' }] };
      if (url.pathname === '/api/donor/videos')
        payload = {
          videos: [
            { id: 'old', title: 'Older pinned video', pinned: true, publishedAt: '2026-09-01' },
            { id: 'new', title: 'Latest homily', publishedAt: '2026-09-13' },
          ],
        };
      if (url.pathname.includes('/external-feeds/'))
        payload = {
          available: true,
          sourceKey: url.pathname.split('/').at(-1),
          subscribed: url.pathname.endsWith('/oca'),
          source: 'oca',
          label: 'OCA',
          posts: Array.from({ length: 6 }, (_, i) => ({
            title: `Story ${i}`,
            publishedAt: `2026-09-${String(14 - i).padStart(2, '0')}`,
            url: 'https://example.test/story',
          })),
        };
      return route.fulfill({ json: payload });
    }
    let file = url.pathname;
    if (!file.split('/').at(-1).includes('.')) file += '.html';
    try {
      return route.fulfill({
        body: await readFile(new URL(`../public${file}`, import.meta.url)),
        contentType: file.endsWith('.js')
          ? 'text/javascript'
          : file.endsWith('.css')
            ? 'text/css'
            : file.endsWith('.png')
              ? 'image/png'
              : 'text/html',
      });
    } catch {
      return route.fulfill({ status: 404, body: '' });
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    ({ donor }) => {
      localStorage.setItem('agapayDonorEmail', donor.email);
      localStorage.setItem('agapayDonorToken', 'test');
      localStorage.setItem('agapayDonorProfile', JSON.stringify(donor));
    },
    { donor }
  );
  await page.goto('https://agapay.test/myagapay/parish-life');
  await page.getByText('Latest homily', { exact: true }).waitFor();
  assert.equal(await page.locator('#parishLifeVideos a').count(), 1);
  assert.match(await page.locator('#todayFeastNote').textContent(), /1 Timothy 2:1–7/);
  assert.match(await page.locator('#todayFeastNote').textContent(), /Luke 4:16–22/);
  const readingButton = page.getByRole('button', { name: /Epistle: 1 Timothy.*Gospel: Luke/s });
  const readingDialog = page.getByRole('dialog', { name: 'Today’s Scripture readings' });
  const readings = readingDialog.getByRole('region', { name: 'Readings' });
  await page.setViewportSize({ width: 390, height: 520 });
  assert.equal(await readingDialog.isVisible(), false);
  await readingButton.press('Enter');
  await readingDialog.waitFor();
  assert.match(await readingDialog.textContent(), /I exhort therefore/);
  assert.match(await readingDialog.textContent(), /Luke 4:16–22/);
  const dialogBounds = await readingDialog.boundingBox();
  const readingBounds = await readings.boundingBox();
  assert.ok(dialogBounds.y >= 12 && dialogBounds.y + dialogBounds.height <= 508);
  assert.ok(readingBounds.y - dialogBounds.y < 130 && readingBounds.height > 220);
  assert.equal(await readings.evaluate((region) => region.scrollTop), 0);
  await readings.hover();
  await page.mouse.wheel(0, 640);
  await page.waitForFunction(() => document.getElementById('todayReadingsBody').scrollTop > 100);
  assert.equal((await readingDialog.boundingBox()).y, dialogBounds.y);
  await page.keyboard.press('Escape');
  await readingDialog.waitFor({ state: 'hidden' });
  assert.equal(await readingButton.evaluate((el) => document.activeElement === el), true);
  await readingButton.click();
  assert.equal(await readings.evaluate((region) => region.scrollTop), 0, 'Reopening starts at the first reading');
  await readingDialog.getByRole('button', { name: 'Close Scripture readings' }).click();
  await readingDialog.waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() =>
    renderRecentPodcastEpisodes(
      [{}],
      [
        {
          title: 'A parish conversation',
          show: 'Parish podcast',
          date: '2026-09-14',
          episodeKey: 'episode',
          feedUrl: 'https://example.test/feed',
          image: '/images/app/bookstore-still-life.png',
        },
      ]
    )
  );
  assert.equal(await page.locator('#parishLifeListenItems img').count(), 1);
  await page.evaluate(() => renderCommunityToolBadges({ counts: { signups: 2, exchange: 1, prayers: 3 } }));
  assert.equal(await page.locator('#koinoniaShortcuts [data-community-tool-badge="prayers"]').textContent(), '3');
  const shortcuts = page.locator('#koinoniaShortcuts');
  assert.equal(await shortcuts.locator('a').count(), 6);
  const sacramentsShortcut = shortcuts.getByRole('link', { name: 'Sacraments & Services' });
  assert.equal(await sacramentsShortcut.getAttribute('href'), '/myagapay/sacraments');
  assert.equal(await sacramentsShortcut.locator('svg path').count(), 1);
  assert.equal(await page.locator('.app-home-header [data-app-church-name]').textContent(), parish.name);
  const hero = page.locator('.refined-liturgical-hero');
  assert.equal(await hero.getByRole('link', { name: 'Give now' }).getAttribute('href'), '/myagapay/giving');
  assert.equal(await hero.locator('a[href="/myagapay/calendar"]').count(), 0);
  assert.equal(await page.getByRole('link', { name: 'Full Calendar', exact: true }).isVisible(), true);
  assert.equal(await page.locator('.koinonia-fasting-pill').textContent(), 'No fast');
  assert.equal(await page.locator('.koinonia-fasting-pill').getAttribute('aria-label'), 'No Fast (Bright Week)');
  assert.equal(await page.locator('#parishLifeNewsMount .parish-life-blog-card').count(), 4);
  assert.match(await page.locator('#koinoniaChurchDate').textContent(), /September 1.*Julian/);
  assert.equal(await page.locator('#koinoniaYearProgress').count(), 0);
  assert.equal(await page.locator('#donorSaintModal').isVisible(), false);
  assert.equal(
    await page.locator('.parish-life-ministry-tile strong').evaluate((el) => getComputedStyle(el).color),
    'rgb(24, 53, 75)'
  );
  assert.equal(
    await page.locator('.parish-life-community-inbox').evaluate((el) => getComputedStyle(el).borderTopWidth),
    '0px'
  );
  await page.getByRole('button', { name: /commemorated today/ }).click();
  await page.locator('#donorSaintModal[open]').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#donorSaintModal').isVisible(), false);
  await page.evaluate(() => renderMinistries({ groups: [] }));
  assert.equal(await page.locator('[aria-labelledby="yourMinistriesHeading"]').isVisible(), false);
  await page.evaluate(() => renderMinistries({ groups: [{ id: 'choir', name: 'Parish Choir', role: 'participant' }] }));
  assert.equal(await page.locator('[aria-labelledby="yourMinistriesHeading"]').isVisible(), true);
  await mkdir('output', { recursive: true });
  for (const width of [320, 390, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await shortcuts.locator('a').evaluateAll((items) => new Set(items.map((item) => item.offsetTop)).size),
      1
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      `No overflow at ${width}`
    );
    await page.screenshot({ path: `output/koinonia-refresh-${width}.png`, fullPage: true });
  }
  blocked = true;
  readingsConnected = false;
  await page.reload();
  await page
    .getByText('You need to be an approved member of this parish to access Koinonia.', { exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'Request parish approval' }).waitFor();
  await page.locator('#parishLifeListenItems').getByText('A public episode').waitFor();
  await page.locator('#parishLifeNewsMount').getByText('Story 0').waitFor();
  assert.ok(await shortcuts.isVisible());
  assert.deepEqual(await shortcuts.locator('.koinonia-shortcut[aria-disabled="true"] > span').allTextContents(), [
    'Signups',
    'Exchange',
    'Prayers',
    'Ministries',
    'Directory',
    'Sacraments',
  ]);
  assert.equal(await shortcuts.locator('a[href], [tabindex], button').count(), 0);
  assert.equal(
    await shortcuts
      .locator('.koinonia-shortcut')
      .evaluateAll((items) => new Set(items.map((item) => item.offsetTop)).size),
    1
  );
  const previousUrl = page.url();
  await shortcuts.getByText('Sacraments', { exact: true }).click();
  assert.equal(page.url(), previousUrl);
  assert.equal(await page.locator('#parishLifeMinistries, #parishLifeVideos').count(), 0);
  assert.ok(!limitedRequests.includes('/api/donor/external-feeds/parish_blog'));
  assert.ok(!limitedRequests.includes('/api/donor/custom-news-feeds'));
  await page
    .locator('#todayFeastNote')
    .filter({ hasText: /Daily readings.*temporarily unavailable/ })
    .waitFor();
  assert.equal(await readingButton.count(), 0);
  await page.getByRole('link', { name: 'Open Podcasts' }).click();
  await page.getByRole('heading', { name: 'Listen', exact: true }).waitFor();
  await page.locator('#podcastAudioPane').getByText('A public episode').waitFor();
  assert.equal(
    await page
      .locator('#parishAudioPane, .audio-library-mode-tabs')
      .evaluateAll((items) => items.every((item) => item.hidden)),
    true
  );
  await page.goBack();
  await page.getByRole('link', { name: 'All News' }).click();
  await page.locator('#newsArticleList').getByText('Story 0').waitFor();
  assert.deepEqual(errors, []);
  console.log(
    'PASS - Parish Life readings, responsive shortcuts, member content and unverified access to podcasts and curated news'
  );
} finally {
  await browser.close();
}
