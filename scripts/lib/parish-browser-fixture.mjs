import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureBrowserErrors } from './browser-error-gate.mjs';

const publicRoot = fileURLToPath(new URL('../../public/', import.meta.url));
// Match production's secure context, including crypto.randomUUID in action handlers.
export const origin = 'https://parish.test';
export const parish = {
  parishId: 'synthetic-parish',
  parishName: 'Synthetic Test Parish',
  communityType: 'Parish',
  subscriptionTier: 'starter',
  subscriptionTierLabel: 'Give',
  subscriptionStatus: 'active',
  stripeAccountStatus: 'charges_enabled',
  givingStatus: 'hidden',
  funds: [{ id: 'general', name: 'General Operating Fund', enabled: true }],
  campaigns: [],
  setup: { billingActive: true, stripeConnected: true },
  onboarding: { enabled: true, state: 'SETUP', blockers: [{ key: 'subscription' }], stripe: {} },
};
const base = '/api/parish/dashboard/synthetic-parish';
const background = {
  '/tax-exemption': {},
  '/giving-summary': { summary: {} },
  '/recurring-health': { health: {} },
  '/giving-history': { gifts: [], manualAccountingGifts: [] },
  '/outside-gifts': { gifts: [] },
  '/stripe-volume': { volume: { connected: false } },
  '/commemorations': { entries: [] },
  '/nonprofit-pricing': {},
  '/stripe-refresh': {},
  '/subscription-refresh': {},
  '/giving-statements/jobs': { jobs: [] },
  '/stewardship/nudge': {},
  '/memberships': { memberships: [], invitations: [] },
};

// Fulfill every request locally, including real checked-in HTML, JS, and CSS.
// Fonts and the external QR dependency are empty: this exercises the existing
// offline QR fallback, not the third-party encoder. No real service is contacted.
export async function openParishFixture(browser, dashboardResponse = () => ({ parish }), apiResponses = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const gate = captureBrowserErrors(page);
  const unexpected = [];
  const diagnostics = [];
  let requests = 0;
  page.on('console', (message) => {
    if (message.text().startsWith('[AGAPAY diagnostic]')) diagnostics.push(message.text());
  });
  await context.addInitScript(() => {
    sessionStorage.setItem('agapay_parish_id', 'synthetic-parish');
    sessionStorage.setItem('agapay_parish_session_token', 'synthetic-session-token');
  });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      if (
        !['https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'].includes(url.origin)
      ) {
        unexpected.push(url.origin);
      }
      return route.fulfill({
        status: 200,
        body: '',
        contentType: url.hostname.includes('fonts') ? 'text/css' : 'text/javascript',
      });
    }
    if (url.pathname === base) {
      requests++;
      const response = await dashboardResponse(requests, route.request());
      if (response.abort) return route.abort('failed');
      if (response.raw !== undefined)
        return route.fulfill({ status: response.status || 200, body: response.raw, contentType: 'text/html' });
      return route.fulfill({ status: response.status || 200, json: response.body || response });
    }
    if (url.pathname.startsWith('/api/')) {
      const suffix = url.pathname.slice(base.length);
      const responseKey = Object.hasOwn(apiResponses, url.pathname) ? url.pathname : suffix;
      if (
        Object.hasOwn(apiResponses, url.pathname) ||
        (url.pathname.startsWith(base + '/') &&
          (Object.hasOwn(background, suffix) || Object.hasOwn(apiResponses, suffix)))
      ) {
        const override = apiResponses[responseKey];
        const response = typeof override === 'function' ? await override(route.request()) : override;
        if (response?.abort) return route.abort('failed');
        return route.fulfill({
          status: response?.status || 200,
          json: response?.body || background[suffix],
        });
      }
      unexpected.push(url.pathname);
      return route.fulfill({ status: 500, json: { error: 'Unexpected synthetic API request' } });
    }
    const paths = { '/parish/dashboard': '/parish/dashboard.html', '/give/login': '/parish/login.html' };
    const path = resolve(publicRoot, '.' + (paths[url.pathname] || url.pathname));
    assert.ok(path.startsWith(resolve(publicRoot) + sep), 'fixture must only serve checked-in public assets');
    try {
      const body = await readFile(path);
      const types = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
      };
      return route.fulfill({ body, contentType: types[extname(path)] || 'application/octet-stream' });
    } catch {
      unexpected.push(url.pathname);
      return route.fulfill({ status: 404, body: '' });
    }
  });
  return {
    page,
    context,
    diagnostics,
    requests: () => requests,
    async open() {
      await page.goto(`${origin}/parish/dashboard`);
    },
    assertClean() {
      gate.assertClean();
      assert.deepEqual(unexpected, [], 'Unexpected fixture requests');
    },
    async close() {
      await context.close();
    },
  };
}
