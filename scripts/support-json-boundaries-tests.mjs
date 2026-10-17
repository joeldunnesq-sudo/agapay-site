import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  getParishSupportTicket,
  listParishSupportTickets,
  submitParishSupportTicket,
  updateParishSupportTicket,
} from '../src/lib/parish-support-tickets.js';
import { sendEmail } from '../src/lib/email.js';

const prefix = '__agapay_parish_support_ticket:';
class MemoryKV {
  values = new Map();
  writes = 0;
  async get(key) {
    return this.values.get(key) ?? null;
  }
  async put(key, value) {
    this.writes++;
    this.values.set(key, value);
  }
  async list({ prefix, limit }) {
    return {
      keys: [...this.values.keys()]
        .filter((k) => k.startsWith(prefix))
        .slice(0, limit)
        .map((name) => ({ name })),
      list_complete: true,
    };
  }
}
const database = new DatabaseSync(':memory:');
database.exec('CREATE TABLE app_settings(key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
let databaseWrites = 0;
const db = {
  prepare(sql) {
    return {
      bind(...params) {
        return {
          async first() {
            return database.prepare(sql).get(...params) ?? null;
          },
          async all() {
            return { results: database.prepare(sql).all(...params) };
          },
          async run() {
            databaseWrites++;
            const result = database.prepare(sql).run(...params);
            return { meta: { changes: result.changes } };
          },
        };
      },
    };
  },
};
const kv = new MemoryKV(),
  env = { AGAPAY_DB: db, AGAPAY_REGISTRATIONS: kv };
const valid = {
  id: 'ticket',
  status: 'new',
  type: 'help',
  source: 'parish_dashboard',
  subject: 'Help',
  message: 'A detailed request',
  parishId: 'parish',
  parishName: 'Parish',
  submittedBy: 'reader@example.test',
  page: '',
  path: '',
  userAgent: '',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  adminNote: '',
  updatedBy: '',
  email: null,
  metadata: { future: true },
};
const insert = (id, value) =>
  database
    .prepare('INSERT OR REPLACE INTO app_settings VALUES(?,?,?)')
    .run(prefix + id, typeof value === 'string' ? value : JSON.stringify(value), '2026-01-01');
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw Error('Storage tests must not make network requests or send email');
};
try {
  const invalid = [
    '',
    '{',
    'null',
    '[]',
    'false',
    '42',
    '"text"',
    {},
    { ...valid, id: '' },
    { ...valid, id: 'other' },
    { ...valid, email: [] },
    { ...valid, email: {} },
    { ...valid, email: { status: false, sentAt: '' } },
    { ...valid, email: { status: 'sent', sentAt: 42 } },
  ];
  for (const field of [
    'status',
    'type',
    'source',
    'subject',
    'message',
    'parishId',
    'parishName',
    'submittedBy',
    'page',
    'path',
    'userAgent',
    'createdAt',
    'updatedAt',
    'adminNote',
    'updatedBy',
  ])
    invalid.push({ ...valid, [field]: {} }, { ...valid, [field]: null });
  for (const bad of invalid) {
    database.exec('DELETE FROM app_settings');
    kv.values.clear();
    insert('ticket', bad);
    kv.values.set(prefix + 'ticket', JSON.stringify(valid));
    const beforeWrites = [databaseWrites, kv.writes];
    assert.equal(await getParishSupportTicket(env, 'ticket'), null);
    assert.deepEqual(await listParishSupportTickets(env), [], 'Invalid canonical data must shadow stale KV');
    assert.deepEqual([databaseWrites, kv.writes], beforeWrites, 'Rejected reads never rewrite data');
    assert.equal((await updateParishSupportTicket(env, {}, 'ticket', { status: 'closed' })).status, 404);
    assert.deepEqual([databaseWrites, kv.writes], beforeWrites);
    const raw = typeof bad === 'string' ? bad : JSON.stringify(bad);
    kv.values.set(prefix + 'ticket', raw);
    assert.equal(await getParishSupportTicket({ AGAPAY_REGISTRATIONS: kv }, 'ticket'), null);
    assert.deepEqual(await listParishSupportTickets({ AGAPAY_REGISTRATIONS: kv }), []);
  }
  database.exec('DELETE FROM app_settings');
  kv.values.clear();
  insert('ticket', valid);
  kv.values.set(prefix + 'ticket', JSON.stringify({ ...valid, subject: 'stale' }));
  assert.deepEqual(await getParishSupportTicket(env, 'ticket'), valid);
  assert.deepEqual(await listParishSupportTickets(env, { limit: 1 }), [valid]);
  database.exec('DELETE FROM app_settings');
  assert.equal((await getParishSupportTicket(env, 'ticket')).subject, 'stale', 'Missing D1 may use KV');
  kv.values.clear();
  insert('legacy', { id: 'legacy', subject: 'Legacy', metadata: { kept: true } });
  const legacy = await getParishSupportTicket(env, 'legacy');
  assert.equal(legacy.status, 'new');
  assert.equal(legacy.message, '');
  assert.equal(legacy.email, null);
  assert.equal(legacy.metadata.kept, true);
  insert('notification', { ...valid, id: 'notification', email: { status: 'sent' } });
  assert.deepEqual((await getParishSupportTicket(env, 'notification')).email, { status: 'sent', sentAt: '' });
  const created = await submitParishSupportTicket(
    env,
    new Request('https://example.test/support'),
    { parishId: 'parish', parishName: 'Parish' },
    { message: 'A new support request' }
  );
  assert.equal(created.ok, true);
  assert.equal(created.ticket.email.status, 'not_configured');
  assert.deepEqual(await getParishSupportTicket(env, created.ticket.id), created.ticket);
  const updated = await updateParishSupportTicket(env, { actor: 'Admin' }, created.ticket.id, {
    status: 'resolved',
    note: 'Resolved',
  });
  assert.equal(updated.ok, true);
  assert.deepEqual(await getParishSupportTicket(env, created.ticket.id), updated.ticket);
} finally {
  globalThis.fetch = originalFetch;
  database.close();
}

const message = { from: 'sender@example.test', to: ['recipient@example.test'], subject: 'Synthetic only' };
let transportCalls = 0;
const originalError = console.error;
const logs = [];
console.error = (line) => logs.push(String(line));
try {
  for (const raw of ['', 'not-json', 'null', '[]', 'false', '42', '"text"', '{"id":42}', '{"id":[]}', '{"id":{}}']) {
    for (const status of [200, 429]) {
      globalThis.fetch = async (url, init) => {
        transportCalls++;
        assert.equal(String(url), 'https://api.resend.com/emails');
        assert.equal(init.headers['Idempotency-Key'], 'synthetic-idempotency');
        return new Response(raw, { status });
      };
      const result = await sendEmail({ RESEND_API_KEY: 'synthetic-never-real' }, message, {
        idempotencyKey: 'synthetic-idempotency',
      });
      assert.equal(result.httpStatus, status);
      assert.equal(result.body, raw);
      if (status === 200) {
        assert.equal(result.status, 'sent');
        assert.equal(result.id, '');
      } else {
        assert.equal(result.status, 'failed');
        assert.equal(result.errorCode, 'provider_rejected');
      }
    }
  }
  for (const raw of [
    '{"id":"message-id","extra":{"retained":true}}',
    '{"message":{"code":"limited"}}',
    '{"error":"declined"}',
  ]) {
    globalThis.fetch = async () => new Response(raw, { status: raw.includes('message-id') ? 200 : 429 });
    const result = await sendEmail({ RESEND_API_KEY: 'synthetic-never-real' }, message);
    if (raw.includes('message-id')) assert.equal(result.id, 'message-id');
    else assert.deepEqual(result.detail, JSON.parse(raw).message || JSON.parse(raw).error);
  }
  assert.equal(transportCalls, 20);
  assert.ok(!logs.join('\n').includes('synthetic-never-real'), 'Provider credentials never enter logs');
} finally {
  globalThis.fetch = originalFetch;
  console.error = originalError;
}
console.log(
  'PASS - support-ticket JSON validation, legacy defaults, identity binding, canonical shadowing and checked email-provider metadata'
);
