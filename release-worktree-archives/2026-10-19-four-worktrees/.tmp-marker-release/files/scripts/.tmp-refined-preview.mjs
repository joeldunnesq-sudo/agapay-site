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
  // All traffic is fulfilled locally, including API and external resources.
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.continue();
    if (url.hostname !== 'agapay.test') return route.fulfill({ status: 204, body: '' });
    if (url.pathname.startsWith('/api/')) {
      let payload = {};
      if (url.pathname === '/api/donor/dashboard') {
        if (expireSession) return route.fulfill({ status: 401, json: { error: 'Unauthorized' } });
        payload = { donor, parish };
      } else if (url.pathname === '/api/donor/liturgical-day') payload = { today, date: '2026-09-11' };
      else if (url.pathname === '/api/donor/parish-calendar') payload = { connected: true, events: [] };
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
      'Feast — Forerunner',
      'Readings of the day',
    ]);
    assert.match(await page.locator('#todayFeastNote').textContent(), /Galatians 4\.8-21/);
  };
  await page.goto('https://agapay.test/myagapay/parish-life');
  await assertReadings();
  assert.equal(await page.locator('#calendarChurchYear').count(), 0);
  await page.locator('#saintPreviewCard').click();
  await page.locator('#donorSaintModal').waitFor({ state: 'visible' });
  assert.match(await page.locator('#donorSaintModalBody').textContent(), /A test saint life/);
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


  await page.setViewportSize({width:412,height:1000});
  await page.goto('https://agapay.test/myagapay/parish-life');
  await assertReadings();
  await page.addStyleTag({content: `
    .koinonia-landing-page .parish-life-liturgical-hero { background:#18354b; border-color:#294e67; color:#e8eef1; }
    .koinonia-landing-page .parish-life-liturgical-hero .cal-today-title { color:#e8eef1; }
    .koinonia-landing-page .parish-life-liturgical-hero .cal-today-note { color:#c4d1d9; }
    .koinonia-landing-page .parish-life-liturgical-hero .cal-hero-eyebrow,
    .koinonia-landing-page .parish-life-liturgical-hero .cal-reading-line.is-heading { color:#e8c879; }
    .koinonia-landing-page .parish-life-liturgical-hero .cal-date-badge { background:#e8eef1; border-color:#d3dde2; color:#18354b; }
    .koinonia-landing-page .parish-life-liturgical-hero .cal-date-weekday { color:#806532; }
    .koinonia-landing-page .parish-life-liturgical-hero .cal-date-my,
    .koinonia-landing-page .parish-life-liturgical-hero .cal-date-calendar { color:#435866; }
    .koinonia-landing-page #todayChips > .cal-saint-chip { background:#e8eef1; color:#18354b; border-color:#d3dde2; }
    .koinonia-landing-page #todayChips > .cal-saint-chip:hover { background:#fffdf8; }
  `});
  await page.addStyleTag({content: await readFile('C:/Users/joeld/.codex/visualizations/2026/09/15/01a0a5a3-4f50-72b1-83ba-b43e837c2b94/koinonia-refined-preview.css','utf8')});
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.parish-life-liturgical-hero').screenshot({path:'C:/Users/joeld/.codex/visualizations/2026/09/15/01a0a5a3-4f50-72b1-83ba-b43e837c2b94/koinonia-refined-preview.png'});
  await page.locator('#saintPreviewCard').click();
  await page.locator('#donorSaintModal').waitFor({state:'visible'});
  await page.getByRole('button',{name:'Close saint life',exact:true}).click();

  await page.setViewportSize({width:320,height:1100});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
  await page.locator('#saintPreviewCard').waitFor({state:'visible'});
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
