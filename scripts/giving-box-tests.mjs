import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { createPasswordRecord } from '../src/lib/core.js';

const TEST_ADMIN_PASSWORD = 'root-admin-token-for-tests';
const TEST_ADMIN_PASSWORD_RECORD = JSON.stringify(await createPasswordRecord(TEST_ADMIN_PASSWORD));

class MemoryKV {
  constructor() {
    this.store = new Map();
  }

  async get(key) {
    return this.store.get(key) ?? null;
  }

  async put(key, value) {
    this.store.set(key, String(value));
  }

  async delete(key) {
    this.store.delete(key);
  }

  async list({ prefix = '', limit = 100 } = {}) {
    const keys = Array.from(this.store.keys())
      .filter((name) => name.startsWith(prefix))
      .slice(0, limit)
      .map((name) => ({ name }));
    return { keys, list_complete: true };
  }
}

function env() {
  const registrations = new MemoryKV();
  registrations.store.set('__agapay_admin_password', TEST_ADMIN_PASSWORD_RECORD);
  return {
    AGAPAY_REGISTRATIONS: registrations,
    AGAPAY_APP_URL: 'https://agapay.test',
    AGAPAY_ENABLED_PRODUCTS: 'give,learn',
    AGAPAY_TEST_MODE: '1',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
    STRIPE_WEBHOOK_SECRET_CONNECT: 'whsec_connect_test_secret',
    STRIPE_SECRET_KEY: 'sk_test_giving_box',
  };
}

function request(path, { method = 'GET', body, headers = {} } = {}) {
  return new Request(`https://agapay.test${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.10',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function withMockFetch(handler, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
  const testEnv = env();
  const assetPaths = [];
  testEnv.ASSETS = {
    async fetch(assetRequest) {
      assetPaths.push(new URL(assetRequest.url).pathname);
      return new Response('<!doctype html><title>Asset</title>', {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
          'X-Frame-Options': 'SAMEORIGIN',
        },
      });
    },
  };

  const embed = await worker.fetch(request('/give/embed/st-test'), testEnv);
  assert.equal(embed.status, 200);
  assert.equal(assetPaths[0], '/give/embed.html');
  assert.equal(embed.headers.get('X-Frame-Options'), null);
  assert.equal(embed.headers.get('Content-Security-Policy'), 'frame-ancestors *');
  assert.equal(embed.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.equal(embed.headers.get('Cache-Control'), 'no-store');

  const normalPage = await worker.fetch(request('/give'), testEnv);
  assert.equal(normalPage.headers.get('X-Frame-Options'), 'SAMEORIGIN');
}

{
  const testEnv = env();
  const registration = {
    reference: 'AGP-GIVING-BOX',
    status: 'verified',
    parishId: 'st-checkout',
    parishName: 'St. Checkout Orthodox Church',
    communityType: 'parish',
    jurisdiction: 'OCA',
    jurisdictionLabel: 'OCA',
    city: 'Dallas',
    state: 'TX',
    givingStatus: 'active',
    stripeAccountId: 'acct_connected_test',
    treasurerEmail: 'giver@example.com',
    funds: [{ id: 'general', name: 'General Fund', description: 'General support.' }],
  };
  await testEnv.AGAPAY_REGISTRATIONS.put(registration.reference, JSON.stringify(registration));
  await testEnv.AGAPAY_REGISTRATIONS.put('__agapay_index_parish_id__st-checkout', registration.reference);

  const recurringForms = [];
  let recurringSession = 0;
  await withMockFetch(
    async (url, init = {}) => {
      const href = String(url);
      if (href.includes('/v1/customers?')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
      if (href.endsWith('/v1/customers')) {
        return new Response(JSON.stringify({ id: `cus_embed_${recurringSession}` }), { status: 200 });
      }
      if (href.endsWith('/v1/checkout/sessions')) {
        recurringSession += 1;
        recurringForms.push(new URLSearchParams(init.body));
        return new Response(
          JSON.stringify({
            id: `cs_embed_${recurringSession}`,
            url: `https://checkout.stripe.test/embed-${recurringSession}`,
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected fetch ${href}`);
    },
    async () => {
      for (const [index, frequency] of ['quarterly', 'yearly'].entries()) {
        const checkout = await worker.fetch(
          request('/api/create-checkout-session', {
            method: 'POST',
            headers: { 'CF-Connecting-IP': `203.0.113.${30 + index}` },
            body: {
              parishId: 'st-checkout',
              giftType: 'stewardship',
              amount: 50,
              frequency,
              firstName: 'Widget',
              lastName: 'Giver',
              email: `widget-${frequency}@example.com`,
              coverFees: true,
              source: 'embed',
            },
          }),
          testEnv
        );
        assert.equal(checkout.status, 201);
      }
    }
  );

  assert.equal(recurringForms.length, 2);
  assert.equal(recurringForms[0].get('mode'), 'subscription');
  assert.equal(recurringForms[0].get('line_items[0][price_data][recurring][interval]'), 'month');
  assert.equal(recurringForms[0].get('line_items[0][price_data][recurring][interval_count]'), '3');
  assert.equal(recurringForms[0].get('metadata[frequency]'), 'quarterly');
  assert.equal(
    recurringForms[0].get('success_url'),
    'https://agapay.test/give/embed/st-checkout?success=1&session_id={CHECKOUT_SESSION_ID}'
  );
  assert.equal(recurringForms[0].get('cancel_url'), 'https://agapay.test/give/embed/st-checkout?canceled=1');
  assert.equal(recurringForms[1].get('line_items[0][price_data][recurring][interval]'), 'year');
  assert.equal(recurringForms[1].get('line_items[0][price_data][recurring][interval_count]'), null);
  assert.equal(recurringForms[1].get('metadata[frequency]'), 'yearly');

  const invalid = await worker.fetch(
    request('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'CF-Connecting-IP': '203.0.113.39' },
      body: {
        parishId: 'st-checkout',
        giftType: 'stewardship',
        amount: 25,
        frequency: 'daily',
        firstName: 'Unsupported',
        email: 'unsupported@example.com',
      },
    }),
    testEnv
  );
  assert.equal(invalid.status, 422);
  assert.equal((await invalid.json()).error, 'Choose a supported gift frequency.');
}

console.log('PASS - giving box frame policy, recurring checkout, and invalid frequency handling');
