// Guarded one-time production load of verified R2 and KV ownership registries.
// Default is a no-network plan. Apply requires both fresh proposal hashes and
// verifies the complete readback; it never enables a production feature flag.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../src/portability/archive.js';
import { POLICY_VERSION } from '../src/portability/catalog.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = path.join(root, 'artifacts/portability-staging');
const proposalPath = path.join(dir, 'production-storage-registry-proposal.json');
const evidencePath = path.join(dir, 'production-storage-ownership.json');
const sqlPath = path.join(dir, 'production-storage-registry-apply.sql');
const resultPath = path.join(dir, 'production-storage-registry-apply.json');
const database = 'agapay-production';
const args = process.argv.slice(2);
if (!args.length) {
  console.log(JSON.stringify({ mode: 'plan', command: 'node scripts/portability-production-registry-apply.mjs --apply <r2-registry-sha256> <legacy-registry-sha256>', safeguards: ['fresh read-only evidence', 'two exact proposal hashes', 'empty target registries', 'single transaction', 'complete readback hash', 'production flags remain false'], defaultWrites: false }, null, 2));
  process.exit(0);
}
assert.equal(args[0], '--apply'); assert.equal(args.length, 3);
for (const value of args.slice(1)) assert.match(value, /^[a-f0-9]{64}$/);
mkdirSync(dir, { recursive: true });
const proposal = JSON.parse(readFileSync(proposalPath, 'utf8'));
const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
assert.equal(proposal.status, 'verified_ready_for_registry_review');
assert.equal(evidence.status, proposal.status);
assert.equal(proposal.checkedAt, evidence.checkedAt);
assert.ok(Date.now() - Date.parse(proposal.checkedAt) <= 30 * 60 * 1000, 'Registry proposal is older than 30 minutes; inventory again');
assert.deepEqual(proposal.issues, []); assert.deepEqual(proposal.unclassifiedLegacyKeys, []);
assert.equal(await sha256(JSON.stringify(proposal.objects)), proposal.registrySha256);
assert.equal(await sha256(JSON.stringify(proposal.legacyKeys)), proposal.legacyRegistrySha256);
assert.equal(args[1], proposal.registrySha256); assert.equal(args[2], proposal.legacyRegistrySha256);
const config = readFileSync(path.join(root, 'wrangler.toml'), 'utf8').split(/^\[env\.staging\]/m)[0];
for (const flag of ['PARISH_PORTABILITY_ENABLED','PARISH_STORAGE_GUARDS_ENABLED','PARISH_AUTOMATIC_CLOSURE_ENABLED']) assert.match(config, new RegExp(`^${flag} = "false"$`, 'm'));

function run(commandArgs) {
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), ...commandArgs], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
  if (result.status !== 0) throw new Error('Production registry command failed: ' + String(result.stderr || result.stdout || '').replace(/\x1b\[[0-9;]*m/g, '').trim().slice(0, 2000));
  return result.stdout.replace(/\x1b\[[0-9;]*m/g, '').trim();
}
function read(sql) {
  const rows = JSON.parse(run(['d1','execute',database,'--remote','--command',sql,'--json']));
  assert.equal(rows.length, 1); assert.equal(rows[0].success, true); assert.equal(rows[0].meta?.changes, 0); assert.equal(rows[0].meta?.rows_written, 0); assert.equal(rows[0].meta?.changed_db, false);
  return rows[0].results;
}
const before = read("SELECT (SELECT count(*) FROM parish_portability_objects) objects,(SELECT count(*) FROM parish_portability_legacy_keys) legacy_keys,(SELECT count(*) FROM parish_portability_inventory_reviews) reviews;")[0];
const q = value => "'" + String(value).replaceAll("'", "''") + "'";
const at = Date.parse(proposal.checkedAt);
const objectValues = proposal.objects.map(row => `(${q(row.binding)},${q(row.objectKey)},${q(row.parishId)},${q(row.disposition)},'stored',${q(row.etag)},${at})`).join(',\n');
const legacyValues = proposal.legacyKeys.map(row => `(${q(row.objectKey)},${q(row.parishId)},${q(row.sourceHash)},'stored',${at})`).join(',\n');
const bindings = [...new Set(proposal.objects.map(row => row.binding))].sort();
const reviewValues = bindings.map(binding => `(${q(binding)},${q(POLICY_VERSION)},${at},${q(evidence.physicalKeySetSha256)})`).join(',\n');
// Wrangler's remote --file path supplies the atomic transaction and rejects
// explicit BEGIN/COMMIT statements.
writeFileSync(sqlPath, `INSERT INTO parish_portability_objects(binding,object_key,parish_id,disposition,state,etag,updated_at) VALUES\n${objectValues};\nINSERT INTO parish_portability_legacy_keys(object_key,parish_id,source_hash,state,updated_at) VALUES\n${legacyValues};\nINSERT INTO parish_portability_inventory_reviews(binding,policy_version,reviewed_at,evidence_sha256) VALUES\n${reviewValues};\n`);
const empty = before.objects === 0 && before.legacy_keys === 0 && before.reviews === 0;
const complete = before.objects === proposal.objects.length && before.legacy_keys === proposal.legacyKeys.length && before.reviews === bindings.length;
assert.ok(empty || complete, 'Production ownership registries are partial or have unexpected counts');
if (empty) run(['d1','execute',database,'--remote','--file',sqlPath]);
const objectRows = read('SELECT binding,object_key,parish_id,disposition,state,etag FROM parish_portability_objects ORDER BY binding,object_key;');
const legacyRows = read('SELECT object_key,parish_id,source_hash,state FROM parish_portability_legacy_keys ORDER BY object_key;');
const objectCore = objectRows.map(row => ({ binding: row.binding, objectKey: row.object_key, parishId: row.parish_id, disposition: row.disposition, state: row.state, etag: row.etag, evidence: proposal.objects.find(item => item.binding === row.binding && item.objectKey === row.object_key)?.evidence || [] })).sort((a,b)=>(a.binding+'\0'+a.objectKey).localeCompare(b.binding+'\0'+b.objectKey));
const legacyCore = legacyRows.map(row => ({ objectKey: row.object_key, parishId: row.parish_id, sourceHash: row.source_hash, state: row.state })).sort((a,b)=>a.objectKey.localeCompare(b.objectKey));
assert.equal(await sha256(JSON.stringify(objectCore)), proposal.registrySha256, 'R2 ownership readback hash mismatch');
assert.equal(await sha256(JSON.stringify(legacyCore)), proposal.legacyRegistrySha256, 'KV ownership readback hash mismatch');
const reviews = read('SELECT binding,policy_version,evidence_sha256 FROM parish_portability_inventory_reviews ORDER BY binding;');
assert.equal(reviews.length, bindings.length); assert.ok(reviews.every(row => row.policy_version === POLICY_VERSION && row.evidence_sha256 === evidence.physicalKeySetSha256));
const appliedAt = new Date().toISOString();
writeFileSync(resultPath, JSON.stringify({ appliedAt, database, objects: objectRows.length, legacyKeys: legacyRows.length, reviews: reviews.length, registrySha256: proposal.registrySha256, legacyRegistrySha256: proposal.legacyRegistrySha256, productionFlagsFalse: true }, null, 2) + '\n');
console.log(JSON.stringify({ status: 'applied_and_verified', appliedAt, recoveryReadbackOnly: complete, objects: objectRows.length, legacyKeys: legacyRows.length, reviews: reviews.length, registrySha256: proposal.registrySha256, legacyRegistrySha256: proposal.legacyRegistrySha256, productionFlagsFalse: true }, null, 2));
