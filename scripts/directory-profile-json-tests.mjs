import assert from 'node:assert/strict';
import { searchMinistryParticipantCandidates } from '../src/directory/ministry-participants.js';
import { d1All } from '../src/lib/database-reads.js';
const context = { user: { id: 'staff' }, parishId: 'parish-a', capabilities: ['directory.ministries.manage'] };
for (const [raw, expected] of [
  ['{"donorName":"Maria","extra":true}', 'Maria'],
  ['{"householdName":"Family"}', 'Family'],
  ['{"donorName":12,"householdName":"Family"}', 'Family'],
  ['{"donorName":{},"householdName":[]}', 'member'],
  ['null', 'member'],
  ['[]', 'member'],
  ['"text"', 'member'],
  ['42', 'member'],
  ['{', 'member'],
  ['{"donorName":"  "}', 'Parishioner'],
]) {
  const queries = [];
  const env = {
    AGAPAY_DB: {
      prepare(sql) {
        return {
          bind(...params) {
            queries.push({ sql, params });
            return {
              async all() {
                return {
                  success: true,
                  results: sql.includes('FROM donors') ? [{ email: 'member@example.test', data: raw }] : [],
                };
              },
            };
          },
        };
      },
    },
  };
  const result = await searchMinistryParticipantCandidates(env, { context, query: 'member' });
  assert.equal(result[0].displayName, expected, raw);
  assert.equal(result[0].source, 'parish_profile');
  assert.equal(queries.length, 2);
  assert.ok(queries.every((q) => q.params[0] === 'parish-a'));
  await assert.rejects(
    searchMinistryParticipantCandidates(env, { context: { ...context, capabilities: [] }, query: 'member' })
  );
  assert.equal(queries.length, 2, 'denied search must not query profiles');
}
assert.deepEqual(await d1All({}, 'SELECT 1'), []);
assert.deepEqual(
  await d1All(
    {
      AGAPAY_DB: {
        prepare() {
          return {
            bind() {
              return {
                async all() {
                  return { success: true };
                },
              };
            },
          };
        },
      },
    },
    'SELECT 1'
  ),
  []
);
console.log(
  'PASS - directory profile JSON uses checked names, preserves parish scope, and D1 reads normalize envelopes'
);
