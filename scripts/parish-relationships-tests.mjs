import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { parishOccasions, localOccasionClock, retentionFromSnapshots, parishAttention } from '../src/lib/parish-relationships.js';
import { annualGivingReport, runParishMilestones, buildMilestoneMessage } from '../src/operations/parish-milestones.js';
import { handleAdminRelationships } from '../src/handlers/admin-relationships.js';
import { memoryRateLimiter } from './lib/memory-rate-limiter.mjs';
import { issueAdminSession } from '../src/lib/core.js';

const retained = retentionFromSnapshots({ a: { paid: true, cents: 100 }, b: { paid: true, cents: 100 } }, { a: { paid: true, cents: 150 }, c: { paid: true, cents: 100 } });
assert.deepEqual(retained, { opening: 2, retained: 1, lost: 1, rate: 50, revenueRate: 75, openingCents: 200, retainedCents: 150, newPaid: 1, changeCents: 50 });
assert.equal(retentionFromSnapshots({}, {}).rate, null);
assert.equal(localOccasionClock(new Date('2026-09-30T14:15:00Z')).hour, 9);
assert.equal(localOccasionClock(new Date('2026-01-30T15:15:00Z')).hour, 9);
assert.equal(parishOccasions({ receivedAt: '2024-02-29T00:00:00Z' }, '2025-01-01')[0].date, '2025-02-28');
assert.equal(parishOccasions({ patronalFeastDate: '99-99', patronalFeastName: 'Unknown' }, '2026-01-01').length, 0);
assert.equal(parishOccasions({ patronalFeast: 'pascha', liturgicalCalendar: 'julian' }, '2026-01-01')[0].date, '2026-04-12');
assert.equal(parishAttention({ status: 'verified', stripeAccountId: 'acct', stripeAccountStatus: 'charges_enabled' }), null);

const db = new DatabaseSync(':memory:');
db.exec(readFileSync('migrations/0001_production_records.sql', 'utf8'));
db.exec(readFileSync('migrations/0129_parish_relationships.sql', 'utf8'));
const env = { AGAPAY_TEST_MODE: '1', AGAPAY_RATE_LIMITER: memoryRateLimiter(), RESEND_API_KEY: 'mock-only', AGAPAY_DB: {
  prepare(sql) { return { bind(...values) { return {
    async run() { const result = db.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) } }; },
    async first() { return db.prepare(sql).get(...values) || null; },
    async all() { return { results: db.prepare(sql).all(...values) }; },
  }; } }; },
} };
const r = { reference: 'test-parish', parishId: 'test', parishName: '<Saint & Friends>', status: 'verified', receivedAt: '2023-09-30T00:00:00Z', priestEmail: 'priest@example.test', treasurerEmail: 'treasurer@example.test', subscriptionStatus: 'active', subscriptionMonthlyCents: 14900, patronalFeastName: 'Saint <Test>', patronalFeastDate: '09-30' };
db.prepare('INSERT INTO registrations(reference, parish_id, received_at, updated_at, data) VALUES (?, ?, ?, ?, ?)').run(r.reference, r.parishId, r.receivedAt, r.receivedAt, JSON.stringify(r));
const prefs = { anniversary: true, feast: true, recipient: r.treasurerEmail, feastRecipient: r.priestEmail, timeZone: 'America/Chicago' };
db.prepare('INSERT INTO parish_milestone_preferences VALUES (?, ?, ?)').run(r.reference, JSON.stringify(prefs), r.receivedAt);
function gift(id, date, amount, email, currency = 'usd', recurring = '', paid = 'paid', parish = 'test') {
  db.prepare('INSERT INTO donor_offerings(id, donor_email, parish_id, created_at, updated_at, payment_status, stripe_subscription_id, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, email, parish, date, date, paid, recurring, JSON.stringify({ giftAmountCents: amount, currency }));
}
gift('prior', '2025-01-01T00:00:00Z', 10000, 'one@example.test');
gift('current', '2026-01-01T00:00:00Z', 20000, 'one@example.test', 'usd', 'sub');
gift('eur', '2026-02-01T00:00:00Z', 3000, 'two@example.test', 'eur');
gift('failed', '2026-02-01T00:00:00Z', 90000, 'three@example.test', 'usd', '', 'failed');
gift('other', '2026-02-01T00:00:00Z', 90000, 'four@example.test', 'usd', '', 'paid', 'other');
const now = new Date('2026-09-30T14:15:00Z');
const report = await annualGivingReport(env, r, now);
assert.equal(report.donors, 2); assert.equal(report.returning, 1); assert.equal(report.growth, 100);
assert.equal(report.currencies.find(row => row.currency === 'usd').cents, 20000);
assert.equal(report.currencies.find(row => row.currency === 'eur').cents, 3000);
assert.equal((await annualGivingReport(env, { ...r, receivedAt: '2025-09-30T00:00:00Z' }, now)).growth, null);
const message = await buildMilestoneMessage(env, r, { kind: 'feast', title: 'Saint <Test>' }, now);
assert.ok(message.html.includes('Saint &lt;Test&gt;')); assert.ok(!message.html.includes('<Saint & Friends>'));
assert.equal((await handleAdminRelationships(new Request('https://agapay.test/api/admin/relationships'), env)).status, 401);
const session = await issueAdminSession(env, 'Local relationship test');
const request = (query = '', body) => new Request(`https://agapay.test/api/admin/relationships${query}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
const overview = await handleAdminRelationships(request(), env);
assert.equal(overview.status, 200);
assert.equal((await overview.json()).onboarding.firstGift, 1);
assert.equal((await handleAdminRelationships(request('?preview=feast&reference=test-parish'), env)).status, 200);
assert.equal((await handleAdminRelationships(request('', { reference: r.reference, preferences: { ...prefs, timeZone: 'Invalid/Zone' } }), env)).status, 400);
assert.equal((await handleAdminRelationships(request('', { reference: r.reference, preferences: { ...prefs, recipient: 'invalid' } }), env)).status, 400);
assert.equal((await handleAdminRelationships(request('', { reference: r.reference, preferences: prefs }), env)).status, 200);
let sends = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => { assert.equal(url, 'https://api.resend.com/emails'); assert.ok(options.headers['Idempotency-Key']); sends++; return new Response(JSON.stringify({ id: 'mock-' + sends }), { status: 200 }); };
try {
  await Promise.all([runParishMilestones(env, now.getTime()), runParishMilestones(env, now.getTime())]);
  assert.equal(sends, 2, 'Concurrent cron runs send each occasion once');
  await runParishMilestones(env, now.getTime()); assert.equal(sends, 2, 'Replays cannot resend');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM parish_relationship_snapshots').get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM parish_milestone_deliveries WHERE status = 'sent'").get().n, 2);
  db.prepare('DELETE FROM parish_milestone_deliveries').run();
  prefs.anniversary = false; prefs.feast = false;
  db.prepare('UPDATE parish_milestone_preferences SET data = ?').run(JSON.stringify(prefs));
  await runParishMilestones(env, now.getTime()); assert.equal(sends, 2, 'Disabled messages do not send');
  prefs.feast = true; db.prepare('UPDATE parish_milestone_preferences SET data = ?').run(JSON.stringify(prefs));
  globalThis.fetch = async () => { sends++; throw new Error('Ambiguous provider timeout'); };
  await runParishMilestones(env, now.getTime()); await runParishMilestones(env, now.getTime());
  assert.equal(sends, 3, 'Ambiguous outcomes never automatically resend');
  assert.equal(db.prepare('SELECT status FROM parish_milestone_deliveries').get().status, 'unconfirmed');
} finally { globalThis.fetch = originalFetch; db.close(); }
console.log('PASS - parish retention, calendar dates, accurate annual reports, authentication, preferences, and concurrent/ambiguous send protection');
