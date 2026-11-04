import assert from 'node:assert/strict';
import { supportResponseDueAt, SUPPORT_POLICY } from '../src/lib/support-policy.js';
import {
  submitParishSupportTicket,
  getParishSupportTicket,
  updateParishSupportTicket,
} from '../src/lib/parish-support-tickets.js';
import { operationalReadiness } from './operational-readiness.mjs';
import { readFile } from 'node:fs/promises';
assert.equal(SUPPORT_POLICY.email, 'support@agapay.app');
assert.equal(
  supportResponseDueAt('2026-11-02T15:00:00Z'),
  '2026-11-03T21:00:00.000Z',
  'Monday 9am plus 16 business hours is Tuesday 3pm Central'
);
assert.equal(
  supportResponseDueAt('2026-11-06T23:00:00Z'),
  '2026-11-10T19:00:00.000Z',
  'Friday 5pm target excludes the weekend'
);
assert.equal(
  supportResponseDueAt('2026-03-06T23:00:00Z'),
  '2026-03-10T18:00:00.000Z',
  'Central daylight-saving transition uses local office hours'
);
assert.equal(
  supportResponseDueAt('2026-11-02T15:00:00.123Z'),
  '2026-11-03T21:00:00.123Z',
  'Partial-minute precision is retained'
);
const values = new Map(),
  env = {
    AGAPAY_REGISTRATIONS: { get: async (k) => values.get(k) || null, put: async (k, v) => values.set(k, v) },
    RESEND_API_KEY: 'synthetic-key',
    AGAPAY_FROM_EMAIL: 'AGAPAY <hello@agapay.app>',
    AGAPAY_SUPPORT_EMAIL: 'support@agapay.app',
  };
const originalFetch = globalThis.fetch;
let notifications = 0;
try {
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /resend/);
    const body = JSON.parse(options.body);
    assert.deepEqual(body.to, ['support@agapay.app']);
    notifications++;
    return Response.json({ id: 'synthetic-message' });
  };
  const result = await submitParishSupportTicket(
    env,
    new Request('https://agapay.app/api/parish/dashboard/synthetic'),
    { parishId: 'synthetic', parishName: 'Synthetic parish', email: 'volunteer@example.test' },
    { subject: 'Synthetic support check', message: 'Please help explain this synthetic setup step.' }
  );
  assert.equal(result.ok, true);
  assert.equal(notifications, 1);
  assert(result.ticket.responseDueAt);
  assert.equal(result.ticket.firstResponseAt, '');
  await updateParishSupportTicket(env, { actor: 'operator' }, result.ticket.id, { status: 'in_progress' });
  assert.equal(
    (await getParishSupportTicket(env, result.ticket.id)).firstResponseAt,
    '',
    'Status updates are not a customer response'
  );
  await updateParishSupportTicket(env, { actor: 'operator' }, result.ticket.id, {
    status: 'in_progress',
    responded: true,
  });
  const responded = await getParishSupportTicket(env, result.ticket.id);
  assert(responded.firstResponseAt);
  assert.equal(responded.firstResponseBy, 'operator');
  globalThis.fetch = async () => {
    throw new Error('Synthetic email outage');
  };
  const failedEmail = await submitParishSupportTicket(
    env,
    new Request('https://agapay.app'),
    { parishId: 'synthetic' },
    { message: 'Synthetic ticket must remain available even when email fails.' }
  );
  assert.equal(failedEmail.ok, true);
  assert(['failed', 'error'].includes(failedEmail.ticket.email.status));
  assert(await getParishSupportTicket(env, failedEmail.ticket.id));
} finally {
  globalThis.fetch = originalFetch;
}
const config = JSON.parse(await readFile('config/operational-readiness.json', 'utf8')),
  now = new Date('2026-11-03T18:00:00Z');
const runs = Object.fromEntries(
  config.evidence.map((e) => [
    e.workflow,
    [
      {
        status: 'completed',
        conclusion: 'success',
        updated_at: now.toISOString(),
        html_url: 'https://example.test/evidence',
      },
    ],
  ])
);
assert.equal(operationalReadiness(config, runs, now).technicalReady, true);
assert.equal(
  operationalReadiness(config, runs, now).operationalReady,
  true,
  'The declared solo-owner policy is sufficient and optional backup coverage remains disclosed'
);
assert.equal(operationalReadiness(config, runs, now).ownership.backupAssigned, false);
runs[config.evidence[0].workflow].unshift({
  status: 'completed',
  conclusion: 'failure',
  updated_at: now.toISOString(),
});
assert.equal(
  operationalReadiness(config, runs, now).technicalReady,
  false,
  'An older green run cannot conceal the latest failure'
);
console.log(
  'PASS Central business-hour response targets, weekend/DST precision, persisted tickets during email outage, explicit response recording and truthful operational evidence'
);
