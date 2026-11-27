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
  let startedFamily = null;
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
      else if (url.pathname === '/api/donor/bookstore' && !activeParish.bookstoreEnabled)
        payload = { available: false, products: [], orders: [] };
      else if (url.pathname === '/api/directory/self/start-profile') {
        startedFamily = route.request().postDataJSON();
        return route.fulfill({ status: 201, json: { ok: true } });
      } else if (url.pathname === '/api/directory/self/profile' && startedFamily) {
        payload = {
          profile: {
            claimed: true,
            profile: { person: { id: 'private-person', preferredName: startedFamily.preferredName, version: 1 } },
            pendingRequests: [{ requestType: 'person_profile_review', status: 'pending', summary: 'New profile' }],
          },
        };
      }
      return route.fulfill({ json: payload });
    }
    let filename = url.pathname;
    if (filename === '/myagapay' || filename === '/myagapay/') filename = '/myagapay/parish-life.html';
    else if (filename === '/myagapay/giving') filename = '/myagapay/index.html';
    else if (filename === '/myagapay/calendar') filename = '/myagapay/giving/calendar.html';
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
    assert.equal(await page.locator('[data-app-church-name]').getAttribute('title'), 'Test Parish, Chicago, IL', route);
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
    assert.equal(
      await page.locator('.app-page-header [data-myagapay-app-menu] a[href="/myagapay/learn"]').count(),
      0,
      route
    );
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
  assert.equal(
    await page.locator('[data-app-church-name]').getAttribute('title'),
    'Saints Peter and Paul Orthodox Church, Madison, WI'
  );
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    const name = page.locator('[data-app-church-name]');
    assert.ok(await name.evaluate((el) => getComputedStyle(el).whiteSpace === 'nowrap'));
    assert.ok(await page.locator('.app-header-bar').evaluate((el) => el.scrollWidth <= el.clientWidth));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('https://agapay.test/myagapay');
  await page.locator('.app-home-header').waitFor();
  await page.locator('.refined-liturgical-hero').waitFor();
  const tabs = page.locator('nav.my-agapay-tabbar a');
  await page.getByRole('link', { name: 'Directory', exact: true }).last().waitFor();
  assert.deepEqual(await tabs.locator('span').allTextContents(), [
    'Home',
    'Giving',
    'Bookstore',
    'Directory',
    'Account',
  ]);
  assert.equal(await tabs.first().getAttribute('aria-current'), 'page');
  assert.equal(await tabs.first().locator('path').first().getAttribute('d'), 'M3 11l9-8 9 8');
  assert.equal(await tabs.nth(1).locator('svg circle').getAttribute('r'), '9');
  assert.match(
    await page.locator('.refined-liturgical-hero').evaluate((el) => getComputedStyle(el).backgroundImage),
    /parish-chandelier/
  );
  const homeGive = page.locator('.refined-liturgical-hero #todayGiveLink');
  assert.equal(await homeGive.getAttribute('href'), '/myagapay/giving');
  assert.equal(await homeGive.locator('svg').innerHTML(), await tabs.nth(1).locator('svg').innerHTML());
  assert.equal(
    await homeGive.evaluate((link) => link.offsetWidth),
    await homeGive.locator('..').evaluate((row) => row.clientWidth)
  );
  assert.equal(await homeGive.evaluate((link) => getComputedStyle(link).borderTopLeftRadius), '999px');
  assert.equal(await homeGive.evaluate((link) => link.offsetHeight), 40);
  await homeGive.click();
  await page.waitForURL('**/myagapay/giving');
  await page.locator('#greeting').waitFor();
  assert.equal(await page.locator('.app-page-header').count(), 0, 'Give homepage is excluded');
  const manifest = JSON.parse(
    await readFile(new URL('../public/myagapay/manifest.webmanifest', import.meta.url), 'utf8')
  );
  const homeTab = page.locator('nav.my-agapay-tabbar a').filter({ hasText: /^Home$/ });
  assert.ok((await homeTab.getAttribute('href')).startsWith(manifest.scope));
  assert.ok(manifest.shortcuts.every(({ url }) => url.startsWith(manifest.scope)));
  await homeTab.click();
  await page.waitForURL('**/myagapay/');
  await page.locator('.app-home-header').waitFor();
  await page.locator('.app-header-menu-button').click();
  const homeMenu = page.locator('.app-home-header [data-myagapay-app-menu]');
  const givingLink = homeMenu.getByRole('link', { name: 'Giving', exact: true });
  assert.equal(await givingLink.locator('svg').innerHTML(), await tabs.nth(1).locator('svg').innerHTML());
  const sacramentsLink = homeMenu.getByRole('link', { name: 'Sacraments & Services', exact: true });
  const chalice = await sacramentsLink.locator('svg path').getAttribute('d');
  assert.equal(chalice, 'M5 4h14v3a7 7 0 0 1-14 0V4Zm7 10v6m-5 1h10M6 7h12');
  assert.equal(
    await page.locator('#koinoniaShortcuts a[href="/myagapay/sacraments"] svg path').getAttribute('d'),
    chalice
  );
  assert.equal(await tabs.locator('[href="/myagapay/sacraments"]').count(), 0);
  const historyLink = homeMenu.getByRole('link', { name: 'Giving History', exact: true });
  assert.equal(
    await historyLink.locator('svg path').first().getAttribute('d'),
    'M5 3l2 1.5L9 3l3 1.5L15 3l2 1.5L19 3v18l-2-1.5L15 21l-3-1.5L9 21l-2-1.5L5 21z'
  );
  const calendarLink = homeMenu.getByRole('link', { name: 'Calendar', exact: true });
  assert.equal(await calendarLink.getAttribute('href'), '/myagapay/calendar');
  assert.equal(await calendarLink.locator('svg rect').count(), 1);
  await page.keyboard.press('Escape');
  await tabs.last().click();
  await page.waitForURL('**/myagapay/account');
  assert.equal(await tabs.last().getAttribute('aria-current'), 'page');
  activeParish = { ...secondParish, bookstoreEnabled: false, directoryEnabled: false, libraryEnabled: false };
  await page.goto('https://agapay.test/myagapay/');
  const fixedTabs = page.locator('nav.my-agapay-tabbar[aria-label="My AGAPAY navigation"]');
  await fixedTabs.getByRole('link', { name: 'Directory' }).waitFor();
  assert.deepEqual(await fixedTabs.locator(':scope > a > span').allTextContents(), [
    'Home',
    'Giving',
    'Bookstore',
    'Directory',
    'Account',
  ]);
  await fixedTabs.getByRole('link', { name: 'Bookstore' }).click();
  await page.waitForURL('**/myagapay/bookstore');
  await page
    .locator('#bookstoreUnavailableNotice')
    .getByText(/hasn't activated Bookstore Payments/)
    .waitFor();
  assert.equal(await page.getByRole('button', { name: 'Scan book barcode' }).isVisible(), false);
  await fixedTabs.getByRole('link', { name: 'Directory' }).click();
  await page.waitForURL('**/myagapay/directory');
  await page.getByRole('heading', { name: 'Directory is unavailable' }).waitFor();
  assert.equal(await page.locator('#memberDirectory').isVisible(), false);
  await page.getByRole('button', { name: 'Set up family information' }).click();
  const setup = page.getByRole('dialog', { name: 'Create your parish directory profile' });
  await setup.getByLabel('Name you go by').fill('New Member');
  await setup.getByLabel('Family or household name').fill('New Member Household');
  await setup.getByRole('button', { name: 'Create my private profile' }).click();
  await page
    .locator('#directoryNotice')
    .getByText(/private profile is ready/)
    .waitFor();
  assert.equal(startedFamily.parishId, secondParish.id);
  assert.equal(startedFamily.householdName, 'New Member Household');
  await fixedTabs.getByRole('link', { name: 'Account' }).click();
  await page.getByRole('link', { name: 'Edit family information' }).click();
  await page.waitForURL('**/myagapay/directory?view=family');
  assert.equal(await page.getByRole('tab', { name: 'Family Information' }).getAttribute('aria-selected'), 'true');
  activeParish = secondParish;
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
