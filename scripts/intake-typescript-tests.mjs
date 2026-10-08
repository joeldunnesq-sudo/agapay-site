import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  loadAllRegistrations,
  loadAllKvRegistrations,
  loadAdminRegistrationPage,
  adminRegistrationSummary,
} from '../src/lib/registrations.js';
import { sanitizePublicRegistrationInput, registrationAgreementEvidence } from '../src/lib/registration-intake.js';
import { registrationRetryIdentity, insertRegistrationOnce } from '../src/lib/registration-retries.js';
import { saveReviewedRegistration } from '../src/lib/registration-publication.js';
import { saveContactLead, contactLeadView, resolveContactDelivery, getContactLead } from '../src/lib/contact-leads.js';
import { contactTestStore } from './lib/contact-test-store.mjs';

const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE registrations(reference TEXT PRIMARY KEY, parish_id TEXT, status TEXT, parish_name TEXT,
 community_type TEXT, stripe_account_id TEXT, stripe_subscription_id TEXT, received_at TEXT, updated_at TEXT, data TEXT)`);
const AGAPAY_DB = {
  prepare(sql) {
    return {
      params: [],
      bind(...params) {
        this.params = params;
        return this;
      },
      async run() {
        const result = db.prepare(sql).run(...this.params);
        return { success: true, meta: { changes: result.changes } };
      },
      async first() {
        return db.prepare(sql).get(...this.params) || null;
      },
      async all() {
        return { results: db.prepare(sql).all(...this.params) };
      },
    };
  },
};
const env = { AGAPAY_DB };
const registration = (reference, extra = {}) => ({
  reference,
  parishId: `parish-${reference}`,
  status: 'pending',
  parishName: 'Test Church',
  communityType: 'Parish',
  receivedAt: '2026-10-07T00:00:00Z',
  ...extra,
});
try {
  const first = registration('A');
  assert.equal(await insertRegistrationOnce(env, first), true);
  assert.equal(await insertRegistrationOnce(env, { ...first, parishName: 'Must not replace' }), false);
  assert.equal(
    JSON.parse(db.prepare('SELECT data FROM registrations WHERE reference = ?').get('A').data).parishName,
    'Test Church'
  );
  const next = { ...first, status: 'approved', parishUpdatedAt: '2026-10-07T01:00:00Z' };
  assert.equal(await saveReviewedRegistration({}, 'A', first, next), false);
  assert.equal(await saveReviewedRegistration(env, 'A', first, next), true);
  assert.equal(
    await saveReviewedRegistration(env, 'A', first, { ...next, status: 'denied' }),
    false,
    'stale review must not overwrite a concurrent approval'
  );
  const saved = db.prepare('SELECT * FROM registrations WHERE reference = ?').get('A');
  assert.equal(saved.status, 'approved');
  assert.equal(saved.updated_at, next.parishUpdatedAt);
  assert.deepEqual(JSON.parse(saved.data), next);
  const failedResult = {
    AGAPAY_DB: {
      prepare() {
        return {
          bind() {
            return {
              async run() {
                return { success: false, meta: { changes: 1 } };
              },
            };
          },
        };
      },
    },
  };
  assert.equal(await saveReviewedRegistration(failedResult, 'A', first, next), false);
  for (const ref of ['B', 'C', 'D'])
    await insertRegistrationOnce(
      env,
      registration(ref, { parishName: ref === 'C' ? 'Search Church' : 'Other Church' })
    );
  let page = await loadAdminRegistrationPage(env, { limit: 2 });
  assert.deepEqual(
    page.registrations.map((r) => r.reference),
    ['D', 'C']
  );
  assert.equal(page.hasMore, true);
  const second = await loadAdminRegistrationPage(env, { limit: 2, cursor: page.cursor });
  assert.deepEqual(
    second.registrations.map((r) => r.reference),
    ['B', 'A']
  );
  assert.equal(second.hasMore, false);
  assert.equal(second.cursor, null);
  assert.equal((await loadAdminRegistrationPage(env, { status: ' APPROVED ' })).registrations.length, 1);
  assert.equal((await loadAdminRegistrationPage(env, { q: ' search ' })).registrations[0].reference, 'C');
  assert.equal((await loadAdminRegistrationPage(env, { cursor: 'invalid' })).registrations.length, 4);
  assert.equal((await loadAllRegistrations(env, { hardLimit: 2 })).length, 2);
  assert.equal((await loadAllRegistrations(env, { status: 'approved' }))[0].reference, 'A');
  db.prepare('UPDATE registrations SET data = ? WHERE reference = ?').run('{bad', 'D');
  page = await loadAdminRegistrationPage(env, { limit: 2 });
  assert.deepEqual(page.registrations[0], { reference: 'D', status: 'unreadable' });
  assert.equal((await loadAllRegistrations(env)).length, 3);
  // More than one 250-row D1 page, with tied timestamps and malformed data.
  for (let i = 0; i < 260; i++) await insertRegistrationOnce(env, registration(`Z${String(i).padStart(3, '0')}`));
  const all = await loadAllRegistrations(env, { hardLimit: 263 });
  assert.equal(all.length, 263);
  assert.equal(new Set(all.map((r) => r.reference)).size, 263);
  const values = new Map([
    ['A', JSON.stringify(first)],
    ['B', JSON.stringify(registration('B', { status: 'approved', parishName: 'Search KV' }))],
    ['bad', '{broken'],
  ]);
  const kvEnv = {
    AGAPAY_REGISTRATIONS: {
      async list() {
        return { keys: [...values.keys()].map((name) => ({ name })), list_complete: true };
      },
      async get(key) {
        return values.get(key);
      },
    },
  };
  assert.equal((await loadAllKvRegistrations(kvEnv)).length, 2);
  assert.equal((await loadAllRegistrations(kvEnv, { status: 'approved' })).length, 1);
  page = await loadAdminRegistrationPage(kvEnv, { limit: 1 });
  assert.equal(page.source, 'kv');
  assert.equal(page.hasMore, true);
  assert.equal(
    (await loadAdminRegistrationPage(kvEnv, { cursor: page.cursor, limit: 1 })).registrations[0].reference,
    'B'
  );
  assert.equal((await loadAdminRegistrationPage(kvEnv, { query: 'search' })).registrations[0].reference, 'B');
  assert.equal(
    (await loadAdminRegistrationPage(kvEnv, { status: 'all' })).registrations.length,
    0,
    'preserve existing KV status filtering; any behavior fix is separate'
  );
  assert.deepEqual(await loadAllRegistrations({}), []);
  assert.equal(adminRegistrationSummary(null, 'fallback').reference, 'fallback');
  assert.equal(adminRegistrationSummary({}).status, 'pending');
  const request = (key) => new Request('https://example.test', { headers: key ? { 'Idempotency-Key': key } : {} });
  assert.equal(await registrationRetryIdentity(request(), {}), null);
  assert.deepEqual(await registrationRetryIdentity(request('bad'), {}), { error: 'Invalid registration retry key.' });
  const key = '12345678-1234-1234-1234-123456789abc';
  const identity = await registrationRetryIdentity(request(key), { b: { z: 2, a: 1 }, a: [1, 2] });
  assert.deepEqual(await registrationRetryIdentity(request(key), { a: [1, 2], b: { a: 1, z: 2 } }), identity);
  assert.notEqual(
    (await registrationRetryIdentity(request(key), { b: { z: 2, a: 1 }, a: [2, 1] })).hash,
    identity.hash
  );
  const input = Object.assign(Object.create({ priestEmail: 'inherited@example.test' }), {
    parishName: ' X '.repeat(200),
    status: 'approved',
    stripeAccountId: 'forbidden',
    canonicalAgreement: 'true',
    taxExemption: { jurisdiction: ' TX ', claimsExemption: 'yes', certified: true, status: 'approved' },
  });
  const sanitized = sanitizePublicRegistrationInput(input);
  assert.equal(sanitized.parishName.length, 200);
  assert.equal(Object.hasOwn(sanitized, 'priestEmail'), false);
  assert.equal(Object.hasOwn(sanitized, 'status'), false);
  assert.equal(Object.hasOwn(sanitized, 'stripeAccountId'), false);
  assert.equal(Object.hasOwn(sanitized, 'canonicalAgreement'), false);
  assert.deepEqual(sanitized.taxExemption, { jurisdiction: 'TX', claimsExemption: true, certified: true });
  for (const invalid of [null, [], false, 'text']) assert.deepEqual(sanitizePublicRegistrationInput(invalid), {});
  assert.equal(registrationAgreementEvidence('test-time').termsAcceptedAt, 'test-time');
} finally {
  db.close();
}

const contact = contactTestStore();
try {
  const input = {
    name: 'Test',
    email: 'test@example.test',
    organization: 'Parish',
    topic: 'Help',
    message: '<support>',
    attribution: { lastTouch: { timestamp: 'old', category: 'Referral' } },
  };
  const first = await saveContactLead(contact.env, input, 'stable-key');
  assert.equal(first.duplicate, false);
  assert.equal(first.row.notification_status, 'pending');
  assert.match(JSON.parse(first.row.notification_json).html, /&lt;support&gt;/);
  assert.notEqual(input.attribution.lastTouch.timestamp, 'old', 'preserve existing timestamp update');
  const second = await saveContactLead(contact.env, { ...input, attribution: null }, 'stable-key');
  assert.equal(second.duplicate, true);
  assert.equal(second.row.id, first.row.id);
  assert.equal(second.row.notification_json, first.row.notification_json, 'duplicate retains frozen notification');
  assert.deepEqual(await saveContactLead(contact.env, { ...input, message: 'changed' }, 'stable-key'), {
    conflict: true,
  });
  assert.equal((await saveContactLead(contact.env, input)).duplicate, false);
  assert.equal((await saveContactLead(contact.env, input)).duplicate, true, 'legacy same-day submission deduplicates');
  assert.equal(await getContactLead(contact.env, 'missing'), null);
  const row = first.row;
  assert.equal(
    contactLeadView({ ...row, notification_status: 'legacy_unknown', first_attempt_at: null }).reviewRequired,
    true
  );
  assert.equal(contactLeadView({ ...row, lease_until: Date.now() + 60000 }).retryAvailable, false);
  assert.equal(contactLeadView(row).retryAvailable, true);
  assert.equal((await resolveContactDelivery(contact.env, row, 'delivered')).id, row.id);
  assert.equal((await getContactLead(contact.env, row.id)).notification_status, 'sent');
  assert.equal(await resolveContactDelivery(contact.env, row, 'confirmed_not_delivered'), null);
} finally {
  contact.db.close();
}
console.log(
  'PASS - registration allowlist, stable retry identity, insert-once, publication CAS, D1/KV pagination, corrupt rows, contact deduplication and resolution'
);
