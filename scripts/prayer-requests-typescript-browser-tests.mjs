import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const script = await readFile(new URL('../public/myagapay/prayer-requests.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../public/myagapay/prayer-requests.html', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
const errors = [];
const now = Date.UTC(2026, 9, 14, 12);
const base = {
  requesterName: '<Member & name>',
  createdAt: now,
  visibility: 'parish_members',
  anonymous: false,
  mine: false,
  prayedByMe: false,
  prayerCount: 1,
};
const requests = [
  { ...base, id: 'public-1', body: '<Please pray & care>', status: 'active' },
  { ...base, id: 'mine-2', body: 'My community request', status: 'active', mine: true, anonymous: true },
  { ...base, id: 'private-3', body: 'My private request', status: 'active', mine: true, visibility: 'clergy_only' },
  {
    ...base,
    id: 'answered-4',
    body: 'Answered community request',
    status: 'answered',
    anonymous: true,
    requesterName: 'Anonymous',
  },
  { ...base, id: 'pending-5', body: 'My pending request', status: 'pending', mine: true },
  {
    ...base,
    id: 'declined-6',
    body: 'My declined request',
    status: 'declined',
    mine: true,
    declineReason: '<Parish response>',
  },
  { ...base, id: 'flagged-7', body: 'My flagged request', status: 'flagged', mine: true },
];

async function fixture(options = {}) {
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date(now));
  await page.addInitScript(
    ({ requests, options }) => {
      window.calls = [];
      window.scenario = {
        listStatus: 200,
        actionStatus: 200,
        allowAnonymous: true,
        approvalRequired: true,
        ...options,
      };
      window.requests = structuredClone(requests);
      window.MyAgapayShell = {
        authHeaders: (extra) => ({ ...extra, Authorization: 'Bearer fixture-session' }),
        handleUnauthorized: (response) => response.status === 401,
        setFeedUnreadCount() {},
      };
      window.confirm = () => window.scenario.confirm !== false;
      window.fetch = async (url, options = {}) => {
        window.calls.push({ url, options });
        const scenario = window.scenario;
        if (url.includes('/community-tools/')) return new Response('{}');
        if (!options.method) {
          if (scenario.listNetworkError) throw new Error('List network failed');
          const rows = scenario.empty
            ? []
            : url.includes('?mine=1')
              ? window.requests.filter((row) => row.mine)
              : window.requests;
          return new Response(
            scenario.malformed
              ? '{'
              : JSON.stringify({
                  requests: rows,
                  settings: { allowAnonymous: scenario.allowAnonymous, pastoralNotice: '<Pastoral notice>' },
                  error: 'List unavailable',
                }),
            { status: scenario.listStatus }
          );
        }
        if (scenario.actionNetworkError) throw new Error('Action network failed');
        if (scenario.actionStatus !== 200)
          return new Response(JSON.stringify({ error: 'Action unavailable' }), { status: scenario.actionStatus });
        const id = decodeURIComponent(url.split('/').at(-2));
        if (url.endsWith('/pray')) {
          const row = window.requests.find((row) => row.id === id);
          row.prayedByMe = !row.prayedByMe;
          row.prayerCount += row.prayedByMe ? 1 : -1;
          return new Response(JSON.stringify({ prayed: row.prayedByMe, prayerCount: row.prayerCount }));
        }
        if (options.method === 'PATCH') {
          const row = window.requests.find((row) => row.id === decodeURIComponent(url.split('/').at(-1)));
          row.status = JSON.parse(options.body).status;
        }
        return new Response(JSON.stringify({ approvalRequired: scenario.approvalRequired }));
      };
    },
    { requests, options }
  );
  await page.route('**/*', (route) => {
    if (route.request().isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: html });
    if (new URL(route.request().url()).pathname === '/myagapay/prayer-requests.js')
      return route.fulfill({ contentType: 'application/javascript', body: script });
    return route.fulfill({
      contentType: route.request().resourceType() === 'script' ? 'application/javascript' : 'text/plain',
      body: '',
    });
  });
  await page.goto('https://agapay.test/myagapay/prayer-requests');
  await page.waitForFunction(() => window.calls.length >= 2);
  return page;
}
const card = (page, body) => page.locator('.prayer-request-card').filter({ has: page.locator('p', { hasText: body }) });

try {
  let page = await fixture({ allowAnonymous: false });
  assert.equal(await page.locator('.prayer-request-card').count(), 7);
  assert.equal(await card(page, '<Please pray & care>').locator('p').textContent(), '<Please pray & care>');
  assert.equal(await card(page, '<Please pray & care>').locator('header strong').textContent(), '<Member & name>');
  assert.equal(await card(page, 'My declined request').locator('aside span').textContent(), '<Parish response>');
  assert.equal(
    await card(page, 'My community request').locator('header strong').textContent(),
    'You · anonymous to parishioners'
  );
  assert.equal(await card(page, 'My private request').locator('header em').textContent(), 'Clergy only');
  assert.equal(await card(page, 'My private request').locator('.prayer-prayed-button, .prayer-report-link').count(), 0);
  assert.equal(await card(page, 'My community request').locator('.prayer-report-link').count(), 0);
  assert.equal(await card(page, 'My pending request').locator('.prayer-prayed-button').count(), 0);
  assert.equal(await card(page, 'My declined request').locator('footer button').count(), 0);
  assert.equal(await card(page, 'Answered community request').locator('.prayer-request-avatar').textContent(), 'A');
  assert.equal(await page.locator('#prayerAnonymousOption').evaluate((el) => el.hidden), true);
  assert.equal(await page.locator('#prayerPastoralNotice').textContent(), '<Pastoral notice>');
  assert.deepEqual(
    await page.evaluate(() => [
      prayerDate(Date.now()),
      prayerDate(Date.now() - 86400000),
      prayerDate(Date.now() - 3 * 86400000),
      prayerDate('bad'),
    ]),
    ['Today', 'Yesterday', '3 days ago', '']
  );
  const calls = await page.evaluate(() => window.calls);
  assert.equal(
    calls.filter((call) => call.options.method === 'POST').length,
    1,
    'Initialization records only the existing opened-tool event'
  );
  for (const call of calls) {
    assert.equal(call.options.cache, 'no-store');
    assert.equal(call.options.headers.Authorization, 'Bearer fixture-session');
  }
  await page.locator('[data-prayer-filter="active"]').click();
  assert.equal(await page.locator('.prayer-request-card').count(), 3);
  assert.equal(await page.locator('[data-prayer-filter="active"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-prayer-filter="answered"]').click();
  assert.equal(await page.locator('.prayer-request-card').count(), 1);
  await page.evaluate(() => setPrayerFilter('unknown'));
  assert.equal(
    await page.locator('.prayer-request-card').count(),
    7,
    'Unknown filters retain the existing All fallback'
  );
  await page.evaluate(() => togglePrayer('public-1'));
  assert.equal(
    await card(page, '<Please pray & care>').locator('.prayer-prayed-button').getAttribute('aria-pressed'),
    'true'
  );
  assert.match(await card(page, '<Please pray & care>').locator('footer').textContent(), /2 parishioners prayed/);
  await page.evaluate(() => togglePrayer('public-1'));
  assert.equal(
    await card(page, '<Please pray & care>').locator('.prayer-prayed-button').getAttribute('aria-pressed'),
    'false'
  );
  await page.evaluate(() => {
    window.scenario.actionStatus = 503;
  });
  await page.evaluate(() => togglePrayer('public-1'));
  assert.equal(await page.locator('#prayerStatus').textContent(), 'Action unavailable');
  assert.equal(
    await card(page, '<Please pray & care>').locator('.prayer-prayed-button').getAttribute('aria-pressed'),
    'false'
  );
  await page.evaluate(() => {
    window.scenario.actionStatus = 200;
  });
  await page.evaluate(() => markPrayerAnswered('mine-2'));
  assert.equal(await card(page, 'My community request').locator('header em').textContent(), 'Answered');
  await page.evaluate(() => {
    window.scenario.confirm = false;
  });
  const count = await page.evaluate(() => window.calls.length);
  await page.evaluate(() => archivePrayerRequest('pending-5'));
  assert.equal(await page.evaluate(() => window.calls.length), count, 'Cancelled withdrawal makes no request');
  await page.evaluate(() => {
    window.scenario.confirm = true;
  });
  await page.evaluate(() => archivePrayerRequest('pending-5'));
  assert.equal(await card(page, 'My pending request').locator('header em').textContent(), 'Archived');
  await page.locator('#prayerMineFilter').click();
  await page.waitForFunction(() => prayerState.requests.length === 5 && prayerState.requests.every((row) => row.mine));
  assert.equal(await page.locator('.prayer-request-card').count(), 5);
  assert.equal(await page.locator('#prayerMineFilter').getAttribute('aria-pressed'), 'true');
  await page.locator('.prayer-new-request').click();
  assert.equal(await page.locator('#prayerComposerDialog').evaluate((el) => el.open), true);
  await page.waitForFunction(() => document.activeElement.id === 'prayerRequestBody');
  await page.locator('#prayerRequestBody').fill('Please pray for our family.');
  await page.evaluate(() => {
    window.scenario.actionStatus = 503;
  });
  await page.locator('#prayerSubmitButton').click();
  await page.waitForFunction(() => !document.getElementById('prayerSubmitButton').disabled);
  assert.equal(await page.locator('#prayerComposerDialog').evaluate((el) => el.open), true);
  assert.equal(await page.locator('#prayerRequestBody').inputValue(), 'Please pray for our family.');
  await page.evaluate(() => {
    window.scenario.actionStatus = 200;
  });
  await page.locator('#prayerSubmitButton').click();
  await page.waitForFunction(() => !document.getElementById('prayerComposerDialog').open);
  assert.match(await page.locator('#prayerStatus').textContent(), /sent to the parish for review/);
  assert.equal(await page.locator('#prayerRequestBody').inputValue(), '');
  const submission = await page.evaluate(() =>
    window.calls.find((call) => call.url.endsWith('/prayer-requests') && call.options.method === 'POST')
  );
  assert.deepEqual(JSON.parse(submission.options.body), {
    body: 'Please pray for our family.',
    visibility: 'parish_members',
    anonymous: false,
  });
  await page.evaluate(() => openPrayerReport('public-1'));
  await page.evaluate(() => {
    window.scenario.actionStatus = 503;
  });
  await page.locator('#prayerReportButton').click();
  await page.waitForFunction(() => !document.getElementById('prayerReportButton').disabled);
  assert.equal(await page.locator('#prayerReportDialog').evaluate((el) => el.open), true);
  await page.evaluate(() => {
    window.scenario.actionStatus = 200;
  });
  await page.locator('#prayerReportButton').click();
  await page.waitForFunction(() => !document.getElementById('prayerReportDialog').open);
  assert.equal(await page.evaluate(() => prayerState.reportRequestId), '');
  const report = await page.evaluate(() => window.calls.find((call) => call.url.endsWith('/report')));
  assert.deepEqual(JSON.parse(report.options.body), { reason: 'Contains private or identifying information' });
  await page.close();

  page = await fixture({ approvalRequired: false });
  await page.locator('.prayer-new-request').click();
  await page.locator('#prayerRequestBody').fill('Please pray for our parish.');
  await page.locator('input[name="prayerVisibility"][value="clergy_only"]').check();
  await page.locator('#prayerAnonymous').check();
  await page.locator('#prayerSubmitButton').click();
  await page.waitForFunction(() => !document.getElementById('prayerComposerDialog').open);
  assert.match(await page.locator('#prayerStatus').textContent(), /shared privately/);
  assert.deepEqual(
    await page.evaluate(() =>
      JSON.parse(
        window.calls.find((call) => call.url.endsWith('/prayer-requests') && call.options.method === 'POST').options
          .body
      )
    ),
    { body: 'Please pray for our parish.', visibility: 'clergy_only', anonymous: true }
  );
  await page.evaluate(() => {
    const dialog = document.getElementById('prayerComposerDialog');
    dialog.showModal = undefined;
    dialog.close = undefined;
    openPrayerComposer();
  });
  assert.equal(await page.locator('#prayerComposerDialog').getAttribute('open'), '');
  await page.evaluate(() => closePrayerComposer());
  assert.equal(await page.locator('#prayerComposerDialog').getAttribute('open'), null);
  await page.evaluate(() => {
    document.body.replaceChildren();
    renderPrayerRequests();
    openPrayerComposer();
    closePrayerComposer();
    openPrayerReport('missing');
    closePrayerReport();
    prayerStatus('safe');
  });
  await page.close();
  for (const [options, expected] of [
    [{ empty: true }, 'No prayer requests in this view'],
    [{ malformed: true }, 'No prayer requests in this view'],
    [{ listStatus: 403 }, 'List unavailable'],
    [{ listNetworkError: true }, 'List network failed'],
  ]) {
    page = await fixture(options);
    assert.match(
      await page
        .locator(options.listStatus || options.listNetworkError ? '#prayerStatus' : '#prayerRequestList')
        .textContent(),
      new RegExp(expected)
    );
    await page.close();
  }
  page = await fixture({ listStatus: 401 });
  assert.equal(await page.locator('.prayer-request-card').count(), 0);
  assert.equal(await page.evaluate(() => prayerFetch('/api/donor/koinonia/prayer-requests')), null);
  await page.close();
  assert.deepEqual(errors, []);
  console.log(
    'PASS - member prayer privacy/actions, escaping, relative dates, filters, reactions, withdrawal confirmation, composer/report retry, settings, auth, native/fallback dialogs and missing DOM'
  );
} finally {
  await browser.close();
}
