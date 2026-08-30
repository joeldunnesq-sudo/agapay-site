import assert from 'node:assert/strict';
import { handleOperationsCanary, handleOperationsMonitorAlert } from '../src/operations/monitoring.js';
import { recordScheduledHeartbeat } from '../src/operations/scheduled-heartbeats.js';

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

console.log('PASS - authenticated operations canary, heartbeat persistence, and independent alert route');
