// Guarded cutover from public r2.dev origins to verified Worker delivery.
// Default is a no-network plan. Inventory gathers fresh provider and Worker
// evidence; apply requires its exact hash, disables only the three reviewed
// origins, and verifies both provider readback and Worker delivery afterward.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../src/portability/archive.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = path.join(root, 'artifacts/portability-staging');
const proposalPath = path.join(dir, 'production-storage-registry-proposal.json');
const ownershipPath = path.join(dir, 'production-storage-ownership.json');
const rewritePath = path.join(dir, 'production-public-media-rewrite.json');
const evidencePath = path.join(dir, 'production-public-media-disable.json');
const policyVersion = '2026-08-28-active-storage-v2';
const targets = Object.freeze({
  CAMPAIGN_ASSETS: { bucket: 'agapay-campaign-assets', oldBase: 'https://pub-a8aecb95751f49ac9b078c3e3ed378b8.r2.dev', route: 'campaign' },
  ANNOUNCEMENT_ASSETS: { bucket: 'agapay-announcement-assets', oldBase: 'https://pub-b0974d02d1bf41288b3082849e87f676.r2.dev', route: 'announcement' },
  TEACHING_ASSETS: { bucket: 'agapay-teaching-assets', oldBase: 'https://pub-b6fa9c48d8be43bebaacef7f7ba448e4.r2.dev', route: 'teaching' }
});
const args = process.argv.slice(2);

if (!args.length) {
  console.log(JSON.stringify({
    mode: 'plan',
    inventory: 'node scripts/portability-public-media-disable.mjs --inventory',
    apply: 'node scripts/portability-public-media-disable.mjs --apply <evidence-sha256>',
    safeguards: ['fresh post-rewrite ownership evidence', 'all Worker objects return 200/no-store', 'zero custom domains', 'exact provider evidence hash', 'three fixed r2.dev origins only', 'disabled-state and Worker readback', 'closure flags remain false'],
    defaultWrites: false
  }, null, 2));
  process.exit(0);
}
assert.ok(args[0] === '--inventory' || args[0] === '--apply', 'Use --inventory or --apply <evidence-sha256>');
assert.equal(args.length, args[0] === '--apply' ? 2 : 1, 'Apply requires exactly one evidence SHA-256');
if (args[0] === '--apply') assert.match(args[1], /^[a-f0-9]{64}$/);
mkdirSync(dir, { recursive: true });

const config = readFileSync(path.join(root, 'wrangler.toml'), 'utf8').split(/^\[env\.staging\]/m)[0];
assert.match(config, new RegExp(`^PARISH_PUBLIC_MEDIA_DELIVERY_ENABLED = "${policyVersion}"$`, 'm'));
assert.doesNotMatch(config, /^PARISH_R2_DEV_PUBLIC_ACCESS_DISABLED\s*=/m);
for (const flag of ['PARISH_PORTABILITY_ENABLED', 'PARISH_STORAGE_GUARDS_ENABLED', 'PARISH_AUTOMATIC_CLOSURE_ENABLED']) assert.match(config, new RegExp(`^${flag} = "false"$`, 'm'));

function wrangler(commandArgs) {
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), ...commandArgs], {
    cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }
  });
  if (result.status !== 0) throw new Error('Public media origin command failed');
  return String(result.stdout || '').replace(/\x1b\[[0-9;]*m/g, '').trim();
}

async function prerequisites() {
  const proposal = JSON.parse(readFileSync(proposalPath, 'utf8'));
  const ownership = JSON.parse(readFileSync(ownershipPath, 'utf8'));
  const rewrite = JSON.parse(readFileSync(rewritePath, 'utf8'));
  assert.equal(proposal.status, 'verified_ready_for_registry_review');
  assert.deepEqual(proposal.issues, []);
  assert.equal(await sha256(JSON.stringify(proposal.objects)), proposal.registrySha256);
  assert.equal(await sha256(JSON.stringify(proposal.legacyKeys)), proposal.legacyRegistrySha256);
  assert.ok(Date.now() - Date.parse(proposal.checkedAt) <= 30 * 60 * 1000, 'Ownership proposal is older than 30 minutes; audit again');
  assert.equal(ownership.checkedAt, proposal.checkedAt);
  assert.equal(ownership.status, proposal.status);
  assert.equal(ownership.issueCount, 0);
  assert.equal(ownership.references, 26);
  assert.equal(rewrite.status, 'applied_and_verified');
  assert.equal(rewrite.core.registrySha256, proposal.registrySha256);
  assert.ok(Date.parse(proposal.checkedAt) >= Date.parse(rewrite.appliedAt), 'Ownership evidence predates the historical URL rewrite');
  assert.equal(await sha256(JSON.stringify(rewrite.core)), rewrite.evidenceSha256, 'Historical rewrite evidence was changed');
  const objects = proposal.objects.filter(object => targets[object.binding]);
  assert.equal(objects.length, 3, 'Expected exactly three reviewed public objects');
  return { proposal, objects, rewrite };
}

async function collect(objects) {
  const provider = {}, heads = [];
  for (const [binding, target] of Object.entries(targets)) {
    const dev = wrangler(['r2', 'bucket', 'dev-url', 'get', target.bucket]);
    const domains = wrangler(['r2', 'bucket', 'domain', 'list', target.bucket]);
    const enabled = dev.includes(`Public access is enabled at '${target.oldBase}'.`);
    const disabled = dev.includes('Public access via the r2.dev URL is disabled.');
    assert.notEqual(enabled, disabled, 'R2 public origin state is ambiguous');
    assert.match(domains, /There are no custom domains/);
    provider[binding] = { enabled, disabled, customDomains: 0, devStatusSha256: await sha256(dev), domainStatusSha256: await sha256(domains) };
    for (const object of objects.filter(item => item.binding === binding)) {
      const encoded = object.objectKey.split('/').map(encodeURIComponent).join('/');
      const response = await fetch(`https://agapay.app/api/public/parish-assets/${target.route}/${encoded}`, { method: 'HEAD', headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(15000) });
      heads.push({ binding, status: response.status, noStore: response.headers.get('cache-control') === 'no-store', bytes: Number(response.headers.get('content-length')) });
    }
  }
  assert.ok(heads.every(item => item.status === 200 && item.noStore && Number.isSafeInteger(item.bytes) && item.bytes >= 0), 'Worker delivery verification failed');
  return { provider, objectsChecked: heads.length, workerHeadSha256: await sha256(JSON.stringify(heads)) };
}

const { proposal, objects, rewrite } = await prerequisites();
if (args[0] === '--inventory') {
  const current = await collect(objects);
  assert.ok(Object.values(current.provider).every(item => item.enabled && !item.disabled && item.customDomains === 0), 'The reviewed r2.dev origins are not all enabled');
  const core = { proposalCheckedAt: proposal.checkedAt, registrySha256: proposal.registrySha256, rewriteAppliedAt: rewrite.appliedAt, ...current };
  const evidenceSha256 = await sha256(JSON.stringify(core));
  const report = { checkedAt: new Date().toISOString(), readOnly: true, status: 'verified_ready', core, evidenceSha256, rawKeysPersisted: false, providerWrites: false };
  writeFileSync(evidencePath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, checkedAt: report.checkedAt, evidenceSha256, objectsChecked: current.objectsChecked, workerStatus200: current.objectsChecked, r2DevEnabled: 3, customDomains: 0, writes: false }, null, 2));
  process.exit(0);
}

const saved = JSON.parse(readFileSync(evidencePath, 'utf8'));
assert.equal(saved.status, 'verified_ready');
assert.equal(saved.evidenceSha256, args[1], 'The supplied hash does not match the saved origin evidence');
assert.equal(await sha256(JSON.stringify(saved.core)), saved.evidenceSha256, 'The saved origin evidence was changed');
assert.ok(Date.now() - Date.parse(saved.checkedAt) <= 30 * 60 * 1000, 'Origin evidence is older than 30 minutes; inventory again');
const fresh = await collect(objects);
const freshCore = { proposalCheckedAt: proposal.checkedAt, registrySha256: proposal.registrySha256, rewriteAppliedAt: rewrite.appliedAt, ...fresh };
assert.equal(await sha256(JSON.stringify(freshCore)), saved.evidenceSha256, 'Worker delivery or provider origin state changed after inventory');

for (const target of Object.values(targets)) wrangler(['r2', 'bucket', 'dev-url', 'disable', target.bucket]);
const readback = await collect(objects);
assert.ok(Object.values(readback.provider).every(item => item.disabled && !item.enabled && item.customDomains === 0), 'An r2.dev origin remains enabled after cutover');
assert.equal(readback.workerHeadSha256, saved.core.workerHeadSha256, 'Worker delivery changed during origin cutover');
const appliedAt = new Date().toISOString();
writeFileSync(evidencePath, JSON.stringify({ ...saved, status: 'applied_and_verified', appliedAt, readback, providerWrites: true }, null, 2) + '\n');
console.log(JSON.stringify({ status: 'applied_and_verified', appliedAt, evidenceSha256: saved.evidenceSha256, objectsChecked: readback.objectsChecked, workerStatus200: readback.objectsChecked, r2DevDisabled: 3, customDomains: 0, closureFlagsEnabled: false }, null, 2));
