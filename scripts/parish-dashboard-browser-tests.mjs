import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { openParishFixture, parish } from './lib/parish-browser-fixture.mjs';
import { captureBrowserErrors } from './lib/browser-error-gate.mjs';

// Globals read inside page.evaluate callbacks, provided by the actual dashboard.
/* global currentParish, dashboardLoadPromise, loadDashboard, renderDashboard:writable,
  loadGivingSummary, loadRecurringHealth, renderQrCode, loadCommemorations,
  loadGivingHistory, renderSetupWizard */

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
        [{ blockers: [{ key: 'givingConfiguration' }] }, 'Review the giving setup', 'Review giving setup'],
        [{ blockers: [{ key: 'internal' }] }, 'AGAPAY is preparing your setup', null],
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
      assert.equal(await pane.textContent(), '', 'completed onboarding should disappear');
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
    (count) => (count === 2 ? { status: 503, body: {} } : { parish }),
    async (fixture) => {
      const { page } = fixture;
      await fixture.open();
      await ready(page);
      await page.locator('#nav-settings').click();
      await page.locator('#parishName').fill('Unsaved draft');
      await page.evaluate(() => loadDashboard(document.getElementById('loadBtn')));
      assert.equal(await page.evaluate(() => currentParish.parishName), parish.parishName);
      assert.equal(await page.locator('#parishName').inputValue(), 'Unsaved draft');
      assert.equal(await page.evaluate(() => document.body.classList.contains('dashboard-refreshing')), false);
      await ready(page);
      await page.evaluate(() => loadDashboard());
      assert.equal(await page.locator('#parishName').inputValue(), parish.parishName);
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
} finally {
  await browser.close();
}
