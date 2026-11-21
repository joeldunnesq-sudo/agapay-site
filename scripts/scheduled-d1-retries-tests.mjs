import assert from 'node:assert/strict';
import { withScheduledD1Retries } from '../src/operations/scheduled-d1-retries.js';
import { observeScheduledTask } from '../src/operations/scheduled-task-observer.js';
import { runScheduledRecurringTransactions } from '../src/accounting/recurring/scheduler.js';

const throttle = () =>
  new Error('D1_ERROR: Your account is generating too much load on D1 DBs. Please back off and try again later.');
const originalLog = console.log;
const originalError = console.error;
const originalFetch = globalThis.fetch;
console.log = () => {};
console.error = () => {};
try {
  let calls = 0,
    failUntil = 2;
  let failure = throttle();
  const delays = [];
  const db = {
    prepare(sql) {
      const statement = {
        bind(...values) {
          assert.deepEqual(values, ['parameter']);
          return statement;
        },
        async all() {
          assert.equal(this, statement);
          calls++;
          if (calls <= failUntil) throw failure;
          return { results: [{ ok: true }] };
        },
        async first() {
          return (await this.all()).results[0];
        },
        async run() {
          return this.all();
        },
      };
      return statement;
    },
    async batch(items) {
      assert.equal(this, db);
      return Promise.all(items.map((item) => item.all()));
    },
    withSession() {
      assert.equal(this, db);
      return db;
    },
  };
  const wrap = () =>
    withScheduledD1Retries(
      { DB: db, AGAPAY_DB: db, ACCOUNTING_DB: db },
      { sleep: async (ms) => delays.push(ms), random: () => 0 }
    );
  const env = wrap();
  assert.equal(env.DB, env.AGAPAY_DB);
  assert.notEqual(env.DB, db);
  assert.equal(db.prepare, db.prepare);
  assert.deepEqual(await env.DB.prepare('SELECT ?').bind('parameter').all(), { results: [{ ok: true }] });
  assert.deepEqual(delays, [1000, 2000]);
  assert.equal(calls, 3);
  assert.equal(env.DB.withSession(), env.DB);

  for (const sql of [
    'INSERT INTO ledger VALUES(1)',
    'UPDATE ledger SET version=version+1',
    'SELECT 1; DELETE FROM ledger',
    'WITH x AS (SELECT 1) SELECT * FROM x',
    'PRAGMA table_info(ledger)',
  ]) {
    calls = 0;
    failUntil = Infinity;
    delays.length = 0;
    await assert.rejects(wrap().DB.prepare(sql).run(), (error) => error === failure);
    assert.equal(calls, 1, sql);
    assert.deepEqual(delays, []);
  }
  calls = 0;
  failUntil = Infinity;
  delays.length = 0;
  await assert.rejects(wrap().DB.prepare('SELECT 1').all(), (error) => error === failure);
  assert.equal(calls, 4);

  let bookReads = 0;
  let persistentBooks = false;
  const central = {
    prepare(sql) {
      return {
        bind() {
          return this;
        },
        async first() {
          return null;
        },
        async all() {
          return {
            results: sql.includes('FROM accounting_entities')
              ? [{ parish_id: 'test', subscription_tier: 'parish', database_identifier: 'books' }]
              : [],
          };
        },
      };
    },
  };
  const books = {
    prepare() {
      return {
        bind() {
          return this;
        },
        async all() {
          bookReads++;
          if (persistentBooks || bookReads <= 2) throw throttle();
          return { results: [] };
        },
      };
    },
  };
  const accounting = () =>
    withScheduledD1Retries(
      {
        DB: central,
        AGAPAY_DB: central,
        ACCOUNTING_DB_BOOKS: books,
        ACCOUNTING_DATABASE_BINDINGS: JSON.stringify({ books: 'ACCOUNTING_DB_BOOKS' }),
      },
      { sleep: async () => {}, random: () => 0 }
    );
  const recurring = await runScheduledRecurringTransactions(accounting());
  assert.equal(recurring.parishes, 1);
  assert.ok(bookReads > 2, 'accounting scheduler recovers transient reads inside both recurring processors');
  persistentBooks = true;
  await assert.rejects(
    runScheduledRecurringTransactions(accounting()),
    /inspect the saved recurring runs/,
    'persistent parish failures must reject the scheduler instead of reporting completion'
  );
  assert.deepEqual(delays, [1000, 2000, 4000]);
  for (const message of [
    'D1_ERROR: no such table: jobs',
    'Network connection lost.',
    'D1_ERROR: daily row read limit exceeded',
    'unrelated overloaded service',
  ]) {
    calls = 0;
    delays.length = 0;
    failure = new Error(message);
    await assert.rejects(wrap().DB.prepare('SELECT 1').all(), (error) => error === failure);
    assert.equal(calls, 1);
  }
  failure = new Error('query failed', { cause: throttle() });
  calls = 0;
  failUntil = 1;
  await wrap().ACCOUNTING_DB.prepare('SELECT 1').first();
  assert.equal(calls, 2, 'wrapped D1 causes and accounting bindings are supported');

  calls = 0;
  failUntil = 1;
  failure = throttle();
  const batchEnv = wrap();
  await batchEnv.DB.batch([batchEnv.DB.prepare('SELECT 1')]);
  assert.equal(calls, 2);
  calls = 0;
  failUntil = Infinity;
  await assert.rejects(
    batchEnv.DB.batch([batchEnv.DB.prepare('UPDATE ledger SET version=version+1')]),
    (error) => error === failure
  );
  assert.equal(calls, 1, 'write batches never replay');

  calls = 0;
  failUntil = 1;
  const provider = {
    async resolve() {
      calls++;
      if (calls <= failUntil) throw failure;
      return { name: 'books' };
    },
    async query() {
      return this.resolve();
    },
  };
  const remote = withScheduledD1Retries(
    { ACCOUNTING_PROVISIONER: provider },
    { sleep: async () => {}, random: () => 0 }
  );
  await remote.ACCOUNTING_PROVISIONER.query('books', [{ sql: 'SELECT 1' }]);
  assert.equal(calls, 2);
  calls = 0;
  failUntil = Infinity;
  await assert.rejects(
    remote.ACCOUNTING_PROVISIONER.query('books', [{ sql: 'SELECT 1' }, { sql: 'INSERT INTO ledger VALUES(1)' }])
  );
  assert.equal(calls, 1, 'mixed RPC batches never replay');

  let emails = 0;
  globalThis.fetch = async () => {
    emails++;
    return Response.json({ id: 'sent' });
  };
  const alertEnv = { AGAPAY_OPS_ALERT_EMAIL: 'ops@example.test', RESEND_API_KEY: 'test' };
  calls = 0;
  failUntil = 2;
  delays.length = 0;
  await observeScheduledTask('recovered', wrap().DB.prepare('SELECT 1').all(), alertEnv);
  assert.equal(emails, 0, 'recovered throttling must not send email');
  calls = 0;
  failUntil = Infinity;
  await assert.rejects(observeScheduledTask('persistent', wrap().DB.prepare('SELECT 1').all(), alertEnv));
  assert.equal(emails, 1, 'exhausted retries still reach the alert pipeline');
  assert.equal(calls, 4);

  // The same invocation cannot accumulate unbounded retries across many reads.
  const bounded = wrap();
  delays.length = 0;
  for (let i = 0; i < 6; i++) {
    calls = 0;
    await assert.rejects(bounded.DB.prepare('SELECT 1').all());
  }
  assert.ok(delays.reduce((total, ms) => total + ms, 0) <= 20000);
} finally {
  console.log = originalLog;
  console.error = originalError;
  globalThis.fetch = originalFetch;
}
console.log('PASS - bounded scheduled D1 retries, accounting RPC, write safety, and persistent alerts');
