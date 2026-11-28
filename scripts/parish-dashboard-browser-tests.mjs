import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { openParishFixture, parish } from './lib/parish-browser-fixture.mjs';
import { captureBrowserErrors } from './lib/browser-error-gate.mjs';

// Globals read inside page.evaluate callbacks, provided by the actual dashboard.
/* global currentParish, dashboardLoadPromise, loadDashboard, renderDashboard:writable,
  loadGivingSummary, loadRecurringHealth, renderQrCode, loadCommemorations,
  loadGivingHistory, renderSetupWizard, openDirectoryHousehold, loadSacramentsPanel, loadSacramentsAvailability, loadSacramentsGoogleStatus, setSacramentsDashboardTab */

const browser = await chromium.launch({ headless: true });
async function ready(page) {
  await page.waitForFunction(() => document.body.classList.contains('dashboard-ready'));
  assert.equal(await page.locator('.app').getAttribute('aria-busy'), 'false');
}
async function failed(page) {
  await page.waitForFunction(() => document.body.classList.contains('dashboard-load-failed'));
  assert.equal(await page.evaluate(() => document.body.classList.contains('dashboard-ready')), false);
  assert.equal(await page.locator('.app').getAttribute('aria-busy'), 'false');
  assert.equal(await page.locator('#dashboardBootRetry').isEnabled(), true);
  assert.equal(await page.locator('#dashboardBootRecovery').isVisible(), true);
  assert.equal(await page.evaluate(() => currentParish), null);
  await page.waitForFunction(() => dashboardLoadPromise === null);
}
async function scenario(name, response, run, apiResponses) {
  const fixture = await openParishFixture(browser, response, apiResponses);
  try {
    await run(fixture);
    fixture.assertClean();
    console.log(`PASS - ${name}`);
  } finally {
    await fixture.close();
  }
}

try {
  await scenario(
    'Give parishes see the Parish Life plan requirement and have no week view',
    () => ({ parish: { ...parish, parishLifeAvailable: true } }),
    async ({ page, open }) => {
      await open();
      await ready(page);
      await page.locator('#nav-communications').click();
      assert.equal(await page.locator('#communicationsPaywall').isVisible(), true);
      assert.equal(await page.getByRole('button', { name: 'This Week', exact: true }).count(), 0);
    }
  );

  await scenario(
    'parish week dashboard filters dates and navigates weeks on desktop and mobile',
    () => ({
      parish: {
        ...parish,
        subscriptionTier: 'giving',
        subscriptionTierLabel: 'Give +',
        parishLifeAvailable: true,
        communicationsEnabled: true,
        signupsEnabled: true,
        entitlements: { modules: { communications: { included: true } } },
      },
    }),
    async ({ page, open }) => {
      await open();
      await ready(page);
      await page.locator('#nav-communications').click();
      const weekTab = page.getByRole('button', { name: 'This Week', exact: true });
      await page.getByRole('button', { name: 'Ministries', exact: true }).click();
      const agenda = page.locator('.parish-week-agenda');
      const serving = page.locator('.parish-week-serving');
      await agenda.getByText('Choir rehearsal').waitFor();
      assert.equal(await weekTab.getAttribute('aria-pressed'), 'true');
      assert.equal(await agenda.getByText('Divine Liturgy').isVisible(), true);
      assert.equal(await serving.getByText('1 coverage request').isVisible(), true);
      assert.equal(
        await serving.getByRole('link', { name: 'Signup' }).getAttribute('href'),
        '/myagapay/signups?sheet=liturgy'
      );
      await page.getByRole('button', { name: /Sunday, November 29/ }).click();
      assert.equal(await agenda.getByText('Choir rehearsal').count(), 0);
      assert.equal(await agenda.getByRole('heading', { name: 'Sunday agenda' }).isVisible(), true);
      await page.getByRole('button', { name: 'Full week' }).click();
      assert.equal(await agenda.getByText('Choir rehearsal').isVisible(), true);
      const previous = page.getByRole('button', { name: 'Previous week' });
      await previous.click();
      await agenda.getByText('There are no scheduled events in this view.').waitFor();
      assert.equal(await previous.evaluate((element) => element === document.activeElement), true);
      await page.getByRole('button', { name: 'Current week' }).click();
      await agenda.getByText('Choir rehearsal').waitFor();
      await page.getByRole('button', { name: 'Teams', exact: true }).click();
      await page.getByRole('heading', { name: 'Ministry teams' }).waitFor();
      assert.equal(await agenda.isVisible(), false);
      await weekTab.click();
      await agenda.getByText('Choir rehearsal').waitFor();
      await page.setViewportSize({ width: 390, height: 844 });
      const mobileNav = page.locator('.mobile-tabbar [data-nav-tab="communications"]');
      await mobileNav.click();
      await agenda.getByText('Divine Liturgy').waitFor();
      assert.equal(await weekTab.getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.topbar').isVisible(), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      const bounds = await page.locator('#parishWeekPanel').boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390);
    },
    {
      '/communications': { body: { announcements: [] } },
      '/communications/teaching': { body: { posts: [] } },
      '/communications/video': { body: { videos: [] } },
      '/communications/blog': { body: {} },
      '/directory/admin/ministries': { body: { ministries: [] } },
      '/this-week': (request) => {
        assert.equal(request.headers().authorization, 'Bearer synthetic-session-token');
        const week = new URL(request.url()).searchParams.get('week');
        const body = {
          today: '2026-11-27',
          timeZone: 'America/Chicago',
          calendarState: 'connected',
          signupsEnabled: true,
        };
        if (week) {
          assert.equal(week, '2026-11-16');
          return { body: { ...body, weekStart: week, weekEnd: '2026-11-22', events: [], serving: [] } };
        }
        return {
          body: {
            ...body,
            weekStart: '2026-11-23',
            weekEnd: '2026-11-29',
            events: [
              {
                id: '1',
                title: 'Choir rehearsal',
                startsAt: '2026-11-27T23:00:00Z',
                day: '2026-11-27',
                kind: 'ministry',
                ministry: 'Choir',
                href: '/myagapay/groups?group=choir',
              },
              {
                id: '2',
                title: 'Divine Liturgy',
                startsAt: '2026-11-29T15:00:00Z',
                day: '2026-11-29',
                kind: 'calendar',
              },
            ],
            serving: [
              {
                id: '1',
                title: 'Liturgy',
                label: 'Epistle reader',
                ministry: 'Readers',
                day: '2026-11-29',
                startsAt: '2026-11-29T15:00:00Z',
                needed: 2,
                confirmed: 1,
                open: 1,
                coverage: 1,
                href: '/myagapay/signups?sheet=liturgy',
              },
            ],
          },
        };
      },
    }
  );

  await scenario(
    'Settings logo upgrade selects Give + and church-calendar dates convert automatically',
    () => ({
      parish: {
        ...parish,
        subscriptionTiers: [
          { id: 'starter', label: 'Give', monthlyCents: 0 },
          { id: 'giving', label: 'Give +', monthlyCents: 1900 },
        ],
        subscriptionStatus: 'not_started',
        subscriptionIntroDemoEligible: true,
        liturgicalCalendar: 'julian',
        setup: { billingActive: false, stripeConnected: false },
      },
    }),
    async (fixture) => {
      await fixture.open();
      await fixture.page.locator('#nav-settings').click();
      assert.equal(await fixture.page.locator('#settings-profile').isVisible(), true);
      await fixture.page.getByRole('button', { name: 'Upgrade to Give +', exact: true }).click();
      assert.equal(await fixture.page.locator('#settings-billing').isVisible(), true);
      assert.equal(await fixture.page.locator('#subscriptionTierUpgrade').inputValue(), 'giving');
      assert.equal(
        await fixture.page.locator('#subscriptionTierUpgrade').evaluate((el) => el === document.activeElement),
        true
      );
      await fixture.page.locator('[data-settings-section="profile"]').click();
      await fixture.page.locator('#patronalFeastName').fill('St. Catherine');
      await fixture.page.locator('#patronalFeastMonth').selectOption('11');
      await fixture.page.locator('#patronalFeastDay').selectOption('25');
      assert.match(await fixture.page.locator('#patronalFeastPreview').textContent(), /December 8/);
      const payload = await fixture.page.evaluate(() => window.payload());
      assert.equal(payload.patronalFeastDate, '12-08');
      assert.equal(payload.patronalFeastChurchDate, '11-25');
      await fixture.page.locator('#settingsLiturgicalCalendar').selectOption('gregorian');
      assert.match(await fixture.page.locator('#patronalFeastPreview').textContent(), /November 25/);
      assert.equal(await fixture.page.evaluate(() => window.payload().patronalFeastDate), '11-25');
      await fixture.page.evaluate(() => {
        window.open = () => null;
      });
      await fixture.page.locator('[data-settings-section="billing"]').click();
      await fixture.page.getByRole('button', { name: 'Start free 30-day demo', exact: true }).click();
      await fixture.page.locator('#subscriptionUpgradeLinkBox.visible').waitFor();
      assert.equal(
        await fixture.page.locator('#subscriptionUpgradeLink').getAttribute('href'),
        'https://checkout.stripe.com/synthetic'
      );
    },
    {
      '/subscription-checkout': (request) => {
        assert.equal(request.postDataJSON().subscriptionTier, 'giving');
        return { body: { checkoutUrl: 'https://checkout.stripe.com/synthetic' } };
      },
    }
  );
  // Prove the gate fails on both thrown callbacks and unhandled rejections.
  for (const rejection of [false, true]) {
    const probe = await browser.newPage();
    try {
      const gate = captureBrowserErrors(probe);
      const observed = probe.waitForEvent('pageerror');
      await probe.evaluate((reject) => {
        if (reject) void Promise.reject(new Error('Synthetic unhandled rejection'));
        else
          setTimeout(() => {
            throw new Error('Synthetic callback failure');
          }, 0);
      }, rejection);
      await observed;
      assert.throws(() => gate.assertClean(), /Uncaught browser errors/);
    } finally {
      await probe.close();
    }
  }
  console.log('PASS - browser gate fails on uncaught exceptions and unhandled rejections');

  await scenario(
    'real dashboard boot, delayed background work, and rendered onboarding states',
    undefined,
    async (fixture) => {
      const { page } = fixture;
      const subscriptionHelperRequests = [];
      page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/parish/app-subscriptions-and-settlement.js')
          subscriptionHelperRequests.push(request.url());
      });
      const historyLoaded = page.waitForResponse((response) => response.url().endsWith('/giving-history'));
      await fixture.open();
      await ready(page);
      await historyLoaded;
      await page.evaluate(async () => {
        await Promise.all([
          loadGivingSummary(),
          loadRecurringHealth(),
          renderQrCode(),
          loadCommemorations(),
          loadGivingHistory(),
        ]);
      });
      assert.equal(
        subscriptionHelperRequests.length,
        1,
        'The declaration-only subscription helper loads once on the Parish dashboard'
      );
      assert.equal(
        await page.evaluate(() => typeof window.parishTierDefinition),
        'function',
        'Classic subscription handlers must be ready at dashboard startup'
      );
      assert.equal(await page.locator('#sidebarParishName').textContent(), parish.parishName);
      assert.equal(fixture.diagnostics.length, 0, 'healthy loading should produce no diagnostic errors');
      const pane = page.locator('#setupWizardPane');
      const cases = [
        [{ blockers: [{ key: 'subscription' }] }, 'Choose your AGAPAY plan', 'Choose plan'],
        [
          { blockers: [{ key: 'stripeConnected' }], stripe: { connected: false } },
          'Connect the parish Stripe account',
          'Connect Stripe',
        ],
        [
          { blockers: [{ key: 'stripeReady' }], stripe: { connected: true } },
          'Finish connecting Stripe',
          'Check Stripe status',
        ],
        [
          { blockers: [{ key: 'stripeReady' }], stripe: { connected: true, verificationPending: true } },
          'Stripe setup is complete',
          'Check Stripe status',
        ],
        [{ blockers: [{ key: 'givingConfiguration' }] }, 'Review the giving setup', 'Review giving setup'],
        [{ blockers: [{ key: 'internal' }] }, 'Next step: AGAPAY review', 'Check for updates'],
        [{ blockers: [], canGoLive: true }, 'Review and launch', 'Go Live'],
      ];
      for (const [changes, text, button] of cases) {
        await page.evaluate((workflow) => {
          currentParish.onboarding = { enabled: true, state: 'SETUP', ...workflow };
          renderSetupWizard();
        }, changes);
        assert.ok((await pane.textContent()).includes(text));
        assert.equal(await pane.locator('.parish-setup-stage').count(), 3);
        if (button) assert.equal(await pane.getByRole('button', { name: button, exact: true }).count(), 1);
        assert.equal(await pane.locator('#treasurerSignoff').count(), changes.canGoLive ? 1 : 0);
        if (changes.stripe?.verificationPending) {
          assert.ok((await pane.textContent()).includes('Verification is pending'));
          assert.equal(await pane.getByRole('button', { name: 'Continue Stripe setup', exact: true }).count(), 0);
          assert.ok(!(await pane.textContent()).includes('Finish connecting Stripe'));
          assert.equal(await pane.getByRole('button', { name: 'Go Live', exact: true }).count(), 0);
        }
      }
      assert.equal(await pane.locator('.treasurer-affirmation').count(), 8);
      await page.evaluate(() => {
        currentParish.onboarding.summary = { organization: { publicName: '<img src=x onerror=alert(1)>' } };
        renderSetupWizard();
      });
      assert.equal(await pane.locator('img').count(), 0, 'signoff text must not become executable markup');
      assert.ok((await pane.textContent()).includes('<img src=x onerror=alert(1)>'));
      await page.evaluate(() => {
        currentParish.onboarding = { enabled: true, state: 'LIVE' };
        renderSetupWizard();
      });
      assert.equal(await pane.textContent(), '', 'completed onboarding must clear the setup wizard');
      await page.evaluate(() => {
        currentParish.onboarding.steps = [{ key: 'credential', passed: false }];
        renderSetupWizard();
      });
      assert.ok((await pane.textContent()).includes('Treasurer access needs one final step'));
    }
  );

  for (const [name, response] of [
    ['HTTP failure', { status: 503, body: { error: 'donor@example.test Bearer secret-token' } }],
    ['expired session with an HTML response', { status: 401, raw: 'secret-token' }],
    ['network interruption', { abort: true }],
    ['malformed JSON', { raw: 'secret-token invalid JSON' }],
    ['missing parish data', { body: {} }],
  ]) {
    await scenario(
      `${name}: safe error, released controls, successful retry`,
      (count) => (count === 1 ? response : { parish }),
      async (fixture) => {
        const { page } = fixture;
        await fixture.open();
        await failed(page);
        const message = await page.locator('#dashboardBootMessage').textContent();
        assert.match(message, response.status === 401 ? /Please sign in again/ : /Please try again/);
        assert.doesNotMatch(message + fixture.diagnostics.join(''), /donor@example\.test|secret-token/);
        assert.equal(fixture.diagnostics.length, 1);
        assert.ok(fixture.diagnostics[0].includes('/parish/dashboard-runtime.js:'));
        await page.locator('#dashboardBootRetry').click();
        await ready(page);
        assert.equal(await page.locator('#dashboardBootRetry').isHidden(), true);
        assert.equal(fixture.requests(), 2);
      }
    );
  }

  await scenario(
    'refresh failures preserve the existing parish and unsaved form before a successful retry',
    (count, request) =>
      request.method() === 'PATCH'
        ? { body: { ok: true, parish: { ...parish, ...request.postDataJSON() } } }
        : count === 2
          ? { status: 503, body: {} }
          : { parish },
    async (fixture) => {
      const { page } = fixture;
      await fixture.open();
      await ready(page);
      await page.locator('#nav-settings').click();
      await page.locator('#parishName').fill('Unsaved draft');
      await page.evaluate(() => loadDashboard(document.getElementById('loadBtn')));
      assert.equal(await page.locator('#parishName').inputValue(), 'Unsaved draft');
      assert.equal(await page.evaluate(() => document.body.classList.contains('dashboard-refreshing')), false);
      await ready(page);
      await page.evaluate(() => loadDashboard());
      assert.equal(await page.locator('#parishName').inputValue(), 'Unsaved draft');
      await page.waitForFunction(() => document.getElementById('settingsAutosaveText').textContent === 'Saved');
      assert.equal(fixture.requests(), 3);
    }
  );

  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  await scenario(
    'concurrent loads share one request; a render failure cannot strand the next boot',
    (count) => (count === 1 ? held : { parish }),
    async (fixture) => {
      const { page } = fixture;
      await fixture.open();
      await page.waitForFunction(() => dashboardLoadPromise !== null);
      assert.equal(await page.locator('.app').getAttribute('aria-busy'), 'true');
      assert.equal(await page.evaluate(() => document.body.classList.contains('dashboard-ready')), false);
      await page.evaluate(() => {
        void loadDashboard();
        void loadDashboard();
        window.originalRenderDashboard = renderDashboard;
        renderDashboard = () => {
          throw new TypeError('Synthetic render failure');
        };
      });
      assert.equal(fixture.requests(), 1);
      release({ parish });
      await failed(page);
      await page.evaluate(() => {
        renderDashboard = window.originalRenderDashboard;
      });
      await page.locator('#dashboardBootRetry').click();
      await ready(page);
      assert.equal(fixture.requests(), 2);
    }
  );

  await scenario(
    'quiet billing and Stripe refresh failures retain diagnostics without exposing server text',
    () => ({ parish: { ...parish, subscriptionStatus: 'checkout_created', stripeAccountStatus: 'not_started' } }),
    async (fixture) => {
      await fixture.open();
      await ready(fixture.page);
      assert.equal(fixture.diagnostics.length, 2);
      assert.ok(fixture.diagnostics.some((entry) => entry.includes('billing.refresh')));
      assert.ok(fixture.diagnostics.some((entry) => entry.includes('stripe.refresh')));
      assert.doesNotMatch(
        fixture.diagnostics.join('') + (await fixture.page.locator('body').textContent()),
        /secret-token/
      );
    },
    {
      '/subscription-refresh': { status: 503, body: { error: 'secret-token' } },
      '/stripe-refresh': { status: 503, body: { error: 'secret-token' } },
    }
  );
  await scenario(
    'typed Directory retains escaped household browsing, staff privacy labels and household access details',
    () => ({
      parish: {
        ...parish,
        subscriptionTier: 'parish',
        directoryEnabled: false,
        entitlements: { modules: { directory: { included: true } } },
      },
      featureRequests: [{ featureId: 'directory', count: 1 }],
    }),
    async (fixture) => {
      await fixture.open();
      await ready(fixture.page);
      const notice = fixture.page.locator('#parishFeatureRequestDialog');
      await notice.waitFor({ state: 'visible' });
      assert.match(await notice.innerText(), /One parishioner asked you to enable the parish Directory/);
      await notice.getByRole('button', { name: 'Open Parish Directory' }).click();
      await notice.waitFor({ state: 'hidden' });
      await fixture.page.locator('#tab-directory.active').waitFor();
      const rows = fixture.page.locator('#directoryBrowseList');
      await rows.getByText('<Fixture Family>', { exact: true }).waitFor();
      assert.ok((await rows.innerText()).includes('<Fixture Family>'));
      assert.equal(await rows.locator('script').count(), 0);
      assert.ok((await rows.innerText()).includes('staff@example.test'));
      assert.equal(await rows.locator('[title="Private from parishioners"]').count(), 2);
      await fixture.page.evaluate(() => openDirectoryHousehold('fixture-household'));
      const detail = fixture.page.locator('#directoryRecordDetail');
      assert.ok((await detail.innerText()).includes('Account connected'));
      assert.ok((await detail.innerText()).includes('Parish Life allowed'));
      await detail.getByText('Family directory information', { exact: true }).click();
      assert.ok((await detail.innerText()).includes('Street private'));
    },
    {
      '/directory/admin/settings': {
        body: { settings: { directoryEnabled: true, ordinaryMemberAccessEnabled: true } },
      },
      '/directory/admin/dashboard': { body: { dashboard: { metrics: {} } } },
      '/directory/admin/queue': { body: { items: [] } },
      '/directory/admin/people': { body: { people: [] } },
      '/directory/admin/households': {
        body: {
          households: [
            {
              id: 'fixture-household',
              displayName: '<Fixture Family>',
              staffContact: {
                email: { value: 'staff@example.test', visibility: 'private' },
                phone: { value: '555-0100', visibility: 'private' },
                address: { city: 'Town', visibility: 'directory_members' },
              },
            },
          ],
        },
      },
      '/directory/admin/skills/listings': { body: { skills: { listings: [] } } },
      '/directory/admin/maintenance': { body: { maintenance: {} } },
      '/directory/admin/print/directory': { body: { print: { households: [] } } },
      '/directory/admin/households/fixture-household': {
        body: {
          household: {
            household: { id: 'fixture-household', displayName: '<Fixture Family>' },
            verification: { status: 'current' },
            members: [{ id: 'adult', preferredName: 'Fixture Adult', accountLinked: true, parishConnected: true }],
            contacts: [],
            addresses: [{ line1: 'Street private', visibility: 'private' }],
            administrators: [],
            notes: [],
          },
        },
      },
    }
  );
  await scenario(
    'typed Sacraments retains requests, private preparation links, availability and Google Calendar display',
    () => ({
      parish: {
        ...parish,
        subscriptionTier: 'parish',
        sacramentsEnabled: true,
        sacramentPriests: [
          { name: 'Fixture Priest', email: 'priest@example.test', serviceTypes: ['baptism'], customServices: [] },
        ],
      },
    }),
    async (fixture) => {
      await fixture.open();
      await ready(fixture.page);
      await fixture.page.evaluate(async () => {
        await loadSacramentsPanel(true);
        await loadSacramentsAvailability(true);
        await loadSacramentsGoogleStatus(true);
        setSacramentsDashboardTab('requests');
      });
      const pane = fixture.page.locator('#sacramentsPane');
      assert.ok((await pane.innerText()).includes('<Fixture Participant>'));
      assert.ok((await pane.innerText()).includes('Needs a response'));
      assert.equal(await pane.locator('script').count(), 0);
      assert.equal(await pane.locator('a[href$="/fixture-request/preparation/documents/fixture-document"]').count(), 1);
      await fixture.page.evaluate(() => setSacramentsDashboardTab('calendar'));
      assert.ok((await pane.innerText()).includes('Calendar connected'));
      await fixture.page.evaluate(() => setSacramentsDashboardTab('availability'));
      assert.ok((await pane.innerText()).includes('Open booking windows'));
    },
    {
      '/sacraments': {
        body: {
          requests: [
            {
              id: 'fixture-request',
              sacramentType: 'baptism',
              status: 'requested',
              createdAt: '2020-01-01',
              participantNames: '<Fixture Participant>',
              donorEmail: 'member@example.test',
              preparation: {
                items: [
                  {
                    id: 'step',
                    status: 'pending',
                    title: 'Preparation',
                    documents: [{ id: 'fixture-document', displayName: 'Private guide', reviewStatus: 'pending' }],
                  },
                ],
              },
            },
          ],
        },
      },
      '/sacraments/availability': {
        body: {
          timezone: 'America/Chicago',
          rules: [
            {
              id: 'rule',
              sacramentType: 'baptism',
              priestName: 'Fixture Priest',
              dayOfWeek: 1,
              startTime: '10:00',
              endTime: '12:00',
              slotMinutes: 30,
            },
          ],
          blackouts: [],
        },
      },
      '/sacraments/google-calendar/status': {
        body: {
          configured: true,
          connections: [{ email: 'priest@example.test', connected: true, calendarName: 'Fixture Calendar' }],
        },
      },
    }
  );
} finally {
  await browser.close();
}
