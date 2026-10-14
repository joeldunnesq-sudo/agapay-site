import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const script = await readFile(new URL('../public/myagapay/signups.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../public/myagapay/signups.html', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
const errors = [];
const sheet = {
  id: 'sheet-1',
  title: '<Meals & service>',
  ministryName: '<Ministry>',
  description: '<Bring a meal>',
  category: 'meal_train',
  status: 'open',
  slotCount: 3,
  openingCount: 1,
  unreadSlotCount: 2,
};
const slots = [
  {
    id: 'open-1',
    label: '<Meal & help>',
    notes: '<Notes>',
    filledCount: 0,
    neededCount: 1,
    slotDate: null,
    read: false,
    entries: [],
  },
  {
    id: 'full-2',
    label: 'Full slot',
    filledCount: 1,
    neededCount: 1,
    slotDate: 0,
    read: true,
    entries: [{ id: 'other', personName: '<Other member>', mine: false, comment: '<Comment>' }],
  },
  {
    id: 'mine-3',
    label: 'My slot',
    filledCount: 1,
    neededCount: 2,
    slotDate: null,
    read: false,
    entries: [
      {
        id: 'mine-entry',
        personName: 'Owner',
        mine: true,
        comment: 'Vegetable meal',
        coverageNote: 'Existing note',
        coverageRequested: true,
      },
    ],
  },
];

async function fixture(options = {}, search = '') {
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(
    ({ sheet, slots, options }) => {
      window.calls = [];
      window.scenario = { listStatus: 200, actionStatus: 200, detailStatus: 200, ...options };
      window.signupSheet = structuredClone(sheet);
      window.signupSlots = structuredClone(slots);
      window.MyAgapayShell = {
        authHeaders: (extra) => ({ ...extra, Authorization: 'Bearer fixture-session' }),
        handleUnauthorized: (response) => response.status === 401,
        setFeedUnreadCount() {},
      };
      window.fetch = async (url, options = {}) => {
        window.calls.push({ url, options });
        const scenario = window.scenario;
        if (url.includes('/community-tools/')) return new Response('{}');
        if (options.method === 'POST') {
          if (url.endsWith('/read')) return new Response('{}', { status: scenario.readFailure ? 503 : 200 });
          if (scenario.actionNetworkError) throw new Error('Action network failed');
          if (scenario.actionStatus !== 200)
            return new Response(JSON.stringify({ error: 'Action unavailable' }), { status: scenario.actionStatus });
          const id = decodeURIComponent(url.split('/').at(-2));
          if (url.endsWith('/claim')) {
            const slot = window.signupSlots.find((slot) => slot.id === id);
            slot.entries.push({
              id: 'claimed-entry',
              personName: 'Member',
              mine: true,
              comment: JSON.parse(options.body).comment,
            });
            slot.filledCount++;
          }
          if (url.endsWith('/cancel'))
            for (const slot of window.signupSlots) slot.entries = slot.entries.filter((entry) => entry.id !== id);
          if (url.endsWith('/coverage'))
            for (const slot of window.signupSlots) {
              const entry = slot.entries.find((entry) => entry.id === id);
              if (entry) {
                entry.coverageRequested = true;
                entry.coverageNote = JSON.parse(options.body).note;
              }
            }
          return new Response('{}');
        }
        if (url.endsWith('/signups')) {
          if (scenario.listNetworkError) throw new Error('List network failed');
          return new Response(
            scenario.malformed
              ? '{'
              : JSON.stringify({
                  sheets: scenario.empty ? [] : [window.signupSheet],
                  ministries: [{ id: 'ministry-1', name: '<Ministry>' }],
                  error: 'List unavailable',
                }),
            { status: scenario.listStatus }
          );
        }
        return new Response(
          JSON.stringify({
            sheet: window.signupSheet,
            slots: scenario.noSlots ? [] : window.signupSlots,
            error: 'Detail unavailable',
          }),
          { status: scenario.detailStatus }
        );
      };
    },
    { sheet, slots, options }
  );
  await page.route('**/*', (route) => {
    if (route.request().isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: html });
    if (new URL(route.request().url()).pathname === '/myagapay/signups.js')
      return route.fulfill({ contentType: 'application/javascript', body: script });
    return route.fulfill({
      contentType: route.request().resourceType() === 'script' ? 'application/javascript' : 'text/plain',
      body: '',
    });
  });
  await page.goto(`https://agapay.test/myagapay/signups${search}`);
  await page.waitForFunction(() => window.calls.length >= 2);
  return page;
}
const slotCard = (page, label) =>
  page.locator('.signup-slot-card').filter({ has: page.locator('h3', { hasText: label }) });

try {
  let page = await fixture({ readFailure: true }, '?sheet=sheet-1&keep=yes#slots');
  await page.waitForFunction(
    () => signupsState.activeSheetId === 'sheet-1' && signupsState.sheets[0].unreadSlotCount === 0
  );
  assert.equal(await page.locator('.signup-sheet-card strong').textContent(), sheet.title);
  assert.equal(await page.locator('#signupDetail h2').textContent(), sheet.title);
  assert.equal(await slotCard(page, '<Meal & help>').locator('p').textContent(), '<Notes>');
  assert.equal(await slotCard(page, 'Full slot').locator('li strong').textContent(), '<Other member>');
  assert.equal(await slotCard(page, 'My slot').locator('li strong').textContent(), 'You');
  assert.equal(await slotCard(page, 'My slot').getByRole('button', { name: 'Claim this slot' }).count(), 0);
  assert.equal(await slotCard(page, 'Full slot').getByRole('button', { name: 'Join waitlist' }).count(), 1);
  assert.equal(await page.evaluate(() => document.body.classList.contains('is-koinonia-detail-open')), true);
  assert.equal(await page.evaluate(() => requestedSignupSheetId), '');
  assert.equal(
    await page.locator('.signup-sheet-card b').count(),
    0,
    'Existing read-receipt failure fallback still clears the displayed sheet badge'
  );
  assert.equal(await page.evaluate(() => window.calls.filter((call) => call.url.endsWith('/read')).length), 2);
  assert.equal(new URL(page.url()).searchParams.get('keep'), 'yes');
  assert.equal(new URL(page.url()).hash, '#slots');
  assert.equal(await page.evaluate(() => signupsDate(null)), 'Flexible date');
  assert.equal(await page.evaluate(() => signupsDate('bad')), 'Date to be confirmed');
  assert.equal(await page.evaluate(() => signupCategoryLabel('unknown')), 'General');
  for (const call of await page.evaluate(() => window.calls)) {
    assert.equal(call.options.cache, 'no-store');
    assert.equal(call.options.headers.Authorization, 'Bearer fixture-session');
  }
  await slotCard(page, '<Meal & help>').getByRole('button', { name: 'Claim this slot' }).click();
  assert.equal(await page.locator('#signupActionTitle').textContent(), 'Claim <Meal & help>');
  assert.equal(await page.locator('#signupActionText').evaluate((el) => el.required), false);
  await page.waitForFunction(() => document.activeElement.id === 'signupActionText');
  await page.locator('#signupActionText').fill('Vegetable lasagna');
  await page.evaluate(() => {
    window.scenario.actionStatus = 409;
  });
  await page.locator('#signupActionSubmit').click();
  await page.waitForFunction(() => document.getElementById('signupsStatus').textContent === 'Action unavailable');
  assert.equal(await page.locator('#signupActionDialog').evaluate((el) => el.open), true);
  assert.equal(await page.locator('#signupActionText').inputValue(), 'Vegetable lasagna');
  assert.equal(await page.locator('#signupActionSubmit').isEnabled(), true);
  await page.evaluate(() => {
    window.scenario.actionStatus = 200;
  });
  await page.locator('#signupActionSubmit').click();
  await page.waitForFunction(() => !document.getElementById('signupActionDialog').open);
  assert.match(await page.locator('#signupsStatus').textContent(), /You’re signed up/);
  assert.equal(await slotCard(page, '<Meal & help>').locator('li small').textContent(), 'Vegetable lasagna');
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(window.calls.find((call) => call.url.endsWith('/claim')).options.body)),
    { comment: 'Vegetable lasagna' }
  );
  await slotCard(page, 'My slot').getByRole('button', { name: 'Update request' }).click();
  assert.equal(await page.locator('#signupActionText').inputValue(), 'Existing note');
  assert.equal(await page.locator('#signupActionText').evaluate((el) => el.required && el.minLength === 5), true);
  const priorCalls = await page.evaluate(() => window.calls.length);
  await page.locator('#signupActionText').fill('');
  await page.locator('#signupActionSubmit').click();
  assert.equal(await page.evaluate(() => window.calls.length), priorCalls, 'Invalid coverage note makes no request');
  await page.locator('#signupActionText').fill('Away this week');
  await page.evaluate(() => {
    window.scenario.actionNetworkError = true;
  });
  await page.locator('#signupActionSubmit').click();
  await page.waitForFunction(() => document.getElementById('signupsStatus').textContent === 'Action network failed');
  assert.equal(await page.locator('#signupActionDialog').evaluate((el) => el.open), true);
  await page.evaluate(() => {
    window.scenario.actionNetworkError = false;
  });
  await page.locator('#signupActionSubmit').click();
  await page.waitForFunction(() => !document.getElementById('signupActionDialog').open);
  const coverage = await page.evaluate(() => window.calls.filter((call) => call.url.endsWith('/coverage')).at(-1));
  assert.deepEqual(JSON.parse(coverage.options.body), { note: 'Away this week' });
  assert.match(await page.locator('#signupsStatus').textContent(), /assigned ministry team/);
  await page.evaluate(() => joinSignupWaitlist('full-2'));
  assert.match(await page.locator('#signupsStatus').textContent(), /on the waitlist/);
  await page.evaluate(() => cancelSignupEntry('claimed-entry'));
  assert.match(await page.locator('#signupsStatus').textContent(), /cancelled/);
  assert.equal(await slotCard(page, '<Meal & help>').locator('li').count(), 0);
  await page.evaluate(() => closeSignupSheet());
  assert.equal(new URL(page.url()).searchParams.has('sheet'), false);
  assert.equal(new URL(page.url()).searchParams.get('keep'), 'yes');
  assert.equal(await page.evaluate(() => document.body.classList.contains('is-koinonia-detail-open')), false);
  const count = await page.evaluate(() => window.calls.filter((call) => call.url.includes('/signups/sheet-1')).length);
  await page.evaluate(() => loadSignups());
  assert.equal(
    await page.evaluate(() => window.calls.filter((call) => call.url.includes('/signups/sheet-1')).length),
    count,
    'Consumed deep links do not reopen on refresh'
  );
  await page.evaluate(() => {
    const dialog = document.getElementById('signupActionDialog');
    dialog.showModal = undefined;
    dialog.close = undefined;
    openSignupClaimModal('open-1');
  });
  assert.equal(await page.locator('#signupActionDialog').getAttribute('open'), '');
  await page.evaluate(() => closeSignupActionModal());
  assert.equal(await page.locator('#signupActionDialog').getAttribute('open'), null);
  await page.evaluate(() => {
    document.body.replaceChildren();
    renderSignupSheets();
    renderSignupDetail(signupsState.sheets[0], []);
    populateSignupMinistries();
    openSignupClaimModal('missing');
    closeSignupActionModal();
    signupStatus('safe');
  });
  await page.close();
  for (const [options, expected] of [
    [{ empty: true }, 'No signup sheets yet'],
    [{ malformed: true }, 'No signup sheets yet'],
    [{ listStatus: 403 }, 'List unavailable'],
    [{ listNetworkError: true }, 'List network failed'],
  ]) {
    page = await fixture(options);
    assert.match(
      await page
        .locator(options.listStatus || options.listNetworkError ? '#signupsStatus' : '#signupSheets')
        .textContent(),
      new RegExp(expected)
    );
    await page.close();
  }
  page = await fixture({ detailStatus: 403 }, '?sheet=sheet-1');
  await page.waitForFunction(() => document.getElementById('signupsStatus').textContent === 'Detail unavailable');
  assert.equal(await page.evaluate(() => signupsState.activeSheetId), '');
  await page.close();
  page = await fixture({ listStatus: 401 });
  assert.equal(await page.locator('.signup-sheet-card').count(), 0);
  assert.equal(await page.evaluate(() => signupsFetch('/api/donor/koinonia/signups')), null);
  await page.close();
  assert.deepEqual(errors, []);
  console.log(
    'PASS - signup deep links, escaped sheets/slots, read fallback, claim conflict/retry, coverage validation/retry, waitlist, cancellation, URL preservation, auth and native/fallback dialogs'
  );
} finally {
  await browser.close();
}
