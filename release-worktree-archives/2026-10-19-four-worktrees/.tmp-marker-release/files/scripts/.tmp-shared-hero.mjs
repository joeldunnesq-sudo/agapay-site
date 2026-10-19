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


  for (const width of [320, 412, 1280]) {
    const appearances=[];
    await page.setViewportSize({width,height:1100});
    for (const route of ['parish-life','calendar']) {
      await page.goto('https://agapay.test/myagapay/'+route);
      await assertReadings();
      assert.match(await page.locator('#saintPreviewCard').textContent(), /Hagiography/);
      appearances.push(await page.locator('.refined-liturgical-hero').evaluate(hero => {
        const selectors=['.cal-date-badge','.cal-date-day','.cal-date-calendar','.cal-today-title','.cal-today-note','.cal-reading-line:not(.is-heading)','.cal-reading-line.is-heading','#saintPreviewCard'];
        return selectors.map(selector=>{const s=getComputedStyle(hero.querySelector(selector));return [selector,...['color','backgroundColor','fontSize','fontFamily','lineHeight','padding','borderRadius'].map(key=>s[key])];});
      }));
      if(width===412)await page.locator('.refined-liturgical-hero').screenshot({path:'../.tmp-refined-'+route+'.png'});
      await page.locator('#todayFeastTitle').evaluate(el=>el.textContent='Holy Martyrs Sophia and her daughters Faith, Hope, and Love; Saint Eumenius, Bishop of Gortyna; and the Venerable Fathers');
      assert.ok(await page.locator('#todayFeastTitle').evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);const b=document.getElementById('todayChurchDateBadge').getBoundingClientRect();return [...r.getClientRects()].every(t=>t.right<=b.left || t.top>=b.bottom || t.bottom<=b.top) && document.documentElement.scrollWidth<=innerWidth;}));
      await page.locator('#saintPreviewCard').click();
      await page.locator('#donorSaintModal').waitFor({state:'visible'});
      await page.getByRole('button',{name:'Close saint life',exact:true}).click();
      await page.locator('#todayChurchDateBadge').evaluate(el=>el.hidden=true);
      assert.equal(await page.locator('#todayFeastTitle').evaluate(el=>getComputedStyle(el).paddingRight),'0px');
    }
    assert.deepEqual(appearances[0],appearances[1]);
  }
  console.log('PASS - shared hero styling, long headings, Julian marker visibility, and Hagiography at 320/412/1280px');
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
