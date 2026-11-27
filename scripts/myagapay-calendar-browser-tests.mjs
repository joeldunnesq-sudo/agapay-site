import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { captureBrowserErrors } from './lib/browser-error-gate.mjs';

const parish = {
  id: 'test-parish',
  name: 'Test Parish',
  liturgicalCalendar: 'julian',
  communicationsEnabled: true,
  parishLifeLabel: 'Koinonia',
  parishLifeAvailable: true,
};
const donor = {
  email: 'member@example.test',
  donorName: 'Test Member',
  defaultParishId: parish.id,
  defaultParish: parish,
};
const today = {
  feastTitle: 'Beheading of St John the Baptist',
  primarySaintTitle: 'Beheading of St John the Baptist',
  sourceConnected: true,
  saintStories: [{ name: 'St John the Forerunner', primary: true, storyText: 'A test saint life.' }],
  readingAppointments: [
    { type: 'epistle', ref: 'Acts 13.25-33', appointment: 'Forerunner' },
    { type: 'gospel', ref: 'Mark 6.14-30', appointment: 'Forerunner' },
    { type: 'epistle', ref: 'Galatians 4.8-21', appointment: '' },
    { type: 'gospel', ref: 'Mark 6.45-53', appointment: '' },
  ],
};
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    isMobile: true,
    serviceWorkers: 'block',
  });
  let expireSession = false;
  let directoryEnabled = false;
  let blockedAccess = null;
  const blockedMemberRequests = [];
  let submittedReply;
  // All traffic is fulfilled locally, including API and external resources.
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'agapay.test') return route.fulfill({ status: 204, body: '' });
    if (url.pathname.startsWith('/api/')) {
      if (blockedAccess && ['/api/donor/feed', '/api/donor/groups'].includes(url.pathname)) {
        blockedMemberRequests.push(url.pathname);
      }
      let payload = {};
      if (url.pathname === '/api/donor/dashboard') {
        if (expireSession) return route.fulfill({ status: 401, json: { error: 'Unauthorized' } });
        payload = { donor, parish: { ...parish, directoryEnabled } };
      } else if (url.pathname === '/api/donor/koinonia-access') {
        if (route.request().method() === 'POST') {
          submittedReply = route.request().postDataJSON();
          payload = { ok: true, action: directoryEnabled ? 'membership_requested' : 'directory_requested' };
        } else if (blockedAccess) {
          return route.fulfill({ status: 403, json: blockedAccess });
        }
      } else if (url.pathname === '/api/donor/liturgical-day') payload = { today, date: '2026-09-11' };
      else if (url.pathname === '/api/donor/parish-calendar')
        payload = { connected: true, subscriptionUrl: 'https://calendar.example.test/parish.ics', events: [] };
      return route.fulfill({ json: payload });
    }
    let filename = url.pathname;
    if (filename === '/myagapay/calendar') filename = '/myagapay/giving/calendar.html';
    else if (!filename.split('/').at(-1).includes('.')) filename += '.html';
    try {
      return route.fulfill({
        body: await readFile(new URL(`../public${filename}`, import.meta.url)),
        contentType: filename.endsWith('.js')
          ? 'text/javascript'
          : filename.endsWith('.css')
            ? 'text/css'
            : filename.endsWith('.html')
              ? 'text/html'
              : 'application/octet-stream',
      });
    } catch {
      return route.fulfill({ status: 404, body: '' });
    }
  });
  const page = await context.newPage();
  const errors = captureBrowserErrors(page);
  await page.addInitScript(
    ({ donor }) => {
      if (!sessionStorage.getItem('fixture-initialized')) {
        localStorage.setItem('agapayDonorEmail', donor.email);
        localStorage.setItem('agapayDonorToken', 'test-session');
        localStorage.setItem('agapayDonorProfile', JSON.stringify(donor));
        sessionStorage.setItem('fixture-initialized', '1');
      }
      Object.defineProperty(navigator, 'standalone', { value: true });
    },
    { donor }
  );
  const assertReadings = async () => {
    await page.waitForFunction(() => document.querySelectorAll('#todayFeastNote .is-heading').length === 2);
    assert.deepEqual(await page.locator('#todayFeastNote .is-heading').allTextContents(), [
      'Readings of the day',
      'Feast — Forerunner',
    ]);
    assert.match(await page.locator('#todayFeastNote').textContent(), /Galatians 4\.8-21/);
  };
  await page.goto('https://agapay.test/myagapay/parish-life');
  await assertReadings();
  const summary = page.locator('#todayFeastNote .cal-reading-summary');
  assert.deepEqual(await summary.allTextContents(), [
    'Epistle: Galatians 4.8-21, Gospel: Mark 6.45-53',
    'Epistle: Acts 13.25-33, Gospel: Mark 6.14-30',
  ]);
  await page.locator('.cal-readings-trigger').click();
  const readingDialog = page.getByRole('dialog', { name: 'Today’s Scripture readings' });
  await readingDialog.waitFor();
  assert.deepEqual(await readingDialog.getByRole('heading', { level: 3 }).allTextContents(), [
    'Readings of the day',
    'Feast — Forerunner',
  ]);
  await page.keyboard.press('Escape');
  await readingDialog.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#calendarChurchYear').count(), 0);
  const heroColors = await page.locator('.parish-life-liturgical-hero').evaluate((element) => ({
    background: getComputedStyle(element).backgroundImage,
    title: getComputedStyle(element.querySelector('.cal-today-title')).color,
  }));
  assert.match(
    heroColors.background,
    /linear-gradient.*fresco-vault\.jpg/,
    'Home must use the preview’s photo with a dark gradient'
  );
  assert.equal(heroColors.title, 'rgb(245, 242, 235)', 'The dark hero must retain its readable cream title');
  await page.locator('#saintPreviewCard').click();
  await page.locator('#donorSaintModal').waitFor({ state: 'visible' });
  assert.match(await page.locator('#donorSaintModalBody').textContent(), /A test saint life/);
  // Long saint lives must remain readable in portrait and short landscape views.
  for (const viewport of [
    { width: 412, height: 915 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => {
      const paragraphs = Array.from(
        { length: 40 },
        (_, index) => '<p>Saint life paragraph ' + index + '. A life of prayer and service to the community.</p>'
      ).join('');
      window.showDonorSaintModal(
        'Life of the Saint',
        'Today’s commemoration',
        '<article class="donor-saint-story">' + paragraphs + '<p id="saintLifeEnd">End of the saint life.</p></article>'
      );
    });
    const body = page.locator('#donorSaintModalBody');
    await body.hover();
    await page.mouse.wheel(0, 400);
    await page.waitForFunction(() => document.getElementById('donorSaintModalBody').scrollTop > 0);
    await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    assert.ok(
      await page.locator('#saintLifeEnd').evaluate((element) => {
        const text = element.getBoundingClientRect();
        const body = document.getElementById('donorSaintModalBody').getBoundingClientRect();
        return text.top >= body.top && text.bottom <= body.bottom;
      }),
      'The final saint-life paragraph must be reachable'
    );
    assert.ok(
      await page.getByRole('button', { name: 'Close saint life', exact: true }).evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
      }),
      'The close control must remain within the viewport'
    );
  }
  await page.setViewportSize({ width: 412, height: 915 });
  await page.getByRole('button', { name: 'Close saint life', exact: true }).click();
  await page.locator('#donorSaintModal').waitFor({ state: 'hidden' });
  await page.evaluate(() => {
    const originalNow = Date.now;
    let visible = false;
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (visible ? 'visible' : 'hidden'),
    });
    document.dispatchEvent(new Event('visibilitychange'));
    Date.now = () => originalNow() + 5 * 60 * 1000;
    visible = true;
    document.dispatchEvent(new Event('visibilitychange'));
    Date.now = originalNow;
    delete document.visibilityState;
  });
  assert.equal(await page.evaluate(() => window.AGAPAYDonorSession.session().token), 'test-session');
  assert.ok(page.url().endsWith('/myagapay/parish-life'));
  await page.reload();
  await assertReadings();
  await page.getByRole('link', { name: 'Full Calendar', exact: true }).click();
  await page.waitForURL('**/myagapay/calendar');
  await assertReadings();
  errors.assertClean();

  const fullTitle = 'Martyr Mamas of Caesarea; St John the Faster; St Eleazar';
  today.primarySaintTitle = fullTitle;
  today.saintStories.push({ name: 'St John the Faster', storyText: 'The second saint life.' });
  await page.goto('https://agapay.test/myagapay/parish-life');
  await assertReadings();
  assert.equal(await page.locator('#todayFeastTitle').textContent(), 'Martyr Mamas of Caesarea, and others');
  await page.locator('#saintPreviewCard').click();
  await page.locator('#donorSaintModal').waitFor({ state: 'visible' });
  assert.match(await page.locator('#donorSaintModalBody').textContent(), /The second saint life/);
  assert.equal(await page.locator('#donorSaintModalTitle').textContent(), 'Lives of the Saints');
  assert.ok(
    await page
      .locator('#donorSaintModal .donor-saint-modal-head')
      .evaluate((element) => element.getBoundingClientRect().height < 150),
    'The list of saints must not consume the fixed modal header'
  );
  await page.goto('https://agapay.test/myagapay/calendar');
  await assertReadings();
  assert.equal(await page.locator('#todayFeastTitle').textContent(), fullTitle);
  await page.locator('#saintPreviewCard').click();
  await page.locator('#donorSaintModal').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#donorSaintModalTitle').textContent(), 'Lives of the Saints');
  assert.match(await page.locator('#donorSaintModalBody').textContent(), /The second saint life/);
  today.primarySaintTitle = 'Holy Martyrs Faith, Hope, and Love';
  today.saintStories.splice(1);
  await page.goto('https://agapay.test/myagapay/parish-life');
  await assertReadings();
  assert.equal(await page.locator('#todayFeastTitle').textContent(), today.primarySaintTitle);

  blockedAccess = { code: 'parish_profile_required' };
  await page.goto('https://agapay.test/myagapay/parish-life');
  await page.getByText('You need to be an approved member of this parish to access Koinonia.').waitFor();
  await assertReadings();
  await page.getByRole('link', { name: 'Full Calendar' }).waitFor();
  await page.locator('#parishCalendarMonth').waitFor({ state: 'visible' });
  const calendar = await page.locator('.parish-life-week-calendar').boundingBox();
  const request = await page.locator('#koinoniaAccessRequest').boundingBox();
  assert.ok(request.y >= calendar.y + calendar.height, 'Access request should sit below the calendar');
  assert.equal(await page.locator('#parishLifeTierSections').isVisible(), false);
  await page.getByRole('button', { name: 'Ask the parish to enable Directory' }).click();
  await page.getByText(/Return here to request approval once Directory is enabled/).waitFor();
  directoryEnabled = true;
  await page.reload();
  await page.getByRole('button', { name: 'Request parish approval' }).click();
  await page.getByText(/Your request is in the parish’s Directory review queue/).waitFor();
  blockedAccess.review = { status: 'returned', question: 'When did you join the parish?' };
  await page.reload();
  await page.getByText(blockedAccess.review.question).waitFor();
  await page.getByRole('textbox', { name: 'Reply to your parish' }).fill('Last year.');
  await page.getByRole('button', { name: 'Send reply' }).click();
  await page.getByText(/Your request is in the parish’s Directory review queue/).waitFor();
  assert.deepEqual(submittedReply, { message: 'Last year.' });
  assert.deepEqual(blockedMemberRequests, [], 'Member-only requests stay gated while the calendar loads');

  expireSession = true;
  await page.reload();
  await page.waitForURL('**/myagapay/login?**');
  assert.equal(await page.evaluate(() => localStorage.getItem('agapayDonorToken')), null);
  assert.equal(new URL(page.url()).searchParams.get('reason'), 'session-expired');
  errors.assertClean();
  console.log(
    'PASS - mobile Koinonia and full calendar render readings, open saints, preserve resumes/reloads, and reject expired sessions'
  );
} finally {
  await browser.close();
}
