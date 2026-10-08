import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  ensureStFiacreParishLibraryDemo,
  getParishLibrarySettings,
  setParishLibraryEnabled,
  ST_FIACRE_LIBRARY_DEMO_RESOURCES,
} from '../src/lib/parish-library.js';
import { householdVerificationStatus, isHouseholdVerificationCurrent } from '../src/lib/household-verification.js';
import { directoryInvitationNext } from '../src/lib/directory-invitation-next.js';
import { parishLifeExperienceFor } from '../src/lib/parish-life-experience.js';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync('migrations/0105_parish_library.sql', 'utf8'));
const db = {
  prepare(sql) {
    return {
      params: [],
      bind(...params) {
        this.params = params;
        return this;
      },
      async first() {
        return sqlite.prepare(sql).get(...this.params) || null;
      },
      async run() {
        const r = sqlite.prepare(sql).run(...this.params);
        return { success: true, meta: { changes: r.changes } };
      },
    };
  },
};
try {
  assert.deepEqual(await getParishLibrarySettings(null, 'other'), { enabled: false, updatedAt: '' });
  assert.deepEqual(await getParishLibrarySettings(db, ''), { enabled: false, updatedAt: '' });
  assert.equal(await ensureStFiacreParishLibraryDemo(null, 'st-fiacre'), false);
  assert.equal(await ensureStFiacreParishLibraryDemo(db, 'other'), false);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM parish_library_resources').get().n, 0);
  assert.equal(await ensureStFiacreParishLibraryDemo(db, ' ST-FIACRE '), true);
  const resources = sqlite.prepare('SELECT * FROM parish_library_resources ORDER BY published_at DESC').all();
  assert.equal(resources.length, ST_FIACRE_LIBRARY_DEMO_RESOURCES.length);
  for (let i = 0; i < resources.length; i++) {
    const resource = resources[i],
      expected = ST_FIACRE_LIBRARY_DEMO_RESOURCES[i];
    assert.equal(resource.id, expected.id);
    assert.equal(resource.external_url, expected.url);
    assert.equal(resource.pinned, Number(expected.pinned));
    assert.equal(resource.parish_id, 'st-fiacre');
    assert.equal(resource.status, 'published');
    assert.equal(resource.resource_type, 'link');
    assert.equal(Date.parse(resource.published_at), Date.parse('2026-08-27T12:00:00.000Z') - i * 60000);
  }
  assert.equal(await ensureStFiacreParishLibraryDemo(db, 'st-fiacre'), false);
  assert.equal((await getParishLibrarySettings(db, 'st-fiacre')).enabled, true);
  assert.equal(
    (await setParishLibraryEnabled(db, { parishId: 'other', enabled: true, updatedBy: 'staff@example.test' })).enabled,
    true
  );
  assert.equal((await setParishLibraryEnabled(db, { parishId: 'other', enabled: false })).enabled, false);
  assert.equal(
    sqlite.prepare('SELECT updated_by FROM parish_library_settings WHERE parish_id = ?').get('other').updated_by,
    null
  );
  assert.equal((await getParishLibrarySettings(db, 'st-fiacre')).enabled, true, 'settings remain parish scoped');
  await setParishLibraryEnabled(db, { parishId: 'st-fiacre', enabled: false });
  assert.equal(
    (await getParishLibrarySettings(db, 'st-fiacre')).enabled,
    false,
    'existing demo resources do not re-enable settings'
  );
  sqlite.prepare('DELETE FROM parish_library_resources WHERE id = ?').run(resources[0].id);
  assert.equal(await ensureStFiacreParishLibraryDemo(db, 'st-fiacre'), false, 'preserve partial-seed behavior');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM parish_library_resources').get().n, resources.length - 1);
  await assert.rejects(
    getParishLibrarySettings(
      {
        prepare() {
          throw new Error('database unavailable');
        },
      },
      'other'
    ),
    /database unavailable/
  );
} finally {
  sqlite.close();
}
for (const row of [null, undefined, {}]) assert.equal(householdVerificationStatus(row, 1000), 'due');
for (const due of [undefined, null, 0, -1, 'invalid', Infinity, 999]) {
  const row = { verification_status: 'current', verification_due_at: due };
  assert.equal(householdVerificationStatus(row, 1000), 'overdue');
  assert.equal(isHouseholdVerificationCurrent(row, 1000), false);
}
for (const due of [1000, 1001, '1001'])
  assert.equal(
    isHouseholdVerificationCurrent({ verification_status: 'current', verification_due_at: due }, 1000),
    true
  );
assert.equal(
  householdVerificationStatus({ verification_status: 'CURRENT', verification_due_at: 999 }, 1000),
  'CURRENT'
);
assert.equal(
  householdVerificationStatus({ verification_status: 'revoked', verification_due_at: 999 }, 1000),
  'revoked'
);
const path = '/myagapay/directory?invite=' + 'a'.repeat(64);
assert.equal(directoryInvitationNext(path), path);
for (const bad of [
  null,
  undefined,
  {},
  true,
  '//evil.test',
  'https://evil.test' + path,
  path + '&next=evil',
  path + '#fragment',
  path.toUpperCase(),
  path.slice(0, -1),
  path + 'a',
  ' ' + path,
])
  assert.equal(directoryInvitationNext(bad), '');
for (const r of [null, undefined, { subscriptionTier: 'starter' }])
  assert.deepEqual(parishLifeExperienceFor(r), { communicationsEnabled: false, label: 'Today' });
assert.deepEqual(
  parishLifeExperienceFor({}),
  { communicationsEnabled: true, label: 'Koinonia' },
  'preserve existing empty-registration entitlement fallback'
);
assert.deepEqual(parishLifeExperienceFor({ subscriptionTier: 'parish', subscriptionStatus: 'active' }), {
  communicationsEnabled: true,
  label: 'Koinonia',
});
assert.deepEqual(
  parishLifeExperienceFor({ subscriptionTier: 'parish', subscriptionStatus: 'active', communicationsEnabled: false }),
  { communicationsEnabled: false, label: 'Today' }
);
console.log(
  'PASS - parish-scoped library settings/seeding, preserved partial-seed behavior, verification boundaries, exact invitation destinations and parish-life entitlement labels'
);
