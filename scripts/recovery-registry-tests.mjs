import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { portabilityFixture } from './portability-tests/fixtures.mjs';
import { registryPlan } from './lib/recovery-registry-plan.mjs';
import { fileOwnerEvidence } from './lib/recovery-file-owner.mjs';
import { FILE_BINDINGS, canonicalBinding } from '../src/portability/storage.js';
const f = await portabilityFixture();
const oldOwner = { state: 'stored', etag: 'unchanged', parish_id: 'parish-a' };
assert.equal(fileOwnerEvidence({ etag: 'unchanged' }, null, oldOwner).parishId, 'parish-a');
assert.equal(fileOwnerEvidence({ etag: 'changed' }, null, oldOwner).parishId, '');
assert.equal(fileOwnerEvidence({ etag: 'unchanged', metadataOwner: 'parish-b' }, null, oldOwner).conflict, true);
assert.equal(fileOwnerEvidence({ etag: 'unchanged' }, null, { ...oldOwner, state: 'pending' }).unsettled, true);
const proposal = {
  checkedAt: new Date().toISOString(),
  physicalKeySetSha256: 'a'.repeat(64),
  objects: [
    {
      binding: 'DIRECTORY_MEDIA',
      objectKey: "parish-a/new'file",
      parishId: 'parish-a',
      disposition: 'delete',
      state: 'stored',
      etag: 'new',
    },
  ],
  legacyKeys: [
    {
      objectKey: 'parish-feature-requests:parish-a',
      parishId: 'parish-a',
      sourceHash: 'b'.repeat(64),
      state: 'stored',
    },
  ],
};
const current = () => ({
  objects: f.db.prepare('SELECT * FROM parish_portability_objects').all(),
  legacy: f.db.prepare('SELECT * FROM parish_portability_legacy_keys').all(),
});
try {
  f.db.exec(
    "INSERT INTO parish_portability_objects(binding,object_key,parish_id,disposition,state,etag,updated_at) VALUES('DIRECTORY_MEDIA','gone','parish-a','delete','stored','old',1)"
  );
  f.db.exec(registryPlan(proposal, current()));
  assert.equal(
    f.db.prepare("SELECT state FROM parish_portability_objects WHERE object_key='gone'").get().state,
    'deleted'
  );
  assert.equal(
    f.db.prepare('SELECT etag FROM parish_portability_objects WHERE object_key=?').get("parish-a/new'file").etag,
    'new'
  );
  assert.equal(
    f.db.prepare('SELECT COUNT(*) n FROM parish_portability_inventory_reviews').get().n,
    new Set(FILE_BINDINGS.map(canonicalBinding)).size
  );
  f.db.exec(registryPlan(proposal, current()));
  assert.equal(
    f.db.prepare('SELECT COUNT(*) n FROM parish_portability_objects').get().n,
    2,
    'reconciliation is repeatable'
  );
  const conflict = structuredClone(proposal);
  conflict.objects[0].parishId = 'parish-b';
  assert.throws(() => registryPlan(conflict, current()), /never be reassigned/);
  f.db.prepare("UPDATE parish_portability_objects SET state='pending' WHERE object_key=?").run("parish-a/new'file");
  assert.throws(() => registryPlan(proposal, current()), /Pending object/);
  assert.equal(f.db.prepare("SELECT preferred_name FROM directory_people WHERE id='a'").get().preferred_name, 'Alpha');
  const plan = spawnSync(process.execPath, ['scripts/recovery-production-registry.mjs'], {
    encoding: 'utf8',
    env: { ...process.env, CLOUDFLARE_API_TOKEN: '' },
  });
  assert.equal(plan.status, 0, plan.stderr);
  assert.match(plan.stdout, /No default provider writes/);
  console.log(
    'PASS - registry reconciliation updates only ownership metadata, preserves tombstones, rejects reassignment and pending writes, and defaults to no writes'
  );
} finally {
  f.db.close();
}
