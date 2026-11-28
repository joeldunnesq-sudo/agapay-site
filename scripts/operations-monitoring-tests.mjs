import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleOperationsCanary, handleOperationsMonitorAlert } from '../src/operations/monitoring.js';
import { recordScheduledHeartbeat } from '../src/operations/scheduled-heartbeats.js';
import { REQUIRED_STRIPE_CONNECT_EVENTS } from '../src/lib/stripe-connect.js';
import { reconcileStripePaymentDeliveries } from '../src/operations/stripe-reconciliation.js';

const token = 'monitor-test-secret';
const now = new Date().toISOString();
const rows = [
  {
    job_name: 'parish_portability_jobs',
    cron: '*/5 * * * *',
    status: 'completed',
    run_id: 'run-1',
    started_at: now,
    completed_at: now,
    duration_ms: 12,
    updated_at: now,
  },
];
const runs = [];
const db = {
  prepare(sql) {
    return {
      bind(...values) {
        return {
          async run() {
            runs.push({ sql, values });
          },
        };
      },
      async all() {
        return { results: rows };
      },
    };
  },
};
const env = {
  DB: db,
  AGAPAY_REGISTRATIONS: {},
  ACCOUNTING_BACKUPS: {},
  SACRAMENT_DOCUMENTS: {},
  AGAPAY_MONITOR_CANARY_TOKEN: token,
};
const authorized = new Request('https://agapay.test/api/operations/canary', {
  headers: { authorization: `Bearer ${token}` },
});
const canary = await handleOperationsCanary(authorized, env);
assert.equal(canary.status, 200);
assert.equal((await canary.json()).scheduler.ok, true);
assert.equal((await handleOperationsCanary(new Request(authorized.url), env)).status, 401);

const originalConsoleError = console.error;
try {
  console.error = () => {};
  const failedCanary = await handleOperationsCanary(authorized, {
    ...env,
    DB: {
      prepare() {
        throw new Error('private database detail');
      },
    },
  });
  assert.equal(failedCanary.status, 503);
  const failedPayload = await failedCanary.json();
  assert.equal(failedPayload.error, 'heartbeat_read_failed');
  assert.doesNotMatch(JSON.stringify(failedPayload), /private database detail/);
} finally {
  console.error = originalConsoleError;
}

await recordScheduledHeartbeat(env, {
  name: 'test',
  cron: '* * * * *',
  status: 'completed',
  runId: 'run',
  startedAt: now,
  completedAt: now,
  durationMs: 1,
});
assert.equal(runs.length, 1);
assert.deepEqual(runs[0].values.slice(0, 4), ['test', '* * * * *', 'completed', 'run']);

const originalFetch = globalThis.fetch;
try {
  const endpointId = 'we_StageFixture';
  const stripeRequest = new Request(`${authorized.url}?check=stripe-connect`, { headers: authorized.headers });
  const stripeEnv = {
    ...env,
    STRIPE_SECRET_KEY: 'sk_test_fixture',
    STRIPE_CONNECT_WEBHOOK_ENDPOINT_ID: endpointId,
    AGAPAY_APP_URL: 'https://agapay.test',
    AGAPAY_ENVIRONMENT: 'staging',
  };
  let stripeEndpoint = {
    id: endpointId,
    url: 'https://agapay.test/api/stripe/webhook',
    status: 'enabled',
    livemode: false,
    enabled_events: REQUIRED_STRIPE_CONNECT_EVENTS,
  };
  globalThis.fetch = async (url) => {
    assert.equal(url, `https://api.stripe.com/v1/webhook_endpoints/${endpointId}`);
    return Response.json({ ...stripeEndpoint, secret: 'private-fixture' });
  };
  const stripeResult = await handleOperationsCanary(stripeRequest, stripeEnv);
  assert.equal(stripeResult.status, 200);
  assert.deepEqual(await stripeResult.json(), { ok: true, expectedDestination: true, missingEvents: [] });
  stripeEndpoint = {
    ...stripeEndpoint,
    enabled_events: REQUIRED_STRIPE_CONNECT_EVENTS.filter((e) => e !== 'payout.failed'),
  };
  const drift = await handleOperationsCanary(stripeRequest, stripeEnv);
  assert.equal(drift.status, 503);
  assert.deepEqual(await drift.json(), { ok: false, expectedDestination: true, missingEvents: ['payout.failed'] });
  stripeEndpoint = { ...stripeEndpoint, livemode: true, enabled_events: REQUIRED_STRIPE_CONNECT_EVENTS };
  assert.equal((await handleOperationsCanary(stripeRequest, stripeEnv)).status, 503);
  assert.equal((await handleOperationsCanary(new Request(stripeRequest.url), stripeEnv)).status, 401);
  globalThis.fetch = async () => Response.json({ id: 'email-1' });
  const alert = await handleOperationsMonitorAlert(
    new Request('https://agapay.test/api/operations/monitor-alert', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ runId: '1234', summary: 'Health failed.' }),
    }),
    {
      ...env,
      RESEND_API_KEY: 're_test',
      AGAPAY_OPS_ALERT_EMAIL: 'ops@example.test',
    }
  );
  assert.equal(alert.status, 202);
} finally {
  globalThis.fetch = originalFetch;
}

const reconciliationDb = new DatabaseSync(':memory:');
try {
  for (const migration of ['0001_production_records', '0136_stripe_payment_reconciliation']) {
    reconciliationDb.exec(readFileSync(new URL(`../migrations/${migration}.sql`, import.meta.url), 'utf8'));
  }
  reconciliationDb.exec(`
    CREATE TABLE settlement_profiles (stripe_account_id TEXT, parish_id TEXT, is_active INTEGER);
    INSERT INTO registrations(reference,parish_id,stripe_account_id,status,updated_at,data) VALUES
      ('reg-real','parish-a','acct_A123','verified',datetime('now'),'{}'),
      ('reg-demo','demo','acct_demo_a','verified',datetime('now'),'{}');
    INSERT INTO settlement_profiles VALUES ('acct_A123','parish-a',1);
    INSERT INTO stripe_events(id,received_at) VALUES('evt_received',datetime('now')),('evt_achDelivered',datetime('now'));
  `);
  const reconciliationEnv = {
    ...env,
    AGAPAY_ENVIRONMENT: 'staging',
    STRIPE_SECRET_KEY: 'sk_test_fixture',
    AGAPAY_DB: {
      prepare(sql) {
        const statement = reconciliationDb.prepare(sql);
        return {
          async all() {
            return { results: statement.all() };
          },
          bind(...values) {
            return {
              async run() {
                return { meta: statement.run(...values) };
              },
            };
          },
        };
      },
    },
  };
  const tick = Date.now();
  const created = Math.floor(tick / 1000) - 3_600;
  const observation = (id, type, objectId) => ({
    id,
    type,
    created,
    livemode: false,
    account: 'acct_A123',
    data: { object: { id: objectId } },
  });
  let secondPageUnavailable = true;
  globalThis.fetch = async (input, options) => {
    const url = new URL(input);
    assert.equal(url.origin + url.pathname, 'https://api.stripe.com/v1/events');
    assert.equal(options.method ?? 'GET', 'GET');
    assert.equal(new Headers(options.headers).get('stripe-account'), 'acct_A123');
    assert.equal(url.searchParams.get('types[0]'), 'payout.paid');
    const requestedTypes = [...url.searchParams].filter(([key]) => key.startsWith('types[')).map(([, type]) => type);
    assert.ok(requestedTypes.includes('checkout.session.async_payment_succeeded'));
    assert.ok(requestedTypes.includes('checkout.session.async_payment_failed'));
    assert.ok(Number(url.searchParams.get('created[lt]')) > created);
    if (url.searchParams.get('starting_after')) {
      assert.equal(url.searchParams.get('starting_after'), 'evt_received');
      if (secondPageUnavailable) return Response.json({}, { status: 429 });
      return Response.json({
        data: [
          observation('evt_missingRefund', 'refund.updated', 're_test'),
          observation('evt_achSettled', 'checkout.session.async_payment_succeeded', 'cs_test_settled'),
          observation('evt_achFailed', 'checkout.session.async_payment_failed', 'cs_test_failed'),
          observation('evt_achDelivered', 'checkout.session.async_payment_succeeded', 'cs_test_delivered'),
        ],
        has_more: false,
      });
    }
    return Response.json({
      data: [
        observation('evt_missingPayout', 'payout.paid', 'po_test'),
        observation('evt_received', 'charge.dispute.closed', 'dp_test'),
      ],
      has_more: true,
    });
  };
  const counts = reconciliationDb.prepare(`SELECT
    (SELECT count(*) FROM stripe_payment_reconciliation_findings) AS findings,
    (SELECT count(*) FROM stripe_payment_reconciliation_scans) AS checkpoints,
    (SELECT count(*) FROM stripe_events) AS signed_events`);
  await assert.rejects(reconcileStripePaymentDeliveries(reconciliationEnv, tick), /HTTP 429/);
  assert.deepEqual({ ...counts.get() }, { findings: 1, checkpoints: 0, signed_events: 2 });
  secondPageUnavailable = false;
  assert.deepEqual(await reconcileStripePaymentDeliveries(reconciliationEnv, tick), {
    accounts: 1,
    checked: 6,
    discovered: 3,
  });
  assert.deepEqual({ ...counts.get() }, { findings: 4, checkpoints: 1, signed_events: 2 });
  const achFindings = reconciliationDb.prepare(
    "SELECT event_type,object_id FROM stripe_payment_reconciliation_findings WHERE event_type LIKE 'checkout.session.async_payment_%' ORDER BY event_type"
  );
  assert.deepEqual(
    achFindings.all().map((row) => [row.event_type, row.object_id]),
    [
      ['checkout.session.async_payment_failed', 'cs_test_failed'],
      ['checkout.session.async_payment_succeeded', 'cs_test_settled'],
    ]
  );
  const repeated = await reconcileStripePaymentDeliveries(reconciliationEnv, tick + 1000);
  assert.equal(repeated.discovered, 0);
  assert.deepEqual({ ...counts.get() }, { findings: 4, checkpoints: 1, signed_events: 2 });
  const canaryUrl = `${authorized.url}?check=stripe-reconciliation`;
  assert.equal(
    (await handleOperationsCanary(new Request(canaryUrl, { method: 'POST' }), reconciliationEnv)).status,
    401
  );
  assert.equal(
    (
      await handleOperationsCanary(new Request(canaryUrl, { method: 'POST', headers: authorized.headers }), {
        ...reconciliationEnv,
        AGAPAY_ENVIRONMENT: 'production',
      })
    ).status,
    405
  );
  assert.equal(
    (
      await handleOperationsCanary(
        new Request(canaryUrl, { method: 'POST', headers: authorized.headers }),
        reconciliationEnv
      )
    ).status,
    200
  );
} finally {
  globalThis.fetch = originalFetch;
  reconciliationDb.close();
}

console.log('PASS - authenticated operations canary, heartbeat persistence, and independent alert route');
