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
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'agapay.test') return route.fulfill({ status: 204, body: '' });
    if (url.pathname.startsWith('/api/')) {
      let payload = {};
      if (url.pathname === '/api/donor/dashboard') payload = { donor, parish };
      if (url.pathname === '/api/donor/koinonia-access' && blocked)
        return route.fulfill({
          status: 403,
          json: { code: 'household_verification_required', error: 'Verify your household.' },
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
            readingAppointments: [
              { type: 'epistle', ref: '1 Timothy 2:1–7' },
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
  assert.equal(await page.locator('#koinoniaShortcuts a').count(), 5);
  assert.equal(await page.locator('.koinonia-parish-context > svg').count(), 1);
  assert.equal(await page.locator('.koinonia-fasting-pill').textContent(), 'No fast');
  assert.equal(await page.locator('.koinonia-fasting-pill').getAttribute('aria-label'), 'No Fast (Bright Week)');
  assert.equal(await page.locator('#koinoniaYearProgress .pledge-bar-track').evaluate(el => getComputedStyle(el).height), '10px');
  assert.equal(await page.locator('#parishLifeNewsMount .parish-life-blog-card').count(), 4);
  assert.match(await page.locator('#koinoniaChurchDate').textContent(), /September 1.*Julian/);
  const progress = await page.evaluate(() => [
    window.KoinoniaExperience.yearProgress('2026-09-14', 'julian'),
    window.KoinoniaExperience.yearProgress('2026-09-01', 'gregorian'),
    window.KoinoniaExperience.yearProgress('2024-02-29', 'gregorian'),
  ]);
  assert.equal(progress[0].day, 1);
  assert.equal(progress[1].day, 1);
  assert.equal(progress[2].length, 366);
  assert.equal(await page.locator('#donorSaintModal').isVisible(), false);
  await page.getByRole('button', { name: /commemorated today/ }).click();
  await page.locator('#donorSaintModal[open]').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#donorSaintModal').isVisible(), false);
  await page.evaluate(() => renderMinistries({ groups: [] }));
  assert.equal(await page.locator('[aria-labelledby="yourMinistriesHeading"]').isVisible(), false);
  await mkdir('output', { recursive: true });
  for (const width of [320, 390, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      `No overflow at ${width}`
    );
    await page.screenshot({ path: `output/koinonia-refresh-${width}.png`, fullPage: true });
  }
  blocked = true;
  await page.reload();
  await page.getByText('Verify your household.', { exact: true }).waitFor();
  assert.equal(await page.locator('#koinoniaShortcuts').isVisible(), false);
  assert.deepEqual(errors, []);
  console.log(
    'PASS - Koinonia calendar dates, compact responsive layout, latest video, subscribed news, memberships, saint modal and household gate'
  );
} finally {
  await browser.close();
}
