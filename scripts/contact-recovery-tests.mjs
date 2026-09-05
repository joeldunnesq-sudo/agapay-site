import assert from 'node:assert/strict';
import { contactTestStore } from './lib/contact-test-store.mjs';
import { handleContact, handleAdminContactLeads } from '../src/handlers/contact.js';
import { deliverContactNotification, getContactLead, contactLeadView, resolveContactDelivery } from '../src/lib/contact-leads.js';
import { issueAdminSession } from '../src/lib/core.js';

const { db, env } = contactTestStore();
const originalFetch = globalThis.fetch;
const calls = [];
const submit = (extra = {}, binding = env) => handleContact(new Request('https://agapay.test/api/contact', {
  method: 'POST', headers: { 'CF-Connecting-IP': extra.ip || '192.0.2.1' },
  body: JSON.stringify({ name: 'Test', email: 'test@example.com', message: 'Recovery test', submissionId: 'same-submission-0001', ...extra }),
}), binding);
try {
  globalThis.fetch = async (_url, options) => { calls.push(options); return new Response('{"message":"provider rejected"}', { status: 500 }); };
  let response = await submit();
  let body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.notificationStatus, 'failed');
  assert.match(body.message, /saved/);
  const reference = body.reference;
  assert.equal((await getContactLead(env, reference)).attempts, 1);
  assert.equal(calls[0].headers['Idempotency-Key'], `contact/${reference}/0`);
  assert.ok(calls[0].signal);
  globalThis.fetch = async (_url, options) => { calls.push(options); return new Response('{"id":"provider-123"}'); };
  body = await (await submit()).json();
  assert.equal(body.reference, reference);
  assert.equal(body.notificationStatus, 'sent');
  assert.equal(calls[0].body, calls[1].body, 'retry must freeze exact email payload');
  assert.equal(calls[0].headers['Idempotency-Key'], calls[1].headers['Idempotency-Key']);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM contact_leads').get().n, 1);
  await submit();
  assert.equal(calls.length, 2, 'successful jobs must not resend');
  assert.equal((await submit({ message: 'changed content' })).status, 409);
  const rejected = await handleAdminContactLeads(new Request('https://agapay.test/api/admin/contact-leads'), env);
  assert.equal(rejected.status, 401);
  const deniedRetry = await handleAdminContactLeads(new Request(`https://agapay.test/api/admin/contact-leads/${reference}/retry`, { method: 'POST' }), env);
  assert.equal(deniedRetry.status, 401);

  // Hold one send open while another request tries to claim the same job.
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  let started;
  const sending = new Promise((resolve) => { started = resolve; });
  globalThis.fetch = async (_url, options) => { calls.push(options); started(); await wait; return new Response('{"id":"concurrent-123"}'); };
  const first = submit({ submissionId: 'concurrent-submission-0001' });
  await sending;
  const second = await submit({ submissionId: 'concurrent-submission-0001' });
  assert.equal((await second.json()).notificationStatus, 'review_required');
  release();
  await first;
  assert.equal(calls.length, 3);

  globalThis.fetch = async () => { throw new Error('simulated timeout'); };
  body = await (await submit({ submissionId: 'timeout-submission-0001' })).json();
  assert.equal(body.notificationStatus, 'error');
  const failedId = body.reference;
  db.prepare('UPDATE contact_leads SET first_attempt_at = ? WHERE id = ?').run(Date.now() - 86400000, failedId);
  assert.equal((await deliverContactNotification(env, failedId)).status, 'review_required');
  const old = await getContactLead(env, failedId);
  assert.equal(contactLeadView(old).retryAvailable, false);
  assert.equal(contactLeadView(old).reviewRequired, true);
  await resolveContactDelivery(env, old, 'confirmed_not_delivered');
  assert.equal(contactLeadView(await getContactLead(env, failedId)).retryAvailable, true);
  assert.equal(await resolveContactDelivery(env, old, 'confirmed_not_delivered'), null, 'stale resolution must not overwrite newer state');

  // Authenticated inbox uses existing Admin session controls.
  const session = await issueAdminSession(env, 'Audit Test', { mfaVerifiedAt: new Date().toISOString() });
  const adminResponse = await handleAdminContactLeads(new Request('https://agapay.test/api/admin/contact-leads', { headers: { Authorization: `Bearer ${session.token}` } }), env);
  assert.equal(adminResponse.status, 200);
  const inbox = await adminResponse.json();
  assert.ok(inbox.leads.some((lead) => lead.id === reference && lead.providerId === 'provider-123'));
  assert.equal(JSON.stringify(inbox).includes('notification_json'), false);
  const beforeFailure = calls.length;
  const failedStore = { ...env, AGAPAY_DB: { prepare() { throw new Error('database down'); } } };
  assert.equal((await submit({ ip: '192.0.2.2' }, failedStore)).status, 503);
  assert.equal(calls.length, beforeFailure);
  assert.equal((await handleContact(new Request('https://agapay.test/api/contact', { method: 'POST', body: 'x'.repeat(25000), headers: { 'CF-Connecting-IP': '192.0.2.3' } }), env)).status, 413);
  console.log('PASS - contact persistence, email failures, frozen idempotency, concurrent delivery, retry expiry, admin access, and storage failure');
} finally { globalThis.fetch = originalFetch; db.close(); }
