import assert from 'node:assert/strict';
import {
  getLearnCommunityResource,
  listLearnCommunityResources,
  submitLearnCommunityResource,
  createCuratedLearnCommunityResource,
} from '../src/learn/community-store.js';
import {
  getLearnFeedback,
  listLearnFeedback,
  submitLearnFeedback,
  updateLearnFeedbackStatus,
} from '../src/learn/feedback-store.js';
import { getLearnSeedSnapshot } from '../src/learn/demo-data.js';

const resourcePrefix = '__agapay_learn_community_resource:';
const feedbackPrefix = '__agapay_learn_feedback:';
function stores(prefix, { canonical = [], fallback = [], database = true } = {}) {
  const db = new Map(
    canonical.map(([id, value]) => [prefix + id, typeof value === 'string' ? value : JSON.stringify(value)])
  );
  const kv = new Map(
    fallback.map(([id, value]) => [prefix + id, typeof value === 'string' ? value : JSON.stringify(value)])
  );
  const writes = [];
  return {
    writes,
    db,
    kv,
    env: {
      ...(database
        ? {
            AGAPAY_DB: {
              prepare(sql) {
                return {
                  bind(...params) {
                    return {
                      async first() {
                        return db.has(params[0]) ? { value: db.get(params[0]) } : null;
                      },
                      async all() {
                        assert.match(sql, /SELECT key, value/);
                        return {
                          results: [...db]
                            .filter(([key]) => key.startsWith(prefix))
                            .map(([key, value]) => ({ key, value })),
                        };
                      },
                      async run() {
                        assert.match(sql, /INSERT INTO app_settings/);
                        db.set(params[0], params[1]);
                        writes.push(['d1', params[0]]);
                        return { success: true };
                      },
                    };
                  },
                };
              },
            },
          }
        : {}),
      AGAPAY_REGISTRATIONS: {
        async get(key) {
          return kv.get(key) ?? null;
        },
        async put(key, value) {
          kv.set(key, value);
          writes.push(['kv', key]);
        },
        async list({ prefix: requested }) {
          return {
            keys: [...kv.keys()].filter((key) => key.startsWith(requested)).map((name) => ({ name })),
            list_complete: true,
          };
        },
      },
    },
  };
}

for (const [prefix, get, list, valid] of [
  [
    resourcePrefix,
    getLearnCommunityResource,
    (env) => listLearnCommunityResources(env, { includeAll: true }),
    { id: 'record', status: 'approved', flags: [], metadata: { retained: true } },
  ],
  [
    feedbackPrefix,
    getLearnFeedback,
    listLearnFeedback,
    { id: 'record', status: 'new', userNotification: null, metadata: { retained: true } },
  ],
]) {
  const invalid = [
    '{',
    'null',
    '[]',
    '42',
    '"text"',
    '{}',
    '{"id":42}',
    { ...valid, id: 'other' },
    { ...valid, status: {} },
    { ...valid, submittedBy: [] },
    { ...valid, createdAt: 123 },
  ];
  invalid.push(
    ...(prefix === resourcePrefix
      ? [
          { ...valid, flags: [null] },
          { ...valid, flags: [{}] },
          { ...valid, flags: [{ email: {}, reason: '', createdAt: '' }] },
          { ...valid, pinned: 'yes' },
          { ...valid, vetted: 1 },
        ]
      : [
          { ...valid, userNotification: [] },
          { ...valid, userNotification: {} },
          { ...valid, userNotification: { status: 'sent', sentAt: 3 } },
          { ...valid, userNotification: { status: 'sent', httpStatus: {} } },
        ])
  );
  for (const bad of invalid) {
    const fixture = stores(prefix, { canonical: [['record', bad]], fallback: [['record', valid]] });
    assert.equal(await get(fixture.env, 'record'), null, `Reject canonical ${JSON.stringify(bad)}`);
    assert.deepEqual(await list(fixture.env), [], 'Rejected canonical data must shadow KV');
    assert.deepEqual(fixture.writes, [], 'Reads must never repair or delete storage');
    const kvOnly = stores(prefix, { database: false, fallback: [['record', bad]] });
    assert.equal(await get(kvOnly.env, 'record'), null);
    assert.deepEqual(await list(kvOnly.env), []);
  }
  const both = stores(prefix, {
    canonical: [['record', valid]],
    fallback: [['record', { ...valid, subject: 'stale' }]],
  });
  assert.deepEqual(await get(both.env, 'record'), valid);
  assert.deepEqual(await list(both.env), [valid]);
  const fallback = stores(prefix, { fallback: [['record', valid]] });
  assert.deepEqual(await get(fallback.env, 'record'), valid);
  assert.deepEqual(await list(fallback.env), [valid]);
  assert.equal(await get(fallback.env, ''), null);
}

const legacy = stores(feedbackPrefix, { canonical: [['legacy', { id: 'legacy', extra: 'kept' }]] });
assert.deepEqual(await getLearnFeedback(legacy.env, 'legacy'), { id: 'legacy', extra: 'kept', status: 'new' });
assert.equal((await listLearnFeedback(legacy.env))[0].status, 'new');
const minimal = stores(resourcePrefix, { fallback: [['legacy', { id: 'legacy' }]] });
assert.deepEqual(await getLearnCommunityResource(minimal.env, 'legacy'), { id: 'legacy' });
const seeded = getLearnSeedSnapshot().communityResources[0];
assert.ok(seeded?.id);
for (const database of [true, false]) {
  const fixture = stores(resourcePrefix, {
    database,
    ...(database ? { canonical: [[seeded.id, '{}']] } : { fallback: [[seeded.id, '{}']] }),
  });
  assert.equal(await getLearnCommunityResource(fixture.env, seeded.id), null);
  assert.ok(
    !(await listLearnCommunityResources(fixture.env, { includeSeeded: true, includeAll: true })).some(
      (row) => row.id === seeded.id
    )
  );
}
const identity = { email: 'reader@example.test', householdId: 'household' };
const resourceStore = stores(resourcePrefix);
const submitted = await submitLearnCommunityResource(resourceStore.env, identity, {
  title: 'Resource',
  url: 'https://example.test/resource',
  description: 'A learning resource',
  tags: ['learning'],
});
assert.equal(submitted.ok, true);
assert.deepEqual(await getLearnCommunityResource(resourceStore.env, submitted.resource.id), submitted.resource);
const feedbackStore = stores(feedbackPrefix);
const feedback = await submitLearnFeedback(feedbackStore.env, identity, {
  message: 'A detailed suggestion',
  subject: 'Suggestion',
});
assert.equal(feedback.ok, true);
assert.deepEqual(await getLearnFeedback(feedbackStore.env, feedback.feedback.id), feedback.feedback);

const curated = await createCuratedLearnCommunityResource(
  resourceStore.env,
  { actor: 'admin@example.test' },
  { title: 'Curated', url: 'https://example.test/curated', description: 'Approved resource' }
);
assert.equal(curated.ok, true);
assert.deepEqual(await getLearnCommunityResource(resourceStore.env, curated.resource.id), curated.resource);
const archived = await updateLearnFeedbackStatus(
  feedbackStore.env,
  new Request('https://example.test/feedback'),
  { actor: 'admin@example.test' },
  feedback.feedback.id,
  { status: 'archived' }
);
assert.equal(archived.ok, true);
assert.deepEqual(await getLearnFeedback(feedbackStore.env, feedback.feedback.id), archived.feedback);

console.log(
  'PASS - Learn stored JSON validation, legacy records, writer round trips, identity binding, and canonical shadowing'
);
