import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { captureBrowserErrors } from './lib/browser-error-gate.mjs';

const parish = {
  id: 'test-parish',
  name: 'Test Parish',
  liturgicalCalendar: 'julian',
  city: 'Chicago',
  state: 'IL',
  bookstoreEnabled: true,
  sacramentsEnabled: true,
  libraryEnabled: true,
  directoryEnabled: true,
  signupsEnabled: true,
  exchangeEnabled: true,
  prayerRequestsEnabled: true,
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
  let activeParish = parish;
  let rejectSwitch = false;
  const secondParish = {
    ...parish,
    id: 'second-parish',
    name: 'Saints Peter and Paul Orthodox Church',
    city: 'Madison',
    state: 'WI',
  };
  // All traffic is fulfilled locally, including API and external resources.
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'agapay.test') return route.fulfill({ status: 204, body: '' });
    if (url.pathname.startsWith('/api/')) {
      let payload = {
        available: true,
        items: [],
        groups: [],
        events: [],
        requests: [],
        listings: [],
        members: [],
        resources: [],
        announcements: [],
        recordings: [],
        videos: [],
        posts: [],
      };
      if (url.pathname === '/api/parishes') return route.fulfill({ json: { parishes: [parish, secondParish] } });
      if (url.pathname === '/api/donor/dashboard') {
        if (route.request().method() === 'PATCH') {
          if (rejectSwitch) return route.fulfill({ status: 503, json: { error: 'Please try again.' } });
          activeParish = secondParish;
        }
        payload = {
          donor: { ...donor, defaultParishId: activeParish.id, defaultParish: activeParish },
          parish: activeParish,
        };
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

  const routes = [
    'bookstore',
    'parish-life',
    'giving/calendar',
    'account',
    'directory',
    'events',
    'exchange',
    'feed',
    'groups',
    'library',
    'media',
    'news',
    'prayer-requests',
    'sacraments',
    'signups',
    'teaching',
    'watch',
    'giving/history',
    'giving/give',
  ];
  for (const route of routes) {
    await page.goto('https://agapay.test/myagapay/' + route);
    await page.locator('.app-page-header').waitFor();
    await page.waitForFunction(() => document.querySelector('[data-app-church-name]')?.textContent === 'Test Parish');
    assert.equal(await page.locator('.app-page-header').count(), 1, route);
    assert.equal(await page.locator('[data-app-church-location]').textContent(), 'Chicago, IL', route);
    // This fixture has no directory household; dismiss its first-run wizard before testing navigation.
    if (route === 'directory')
      await page.evaluate(() => {
        const modal = document.getElementById('setupWizardModal');
        if (modal) modal.style.display = 'none';
      });
    const toggle = page.locator('.app-header-menu-button');
    await toggle.click();
    await page.locator('.app-page-header [data-myagapay-app-menu]').waitFor({ state: 'visible' });
    assert.ok((await page.locator('.app-page-header [data-myagapay-app-menu] a').count()) >= 4, route);
    assert.equal(await page.locator('.app-page-header [data-myagapay-app-menu] a[href="/myagapay/learn"]').count(), 0, route);
    await page.keyboard.press('Escape');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false', route);
    const headerFits = await page.locator('.app-page-header').evaluate((el) => el.scrollWidth <= innerWidth);
    assert.ok(headerFits, route + ' header overflow');
  }
  await page.goto('https://agapay.test/myagapay/giving/calendar');
  await page.locator('[data-app-switch-church]').click();
  await page.getByRole('button', { name: /Saints Peter and Paul Orthodox Church/ }).waitFor();
  rejectSwitch = true;
  await page.getByRole('button', { name: /Saints Peter and Paul Orthodox Church/ }).click();
  await page.waitForFunction(
    () => document.querySelector('.app-church-dialog [role=status]')?.textContent === 'Please try again.'
  );
  assert.equal(await page.locator('[data-app-church-name]').textContent(), 'Test Parish');
  rejectSwitch = false;
  await page.getByRole('button', { name: /Saints Peter and Paul Orthodox Church/ }).click();
  await page.waitForFunction(
    () => document.querySelector('[data-app-church-name]')?.textContent === 'Saints Peter and Paul Orthodox Church'
  );
  assert.equal(await page.locator('[data-app-church-location]').textContent(), 'Madison, WI');
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    const copy = page.locator('.app-header-parish-copy');
    assert.ok(
      await copy.evaluate((el) => {
        const name = el.querySelector('[data-app-church-name]'),
          place = el.querySelector('[data-app-church-location]');
        return (
          getComputedStyle(name).whiteSpace === 'nowrap' &&
          place.getBoundingClientRect().top >= name.getBoundingClientRect().bottom
        );
      })
    );
  }
  await page.goto('https://agapay.test/myagapay/index');
  assert.equal(await page.locator('.app-page-header').count(), 0, 'Give homepage is excluded');
  await page.goto('https://agapay.test/myagapay/giving/calendar');
  await page.locator('.app-header-menu-button').click();
  await page.locator('.app-page-header [data-app-support]').click();
  await page.locator('#myAgapaySupportDialog').waitFor({ state: 'visible' });
  await page.locator('[data-myagapay-support-close]').first().click();
  await page.locator('.app-header-menu-button').click();
  await page.locator('.app-page-header [data-app-log-out]').click();
  await page.waitForURL('**/myagapay/login');
  assert.equal(await page.evaluate(() => localStorage.getItem('agapayDonorToken')), null);
  errors.assertClean();
  console.log(
    'PASS - 19 app headers, shared menus, parish identity, switch failure/retry/reload, responsive layout, and Give homepage exclusion'
  );
} finally {
  await browser.close();
}
