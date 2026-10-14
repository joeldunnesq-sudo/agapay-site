import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { recordAuditEvent, listAuditEvents } from '../src/lib/audit-log.js';
const db = new DatabaseSync(':memory:');
db.exec(await readFile(new URL('../migrations/0014_audit_log.sql', import.meta.url), 'utf8'));
const env = {
  AGAPAY_DB: {
    prepare(sql) {
      const statement = db.prepare(sql);
      let args = [];
      return {
        bind(...values) {
          args = values;
          return this;
        },
        async run() {
          return statement.run(...args);
        },
        async all() {
          return { results: statement.all(...args) };
        },
      };
    },
  },
};
const request = new Request('https://example.test', {
  headers: { 'CF-Connecting-IP': '203.0.113.9', 'X-Request-Id': 'from-header' },
});
const originalLog = console.log,
  originalError = console.error,
  originalWarn = console.warn;
const logs = [];
try {
  console.log = console.error = console.warn = (...args) => logs.push(args.join(' '));
  assert.equal(await recordAuditEvent(env, request), null);
  assert.equal(db.prepare('SELECT count(*) n FROM audit_log').get().n, 0);
  const id = await recordAuditEvent(env, request, {
    action: 'test.created',
    actorUserId: 'staff',
    actorRole: 'treasurer',
    targetType: 'gift',
    targetId: 'gift-a',
    organizationId: 'parish-a',
    householdId: 'home-a',
    reason: 'correction',
    before: { status: 'old' },
    after: { status: 'new' },
    metadata: { safe: true },
    requestId: 'override',
  });
  const stored = db.prepare('SELECT * FROM audit_log WHERE id=?').get(id);
  assert.equal(stored.request_id, 'override');
  assert.equal(stored.actor_type, 'admin');
  assert.equal(stored.ip_hash, createHash('sha256').update('203.0.113.9').digest('hex'));
  assert.ok(!JSON.stringify(stored).includes('203.0.113.9'));
  const headerId = await recordAuditEvent(env, request, { action: 'header' });
  assert.equal(db.prepare('SELECT request_id FROM audit_log WHERE id=?').get(headerId).request_id, 'from-header');
  const circular = {};
  circular.self = circular;
  const specialId = await recordAuditEvent(env, null, {
    action: 'special',
    before: circular,
    after: 'x'.repeat(5000),
    metadata: () => {},
  });
  const special = db.prepare('SELECT * FROM audit_log WHERE id=?').get(specialId);
  assert.equal(special.before_summary_json, null);
  assert.equal(special.metadata_json, null);
  assert.equal(special.ip_hash, null);
  assert.ok(special.after_summary_json.endsWith('(truncated)'));
  assert.equal(special.after_summary_json.length, 4012);
  db.prepare('UPDATE audit_log SET created_at=? WHERE id=?').run('2026-01-03', id);
  db.prepare('UPDATE audit_log SET created_at=? WHERE id=?').run('2026-01-02', headerId);
  db.prepare('UPDATE audit_log SET created_at=? WHERE id=?').run('2026-01-01', specialId);
  const first = await listAuditEvents(env, { limit: 1 });
  assert.equal(first.events[0].id, id);
  assert.equal(first.hasMore, true);
  assert.equal(first.cursor, '2026-01-03');
  const second = await listAuditEvents(env, { limit: 1, cursor: first.cursor });
  assert.equal(second.events[0].id, headerId);
  const filtered = await listAuditEvents(env, {
    action: 'test.created',
    actorUserId: 'staff',
    actorType: 'admin',
    targetType: 'gift',
    targetId: 'gift-a',
    organizationId: 'parish-a',
    since: '2026-01-02',
    until: '2026-01-04',
  });
  assert.equal(filtered.events.length, 1);
  assert.deepEqual(filtered.events[0].before, { status: 'old' });
  assert.deepEqual(filtered.events[0].metadata, { safe: true });
  assert.equal((await listAuditEvents(env, { organizationId: 'other' })).events.length, 0);
  assert.equal((await listAuditEvents(env, { action: "' OR 1=1 --" })).events.length, 0);
  const last = await listAuditEvents(env, { cursor: '2026-01-02' });
  assert.equal(last.hasMore, false);
  assert.equal(last.cursor, '');
  assert.equal(last.events[0].after, special.after_summary_json);
  assert.deepEqual(await listAuditEvents({}), { events: [], cursor: '' });
  assert.equal(await recordAuditEvent({}, null, { action: 'missing' }), null);
  assert.equal(
    await recordAuditEvent(
      {
        AGAPAY_DB: {
          prepare() {
            throw new Error('synthetic write failure');
          },
        },
      },
      request,
      { action: 'failed' }
    ),
    null
  );
  assert.ok(logs.some((line) => line.includes('audit_log.skipped_no_d1')));
  assert.ok(logs.some((line) => line.includes('audit_log.write_failed')));
} finally {
  db.close();
  console.log = originalLog;
  console.error = originalError;
  console.warn = originalWarn;
}
console.log(
  'PASS - audit persistence, IP hash, request identity, summary limits, filters, pagination and write-failure fallback'
);
