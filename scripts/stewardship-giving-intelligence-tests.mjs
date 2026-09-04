import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { runInNewContext } from 'node:vm';
import { readStewardshipGivingMix } from '../src/lib/stewardship-giving.js';

// Exercise the real handler and SQL against SQLite without calling parish services.
const source = readFileSync(new URL('../src/handlers/stewardship-giving.js', import.meta.url), 'utf8');
const start = source.indexOf('async function handleStewardshipGivingRecurring(');
const end = source.indexOf('// GET /api/parish/dashboard/:parishId/stewardship/giving/health-score', start);
assert.ok(start > 0 && end > start);
let authorized = true;
let locked = false;
const handler = runInNewContext(source.slice(start, end) + '\nhandleStewardshipGivingRecurring', {
  URL,
  Date,
  Request,
  readStewardshipGivingMix,
  verifyParishDashboard: async () => authorized,
  unauthorized: () => new Response(null, { status: 401 }),
  requireStewardshipFeature: async () => (locked ? new Response(null, { status: 403 }) : null),
  json: (body) => Response.json(body),
});
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE donor_offerings (
  parish_id TEXT, donor_email TEXT, payment_status TEXT,
  stripe_subscription_id TEXT, created_at TEXT, data TEXT
)`);
const env = {
  AGAPAY_DB: {
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        bind(...args) {
          return {
            first: async () => statement.get(...args),
            all: async () => ({ results: statement.all(...args) }),
          };
        },
      };
    },
  },
};
const year = new Date().getFullYear();
const request = new Request(`https://parish.test/stewardship/giving/recurring?year=${year}`);
const insert = db.prepare('INSERT INTO donor_offerings VALUES (?, ?, ?, ?, ?, ?)');
function gift(cents, subscription = null, date = new Date().toISOString(), status = 'paid', parish = 'test') {
  insert.run(
    parish,
    'donor@example.test',
    status,
    subscription,
    date,
    JSON.stringify({ giftAmountCents: cents, frequency: subscription ? 'monthly' : 'once' })
  );
}
async function result() {
  return (await handler(request, env, 'test')).json();
}
try {
  assert.equal((await result()).pct_of_total_giving_recurring, null, 'empty giving must not imply 0% recurring');
  gift(30000);
  assert.equal((await result()).pct_of_total_giving_recurring, 0);
  gift(10000, 'sub-active');
  const mixed = await result();
  assert.equal(mixed.pct_of_total_giving_recurring, 25, 'use received gifts, not annualized MRR');
  assert.equal(mixed.monthly_recurring_revenue_cents, 10000, 'MRR remains a separate projection');
  gift(10000, 'sub-prior', `${year - 1}-12-31T23:59:59Z`);
  gift(10000, 'sub-next', `${year + 1}-01-01T00:00:00Z`);
  gift(10000, 'sub-failed', undefined, 'failed');
  gift(10000, 'sub-other', undefined, 'paid', 'other-parish');
  assert.equal(
    (await result()).pct_of_total_giving_recurring,
    25,
    'exclude other years, failed gifts, and other parishes'
  );
  gift(20000, 'sub-final-day', `${year}-12-31T23:59:59Z`);
  assert.equal((await result()).pct_of_total_giving_recurring, 50, 'include the entire last day of the year');
  db.exec('DELETE FROM donor_offerings');
  gift(10000, 'sub-only');
  assert.equal((await result()).pct_of_total_giving_recurring, 100);
  authorized = false;
  assert.equal((await handler(request, env, 'test')).status, 401);
  authorized = true;
  locked = true;
  assert.equal((await handler(request, env, 'test')).status, 403);
  console.log('PASS - recurring received-gift share, year boundaries, parish isolation, and access gates');
} finally {
  db.close();
}
