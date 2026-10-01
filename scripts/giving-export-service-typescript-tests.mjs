import assert from 'node:assert/strict';
import * as service from '../src/lib/monthly-giving-export.js';
import * as csv from '../src/lib/monthly-giving-csv.js';
import { createOutsideGiftsFixture } from './lib/outside-gifts-fixture.mjs';
for (const name of ['csvCell', 'givingExportOptions', 'givingExportRows', 'monthlyGivingCsv'])
  assert.equal(service[name], csv[name]);
const request = (query = 'month=2026-01&groupBy=date') => new Request('https://parish.test/export?' + query);
const run = (env, query, parish = 'a/b') =>
  service.exportMonthlyGiving(request(query), env, parish, { timezone: 'UTC' });
assert.equal((await run({}, 'month=bad')).status, 422);
assert.equal((await run({}, 'month=2026-01&groupBy=bad')).status, 422);
assert.equal((await run({})).status, 503);
const record = (i) => ({
  id: String(i).padStart(6, '0'),
  data: JSON.stringify({
    createdAt: '2026-01-03T12:00:00Z',
    donorName: 'Sample',
    donorEmail: 'sample@example.test',
    amountCents: 1000,
  }),
  created_at: '2026-01-03T12:00:00Z',
  status: 'paid',
  payment_status: 'paid',
});
function database({ count = 0, onlineError, outsideError, bad = false, outside = [] } = {}) {
  const calls = [];
  return {
    calls,
    env: {
      AGAPAY_DB: {
        prepare(sql) {
          return {
            bind(...args) {
              return {
                async all() {
                  calls.push({ sql, args });
                  if (sql.includes('FROM donor_offerings')) {
                    if (onlineError) throw onlineError;
                    const offset = args[1] ? Number(args[1]) + 1 : 0;
                    return {
                      results: Array.from({ length: Math.min(500, Math.max(0, count - offset)) }, (_, j) => ({
                        ...record(offset + j),
                        ...(bad ? { data: '{' } : {}),
                      })),
                    };
                  }
                  if (outsideError) throw outsideError;
                  return { results: outside };
                },
              };
            },
          };
        },
      },
    },
  };
}
const paged = database({ count: 501 });
const response = await run(paged.env);
assert.equal(response.status, 200);
assert.equal(response.headers.get('X-AGAPAY-Export-Rows'), '501');
assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
assert.equal(response.headers.get('Vary'), 'Authorization');
assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
assert.equal(response.headers.get('Content-Type'), 'text/csv; charset=utf-8');
assert.match(response.headers.get('Content-Disposition'), /a-b-giving-2026-01-by-date.csv/);
const bytes = new Uint8Array(await response.arrayBuffer());
assert.deepEqual([...bytes.slice(0, 3)], [239, 187, 191]);
assert.equal(new TextDecoder().decode(bytes).split('\r\n').length, 503);
const onlineCalls = paged.calls.filter((c) => c.sql.includes('FROM donor_offerings'));
assert.equal(onlineCalls.length, 2);
assert.deepEqual(
  onlineCalls.map((c) => c.args.slice(0, 2)),
  [
    ['a/b', ''],
    ['a/b', '000499'],
  ]
);
assert.equal(onlineCalls[0].args[4], 500);
assert.match(onlineCalls[0].sql, /parish_id = \?1 AND id > \?2/);
const limit = await run(database({ count: 25001 }).env);
assert.equal(limit.status, 413);
assert.match((await limit.json()).error, /no partial CSV/);
assert.equal((await run(database({ count: 1, bad: true }).env)).status, 409);
assert.equal((await run(database({ outsideError: new Error('database unavailable') }).env)).status, 409);
assert.equal((await run(database({ outsideError: new Error('no such table: outside_gift_details') }).env)).status, 200);
const failure = new Error('online query failed');
await assert.rejects(run(database({ onlineError: failure }).env), (e) => e === failure);
const f = await createOutsideGiftsFixture();
try {
  const created = await f.outside('', {
    requestKey: crypto.randomUUID(),
    entryDate: f.month + '-03',
    amountCents: 12345,
    source: 'check',
    fundId: 'general',
    giverReferenceId: 'sample_0_0',
    reference: 'CSV integration',
    confirmedNotDuplicate: true,
    givingKind: 'other',
  });
  assert.equal(created.status, 201);
  const id = (await created.json()).gift.id;
  const result = await service.exportMonthlyGiving(
    request('month=' + f.month + '&groupBy=giver'),
    f.env,
    f.registration.parishId,
    f.registration
  );
  assert.equal(result.status, 200);
  const text = await result.text();
  assert.ok(text.includes(id));
  assert.ok(text.includes('CSV integration'));
  assert.ok(Number(result.headers.get('X-AGAPAY-Export-Rows')) > 1);
  const foreign = await service.exportMonthlyGiving(request('month=' + f.month), f.env, 'foreign', f.registration);
  assert.equal(foreign.headers.get('X-AGAPAY-Export-Rows'), '0');
  const stored = f.db
    .prepare(
      'SELECT m.*, d.*, o.data AS giver_data FROM manual_income_entries m JOIN outside_gift_details d ON d.gift_id=m.id LEFT JOIN donor_offerings o ON o.id=d.giver_reference_id WHERE m.id=?'
    )
    .get(id);
  assert.equal(
    (await run(database({ count: 25000, outside: [{ ...stored, entry_date: '2026-01-03' }] }).env)).status,
    413
  );
} finally {
  f.dispose();
}
console.log('PASS - typed monthly export service: paging, completeness, private CSV, failures and SQLite integration');
