import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import * as notifications from '../src/lib/parish-notifications.js';
import { sendEmail, agapayEmailHtml } from '../src/lib/email.js';
import {
  getParishSupportTicket,
  listParishSupportTickets,
  submitParishSupportTicket,
  updateParishSupportTicket,
} from '../src/lib/parish-support-tickets.js';
import { attributionEmail, sanitizeAttribution } from '../src/lib/lead-attribution.js';
import { sanitizeAttribution as sharedSanitizer } from '../public/attribution-core.js';
import { createInvitation, listInvitationsForParish } from '../src/lib/memberships.js';

class MemoryKV {
  values = new Map();
  async get(key) {
    return this.values.get(key) ?? null;
  }
  async put(key, value) {
    this.values.set(key, String(value));
  }
  async list({ prefix = '', limit = 1000 } = {}) {
    return {
      keys: [...this.values.keys()]
        .filter((key) => key.startsWith(prefix))
        .slice(0, limit)
        .map((name) => ({ name })),
      list_complete: true,
    };
  }
}
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)');
db.exec(readFileSync('migrations/0014_audit_log.sql', 'utf8'));
db.exec(readFileSync('migrations/0020_platform_identity.sql', 'utf8'));
const AGAPAY_DB = {
  prepare(sql) {
    return {
      params: [],
      bind(...params) {
        this.params = params;
        return this;
      },
      async first() {
        return db.prepare(sql).get(...this.params) ?? null;
      },
      async all() {
        return { results: db.prepare(sql).all(...this.params), success: true };
      },
      async run() {
        const result = db.prepare(sql).run(...this.params);
        return { success: true, meta: { changes: result.changes } };
      },
    };
  },
};
const sent = [],
  assets = [],
  logs = [];
let provider = 'success';
const originalFetch = globalThis.fetch,
  originalError = console.error;
const pdf = Uint8Array.from({ length: 70000 }, (_, i) => i % 256);
const env = {
  RESEND_API_KEY: 'synthetic-only-key',
  AGAPAY_DB,
  AGAPAY_REGISTRATIONS: new MemoryKV(),
  AGAPAY_APP_URL: 'https://example.test',
  ASSETS: {
    async fetch(request) {
      assets.push(request.url);
      return new Response(pdf);
    },
  },
};
const registration = {
  parishId: 'parish-a',
  parishName: 'Parish <A>',
  city: 'Town',
  priestEmail: 'priest@example.test',
  treasurerEmail: 'treasurer@example.test',
  subscriptionTier: 'giving',
  subscriptionStatus: 'trialing',
  parishDashboardToken: 'synthetic-temporary-password',
};
console.error = (line) => logs.push(String(line));
globalThis.fetch = async (url, init) => {
  assert.equal(String(url), 'https://api.resend.com/emails', 'all transport is intercepted; no real email is sent');
  sent.push({ headers: init.headers, message: JSON.parse(init.body), signal: init.signal });
  if (provider === 'network') throw new Error('private-network-detail');
  if (provider === 'rejected') return new Response('{"message":"private-provider-detail"}', { status: 429 });
  if (provider === 'malformed') return new Response('not-json', { status: 200 });
  return Response.json({ id: 'synthetic-message-id' });
};
try {
  assert.equal(sanitizeAttribution, sharedSanitizer);
  assert.equal(notifications.htmlEscape('<x a="b">&'), '&lt;x a=&quot;b&quot;&gt;&amp;');
  assert.equal(notifications.monthLabel(-1), '');
  assert.equal(notifications.monthLabel(11), 'Dec');
  assert.equal(notifications.startOfYearUnix(new Date('2024-12-31T23:59:59Z')), Date.UTC(2024, 0, 1) / 1000);
  assert.match(notifications.generateDashboardToken(), /^agp_tmp_[0-9a-f]{32}$/);
  assert.match(agapayEmailHtml('https://example.test/', '<Unsafe>', '<p>Trusted body</p>'), /&lt;Unsafe&gt;/);
  assert.equal(await notifications.loadParishOnboardingGuideAttachment({}, 'https://example.test'), null);
  const attachment = await notifications.loadParishOnboardingGuideAttachment(env, 'https://example.test/');
  assert.deepEqual(Buffer.from(attachment.content, 'base64'), Buffer.from(pdf));
  assert.equal(assets.at(-1), 'https://example.test/docs/AGAPAY-Stripe-Setup-Guide.pdf');
  assert.equal(
    await notifications.loadParishOnboardingGuideAttachment(
      { ...env, ASSETS: { fetch: async () => new Response('', { status: 404 }) } },
      'https://example.test'
    ),
    null
  );
  assert.equal(
    await notifications.loadParishOnboardingGuideAttachment(
      {
        ...env,
        ASSETS: {
          fetch: async () => {
            throw Error('asset-failure');
          },
        },
      },
      'https://example.test'
    ),
    null
  );
  assert.equal(
    (await notifications.sendTreasurerStripeInvite(env, 'https://example.test', {})).status,
    'missing_recipient'
  );
  assert.equal(
    (
      await notifications.sendParishStaffAccessInvitation(env, 'https://example.test', registration, {
        email: 'bad',
        token: '',
      })
    ).status,
    'missing_recipient'
  );

  await notifications.sendTreasurerStripeInvite(env, 'https://example.test', registration);
  assert.deepEqual(sent.at(-1).message.to, ['treasurer@example.test']);
  assert.equal(sent.at(-1).message.attachments[0].content, attachment.content);
  assert.match(sent.at(-1).message.html, /Parish &lt;A&gt;/);
  assert.doesNotMatch(sent.at(-1).message.html, /synthetic-temporary-password/);
  await notifications.sendParishStaffAccessInvitation(env, 'https://example.test/', registration, {
    email: ' Staff@Example.test ',
    token: 'invite / token',
    roleTemplate: 'unknown',
  });
  assert.deepEqual(sent.at(-1).message.to, ['staff@example.test']);
  assert.match(sent.at(-1).message.text, /Parish staff/);
  assert.match(sent.at(-1).message.text, /invite%20%2F%20token/);
  assert.equal(sent.at(-1).message.reply_to, 'priest@example.test');
  await notifications.sendRegistrationConfirmation(env, 'https://example.test', {
    ...registration,
    treasurerEmail: registration.priestEmail,
  });
  assert.deepEqual(sent.at(-1).message.to, ['priest@example.test']);
  assert.equal(sent.at(-1).message.attachments, undefined);
  assert.match(sent.at(-1).message.text, /synthetic-temporary-password/);
  await notifications.sendParishPasswordResetEmail(
    env,
    'https://example.test',
    registration,
    'https://example.test/reset?token=a&b=2',
    ['reset@example.test']
  );
  assert.deepEqual(sent.at(-1).message.to, ['reset@example.test']);
  assert.match(sent.at(-1).message.html, /token=a&amp;b=2/);
  assert.doesNotMatch(sent.at(-1).message.text, /synthetic-temporary-password/);
  const attribution = {
    firstTouch: {
      category: 'Referral',
      source: '<script>',
      page: 'https://example.test',
      timestamp: '2026-01-01T12:00:00Z',
    },
  };
  await notifications.sendAdminRegistrationNotice(
    { ...env, AGAPAY_REGISTRATION_NOTIFY_EMAIL: 'onboarding@agapay.app' },
    'https://example.test',
    { ...registration, attribution }
  );
  assert.deepEqual(sent.at(-1).message.to, ['onboarding@agapay.app']);
  assert.match(sent.at(-1).message.html, /&lt;script&gt;/);
  assert.match(attributionEmail(attribution).text, /America\/Chicago/);

  const trial = await notifications.sendDashboardInvite(env, 'https://example.test', registration);
  assert.equal(trial.status, 'sent');
  assert.deepEqual(trial.recipients, ['priest@example.test', 'treasurer@example.test']);
  assert.equal(
    (await listInvitationsForParish(env, 'parish-a')).length,
    0,
    'trial branch does not create staff invitations'
  );
  assert.doesNotMatch(sent.at(-1).message.text, /synthetic-temporary-password/);
  const old = await createInvitation(env, {
    parishId: 'parish-a',
    email: 'treasurer@example.test',
    roleTemplate: 'treasurer',
    invitedByLegacyBearer: true,
  });
  const unrelated = await createInvitation(env, {
    parishId: 'parish-b',
    email: 'treasurer@example.test',
    roleTemplate: 'treasurer',
    invitedByLegacyBearer: true,
  });
  const paid = await notifications.sendDashboardInvite(env, 'https://example.test', {
    ...registration,
    subscriptionStatus: 'active',
  });
  assert.equal(paid.status, 'sent');
  assert.deepEqual(paid.recipients, ['treasurer@example.test']);
  assert.equal((await listInvitationsForParish(env, 'parish-a')).find((item) => item.id === old.id).status, 'revoked');
  assert.equal(
    (await listInvitationsForParish(env, 'parish-b')).find((item) => item.id === unrelated.id).status,
    'pending'
  );
  assert.equal(paid.access.treasurer.invitationId, paid.deliveries[0].invitationId);
  const inviteRow = db
    .prepare('SELECT token_hash,token_salt FROM membership_invitations WHERE id=?')
    .get(paid.access.treasurer.invitationId);
  const emailedToken = new URL(
    sent
      .at(-1)
      .message.text.split('\n')
      .find((line) => line.includes('/give/login?invite='))
  ).searchParams.get('invite');
  assert.notEqual(inviteRow.token_hash, emailedToken);
  assert.doesNotMatch(JSON.stringify(paid), new RegExp(emailedToken));
  provider = 'rejected';
  const failedInvite = await notifications.sendDashboardInvite(env, 'https://example.test', {
    ...registration,
    subscriptionStatus: 'active',
  });
  assert.equal(failedInvite.status, 'failed');
  assert.equal(failedInvite.access.treasurer.emailStatus, 'failed');
  const unconfigured = await notifications.sendDashboardInvite({ ...env, RESEND_API_KEY: '' }, 'https://example.test', {
    ...registration,
    subscriptionStatus: 'active',
  });
  assert.equal(unconfigured.status, 'not_configured');

  provider = 'success';
  const request = new Request('https://example.test/support', { headers: { 'user-agent': 'synthetic-agent' } });
  const invalid = await submitParishSupportTicket(env, request, registration, { message: 'short' });
  assert.equal(invalid.status, 400);
  const created = await submitParishSupportTicket(env, request, registration, {
    type: ' FEATURE ',
    source: 'myagapay',
    message: '<script>Help with this issue</script>',
    subject: '<Title>',
  });
  assert.equal(created.ok, true);
  assert.equal(created.ticket.type, 'feature');
  assert.equal(created.ticket.source, 'myagapay');
  assert.equal(created.ticket.email.status, 'sent');
  assert.match(sent.at(-1).message.html, /&lt;script&gt;/);
  assert.equal(sent.at(-1).message.reply_to, 'priest@example.test');
  const key = `__agapay_parish_support_ticket:${created.ticket.id}`;
  assert.deepEqual(JSON.parse(await env.AGAPAY_REGISTRATIONS.get(key)), created.ticket);
  assert.deepEqual(JSON.parse(db.prepare('SELECT value FROM app_settings WHERE key=?').get(key).value), created.ticket);
  await env.AGAPAY_REGISTRATIONS.put(key, JSON.stringify({ ...created.ticket, subject: 'stale KV copy' }));
  assert.equal(
    (await getParishSupportTicket(env, created.ticket.id)).subject,
    '<Title>',
    'D1 wins over a stale KV record'
  );
  const listed = await listParishSupportTickets(env, { limit: 1 });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].subject, '<Title>');
  assert.equal(
    (await updateParishSupportTicket(env, { actor: 'Admin' }, created.ticket.id, { status: 'invalid' })).status,
    400
  );
  assert.equal((await updateParishSupportTicket(env, { actor: 'Admin' }, 'missing', { status: 'closed' })).status, 404);
  const updated = await updateParishSupportTicket(env, { actor: 'Admin' }, created.ticket.id, {
    status: 'resolved',
    note: ' note ',
  });
  assert.equal(updated.ticket.adminNote, 'note');
  assert.equal(updated.ticket.updatedBy, 'Admin');
  const kvOnly = { AGAPAY_REGISTRATIONS: new MemoryKV() };
  await kvOnly.AGAPAY_REGISTRATIONS.put('__agapay_parish_support_ticket:bad', '{invalid');
  assert.equal(await getParishSupportTicket(kvOnly, 'bad'), null);
  assert.deepEqual(await listParishSupportTickets(kvOnly), []);
  const offline = await submitParishSupportTicket(kvOnly, request, registration, {
    message: 'Offline support request',
  });
  assert.equal(offline.ticket.email.status, 'not_configured');
  provider = 'network';
  const deliveryFailed = await submitParishSupportTicket(env, request, registration, {
    message: 'Support request with delivery failure',
  });
  assert.equal(deliveryFailed.ok, true, 'a provider failure does not discard the stored ticket');
  assert.equal(deliveryFailed.ticket.email.status, 'error');
  assert.ok(await getParishSupportTicket(env, deliveryFailed.ticket.id));
  provider = 'malformed';
  const result = await sendEmail(
    env,
    { from: 'sender@example.test', to: ['test@example.test'], subject: 'test' },
    { idempotencyKey: 'stable-test-key' }
  );
  assert.equal(result.status, 'sent');
  assert.equal(result.id, '');
  assert.equal(sent.at(-1).headers['Idempotency-Key'], 'stable-test-key');
  assert.doesNotMatch(
    logs.join('\n'),
    /synthetic-only-key|private-provider-detail|private-network-detail|synthetic-temporary-password/
  );
  console.log('Notification and support TypeScript regressions passed.');
} finally {
  globalThis.fetch = originalFetch;
  console.error = originalError;
  db.close();
}
