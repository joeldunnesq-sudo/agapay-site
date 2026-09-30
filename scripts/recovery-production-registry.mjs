// Reconcile ownership metadata only after reviewing fresh complete audit hashes.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { sha256 } from '../src/portability/archive.js';
import { registryPlan } from './lib/recovery-registry-plan.mjs';
import { FILE_BINDINGS, canonicalBinding } from '../src/portability/storage.js';
import { POLICY_VERSION } from '../src/portability/catalog.js';

const args = process.argv.slice(2);
if (!args.length) {
  console.log(
    'Plan: reconcile only R2/KV ownership metadata using --apply and both fresh reviewed audit hashes. No default provider writes.'
  );
  process.exit(0);
}
assert.equal(args[0], '--apply');
assert.equal(args.length, 3);
for (const hash of args.slice(1)) assert.match(hash, /^[a-f0-9]{64}$/);
const config = readFileSync('wrangler.toml', 'utf8').split(/^\[env\.staging\]/m)[0];
for (const flag of ['PARISH_RECOVERY_ENABLED', 'PARISH_STORAGE_GUARDS_ENABLED', 'PARISH_AUTOMATIC_CLOSURE_ENABLED'])
  assert.match(config, new RegExp(`^${flag} = "false"$`, 'm'));
const dir = path.resolve('artifacts/portability-staging');
const proposal = JSON.parse(readFileSync(path.join(dir, 'production-storage-registry-proposal.json'), 'utf8'));
const evidence = JSON.parse(readFileSync(path.join(dir, 'production-storage-ownership.json'), 'utf8'));
assert.equal(proposal.status, 'verified_ready_for_registry_review');
assert.equal(evidence.status, proposal.status);
assert.equal(proposal.checkedAt, evidence.checkedAt);
const age = Date.now() - Date.parse(proposal.checkedAt);
assert.ok(age >= 0 && age <= 30 * 60000, 'Fresh audit required');
assert.deepEqual(proposal.issues, []);
assert.deepEqual(proposal.unclassifiedLegacyKeys, []);
assert.equal(await sha256(JSON.stringify(proposal.objects)), args[1]);
assert.equal(proposal.registrySha256, args[1]);
assert.equal(await sha256(JSON.stringify(proposal.legacyKeys)), args[2]);
assert.equal(proposal.legacyRegistrySha256, args[2]);
assert.equal(evidence.registrySha256, args[1]);
assert.equal(evidence.legacyRegistrySha256, args[2]);
function command(args) {
  const result = spawnSync(
    process.execPath,
    ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'agapay-production', '--remote', ...args],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } }
  );
  assert.equal(result.status, 0, 'Ownership metadata operation failed; inspect protected provider diagnostics');
  return result.stdout.replace(/\x1b\[[0-9;]*m/g, '').trim();
}
function read(sql) {
  const rows = JSON.parse(command(['--command', sql, '--json']));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].success, true);
  assert.equal(rows[0].meta.rows_written, 0);
  assert.equal(rows[0].meta.changed_db, false);
  return rows[0].results;
}
const active = read(
  "SELECT (SELECT COUNT(*) FROM parish_portability_storage_operations) uploads,(SELECT COUNT(*) FROM parish_recovery_operations WHERE status IN ('running','paused')) recoveries,(SELECT COUNT(*) FROM parish_portability_jobs WHERE status IN ('preparing','deleting')) exports"
)[0];
assert.deepEqual(
  active,
  { uploads: 0, recoveries: 0, exports: 0 },
  'Wait for active operations before registry reconciliation'
);
const objects = () =>
  read(
    'SELECT binding,object_key,parish_id,disposition,state,etag FROM parish_portability_objects ORDER BY binding,object_key'
  );
const legacy = () =>
  read('SELECT object_key,parish_id,source_hash,state FROM parish_portability_legacy_keys ORDER BY object_key');
const sql = registryPlan(
  { ...proposal, physicalKeySetSha256: evidence.physicalKeySetSha256 },
  { objects: objects(), legacy: legacy() }
);
const sqlPath = path.join(dir, 'recovery-registry-reconcile.sql');
writeFileSync(sqlPath, sql);
command(['--file', sqlPath, '--yes']);
const actualObjects = objects()
  .filter((r) => r.state === 'stored')
  .map((r) => ({
    binding: r.binding,
    objectKey: r.object_key,
    parishId: r.parish_id,
    disposition: r.disposition,
    state: r.state,
    etag: r.etag,
    evidence: proposal.objects.find((p) => p.binding === r.binding && p.objectKey === r.object_key)?.evidence || [],
  }))
  .sort((a, b) => (a.binding + '\0' + a.objectKey).localeCompare(b.binding + '\0' + b.objectKey));
const actualLegacy = legacy()
  .filter((r) => r.state === 'stored')
  .map((r) => ({ objectKey: r.object_key, parishId: r.parish_id, sourceHash: r.source_hash, state: r.state }))
  .sort((a, b) => a.objectKey.localeCompare(b.objectKey));
assert.equal(await sha256(JSON.stringify(actualObjects)), args[1]);
assert.equal(await sha256(JSON.stringify(actualLegacy)), args[2]);
const reviews = read(
  'SELECT binding,policy_version,evidence_sha256 FROM parish_portability_inventory_reviews ORDER BY binding'
);
assert.deepEqual(
  reviews.map((r) => r.binding),
  [...new Set(FILE_BINDINGS.map(canonicalBinding))].sort()
);
assert.ok(
  reviews.every((r) => r.policy_version === POLICY_VERSION && r.evidence_sha256 === evidence.physicalKeySetSha256)
);
const result = {
  appliedAt: new Date().toISOString(),
  appliedAndVerified: true,
  ownershipMetadataOnly: true,
  recoveryAndGuardsDisabled: true,
  objects: actualObjects.length,
  legacyKeys: actualLegacy.length,
  registrySha256: args[1],
  legacyRegistrySha256: args[2],
};
writeFileSync(path.join(dir, 'recovery-registry-result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
