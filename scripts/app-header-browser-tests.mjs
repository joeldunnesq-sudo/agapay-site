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
  let koinoniaApprovalRequired = false;
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
      if (url.pathname === '/api/donor/koinonia-access' && koinoniaApprovalRequired)
        return route.fulfill({ status: 403, json: { code: 'household_verification_required' } });
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
      Object.defineProperty(navigator, 'standalone', {
        value: sessionStorage.getItem('fixture-browser-tab') !== '1',
      });
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
  await page.evaluate(() => sessionStorage.setItem('fixture-browser-tab', '1'));
  await page.goto('https://agapay.test/myagapay');
  await page.locator('.app-home-header').waitFor();
  await page.locator('.refined-liturgical-hero').waitFor();
  const homeBar = page.locator('.app-home-header .app-header-bar');
  assert.match(await page.locator('meta[name="viewport"]').getAttribute('content'), /viewport-fit=cover/);
  for (const width of [390, 402, 448, 540, 756]) {
    await page.setViewportSize({ width, height: 844 });
    const bar = await homeBar.boundingBox();
    assert.equal(bar.x, 0, `Home header should start at the left edge at ${width}px`);
    assert.equal(bar.width, width, `Home header should span the viewport at ${width}px`);
    assert.equal(bar.y, 0, `Home header should start at the top edge at ${width}px`);
  }
  const homeDevtools = await context.newCDPSession(page);
  const homeBrand = homeBar.locator('.app-header-brand');
  const homeMenuButton = homeBar.getByRole('button', { name: 'Open My AGAPAY navigation' });
  const homeSafeAreaMenu = page.locator('.app-home-header [data-myagapay-app-menu]');
  try {
    await page.setViewportSize({ width: 402, height: 874 });
    await homeDevtools.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 62, bottom: 34 } });
    assert.equal(await homeBar.evaluate((el) => getComputedStyle(el).paddingTop), '72px');
    const browserBar = await homeBar.boundingBox();
    await page.evaluate(() => sessionStorage.removeItem('fixture-browser-tab'));
    await page.reload();
    await homeBar.waitFor();
    const bar = await homeBar.boundingBox();
    assert.equal(bar.y, 0, 'The Home bar background should cover the status area');
    // The iOS portrait overlay can extend to about 112px from the top of the screen.
    assert.ok((await homeBrand.boundingBox()).y >= 112, 'The Home brand should clear the portrait overlay');
    assert.ok(
      (await homeBar.locator('[data-app-switch-church]').boundingBox()).y >= 112,
      'The church switcher should clear the portrait overlay'
    );
    assert.ok((await homeMenuButton.boundingBox()).y >= 112, 'The menu button should clear the portrait overlay');

    await homeMenuButton.click();
    await homeSafeAreaMenu.waitFor({ state: 'visible' });
    assert.ok(
      (await homeSafeAreaMenu.boundingBox()).y >= bar.y + bar.height,
      'The menu should open below the taller bar'
    );
    await page.keyboard.press('Escape');

    await page.setViewportSize({ width: 756, height: 352 });
    await homeDevtools.send('Emulation.setSafeAreaInsetsOverride', { insets: { left: 62, right: 62, bottom: 21 } });
    const brand = await homeBrand.boundingBox();
    const menuButton = await homeMenuButton.boundingBox();
    const landscapeBar = await homeBar.boundingBox();
    assert.ok(brand.x >= 62, 'The Home brand should clear the landscape cutout');
    assert.ok(menuButton.x + menuButton.width <= 756 - 62, 'The Home menu button should clear the landscape cutout');
    assert.equal(landscapeBar.width, 756, 'The landscape bar background should span the viewport');
    assert.equal(landscapeBar.height, browserBar.height - 62, 'Landscape should use the compact bar');
    await homeMenuButton.click();
    await homeSafeAreaMenu.waitFor({ state: 'visible' });
    const landscapeMenu = await homeSafeAreaMenu.boundingBox();
    assert.ok(landscapeMenu.y >= landscapeBar.y + landscapeBar.height, 'The landscape menu should open below the bar');
    assert.ok(landscapeMenu.x + landscapeMenu.width <= 756 - 62, 'The landscape menu should clear the cutout');
    await page.keyboard.press('Escape');
  } finally {
    await homeDevtools.send('Emulation.setSafeAreaInsetsOverride', { insets: {} });
    await homeDevtools.detach();
    await page.setViewportSize({ width: 390, height: 844 });
  }
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
  await page.locator('.app-page-header [data-app-church-name]').getByText(activeParish.name, { exact: true }).waitFor();
  assert.equal(await page.locator('.app-giving-header [data-app-page-title]').count(), 0);
  assert.equal(await page.getByRole('link', { name: /^Make (an )?Offering$/i }).count(), 0);
  for (const id of ['#quickGiveCampaigns', '#desktopQuickCampaigns']) {
    assert.equal(
      await page
        .locator(id)
        .evaluate((tile) => tile.closest('section').nextElementSibling.querySelector('h2').textContent),
      'Next Festal Offering'
    );
  }
  assert.equal(await page.locator('.metric-year .summary-watermark[src="/mark.png"]').count(), 2);
  const inactiveTile = page.locator('#quickGiveCampaigns[aria-disabled="true"]');
  await inactiveTile.waitFor();
  assert.equal(await inactiveTile.getAttribute('href'), null);
  assert.equal(await page.locator('#greeting + #donorParishName').count(), 0);
  assert.equal(await page.getByRole('heading', { name: 'Active Campaigns' }).count(), 0);
  activeParish = {
    ...activeParish,
    campaigns: [{ id: 'active-restoration', name: 'Roof Restoration', status: 'active' }],
  };
  await page.reload();
  await page.getByRole('heading', { name: 'Roof Restoration' }).waitFor();
  activeParish = {
    ...activeParish,
    campaigns: [{ id: 'active-restoration', name: 'Roof Restoration', status: 'ended' }],
  };
  await page.reload();
  await page.locator('.app-page-header [data-app-church-name]').getByText(activeParish.name, { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Active Campaigns' }).count(), 0);
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

  activeParish = {
    ...secondParish,
    communicationsEnabled: false,
    signupsEnabled: false,
    exchangeEnabled: false,
    prayerRequestsEnabled: false,
    directoryEnabled: false,
    sacramentsEnabled: false,
  };
  await page.goto('https://agapay.test/myagapay/');
  const shortcuts = page.getByRole('navigation', { name: 'Community tools' });
  const availability = page.locator('#koinoniaShortcutDialog');
  for (const name of [
    'Parish Signups',
    'Parish Exchange',
    'Prayer Requests',
    'Browse Ministries',
    'Parish Directory',
    'Sacraments & Services',
  ]) {
    const shortcut = shortcuts.getByRole('button', { name, exact: true });
    await shortcut.click();
    assert.equal(await availability.getByRole('heading', { name, exact: true }).isVisible(), true);
    assert.match(await availability.textContent(), /Your parish needs to enable this feature/);
    await availability.getByRole('button', { name: 'OK', exact: true }).click();
    assert.equal(await availability.isVisible(), false);
    assert.ok(await shortcut.evaluate((button) => document.activeElement === button));
  }
  assert.equal(page.url(), 'https://agapay.test/myagapay/');

  activeParish = secondParish;
  koinoniaApprovalRequired = true;
  await page.reload();
  await shortcuts.getByRole('button', { name: 'Parish Signups', exact: true }).click();
  assert.match(await availability.textContent(), /Your parish needs to approve your membership/);
  await page.keyboard.press('Escape');
  assert.equal(await availability.isVisible(), false);
  koinoniaApprovalRequired = false;

  activeParish = { ...secondParish, bookstoreEnabled: false, directoryEnabled: false, libraryEnabled: false };
  await page.goto('https://agapay.test/myagapay/');
  assert.equal(
    await shortcuts.getByRole('link', { name: 'Parish Exchange', exact: true }).getAttribute('href'),
    '/myagapay/exchange'
  );
  await shortcuts.getByRole('button', { name: 'Parish Directory', exact: true }).click();
  assert.match(await availability.textContent(), /Your parish needs to enable this feature/);
  await availability.getByRole('button', { name: 'OK', exact: true }).click();
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
  await page.getByRole('button', { name: 'Create a new household' }).click();
  const setup = page.locator('#startProfileForm');
  await setup.getByLabel('Name you go by').fill('New Member');
  await setup.getByLabel('Family or household name').fill('New Member Household');
  await setup.getByRole('button', { name: 'Create my private profile' }).click();
  await page
    .locator('#directoryNotice')
    .getByText(/private draft is ready/)
    .waitFor();
  assert.equal(startedFamily.parishId, secondParish.id);
  assert.equal(startedFamily.householdName, 'New Member Household');
  await fixedTabs.getByRole('link', { name: 'Account' }).click();
  await page.getByRole('link', { name: 'Manage household' }).click();
  await page.waitForURL('**/myagapay/directory?view=household');
  await page.locator('#personalDirectorySettings[open]').waitFor();
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
    'PASS - shared app headers, parish identity, switch failure/retry/reload, responsive layout, and Giving campaign visibility'
  );
} finally {
  await browser.close();
}
