// Fixed-scope production backup lifecycle reconciliation. The default is a
// no-network plan. --inventory lists metadata only. --apply requires the fresh
// inventory hash and refuses to add the rule if any object is already expired.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getPlatformProxy } from 'wrangler';
import { sha256 } from '../src/portability/archive.js';

const root = path.resolve('.');
const artifactDir = path.join(root, 'artifacts/portability-staging');
const evidencePath = path.join(artifactDir, 'production-backup-lifecycle.json');
const inventoryConfigPath = path.join(artifactDir, 'production-backup-inventory-wrangler.json');
const accountId = '9198ae5ea8adc59e5dedd1b09c9478b9';
const bucketName = 'agapay-accounting-backups';
const binding = 'ACCOUNTING_BACKUPS';
const retentionDays = 365;
const ruleName = 'AGAPAY 365-day backup expiry';
const args = process.argv.slice(2);

if (!args.length) {
  console.log(JSON.stringify({
    mode: 'plan',
    bucket: bucketName,
    binding,
    retentionDays,
    inventory: 'node scripts/portability-backup-lifecycle.mjs --inventory',
    apply: 'node scripts/portability-backup-lifecycle.mjs --apply <evidence-sha256>',
    safeguards: ['metadata-only inventory', 'fresh evidence hash', 'no already-expired objects', 'named provider rule readback', 'strict application sweep remains disabled'],
    defaultWrites: false
  }, null, 2));
  process.exit(0);
}
assert.ok(args[0] === '--inventory' || args[0] === '--apply', 'Use --inventory or --apply <evidence-sha256>');
assert.equal(args.length, args[0] === '--apply' ? 2 : 1, 'Apply requires exactly one evidence SHA-256');
if (args[0] === '--apply') assert.match(args[1], /^[a-f0-9]{64}$/, 'A full lowercase evidence SHA-256 is required');

const config = readFileSync(path.join(root, 'wrangler.toml'), 'utf8');
assert.match(config, /ACCOUNTING_BACKUP_RETENTION_DAYS = "365"/);
assert.match(config, /ACCOUNTING_BACKUP_STRICT_EXPIRY_ENABLED = "false"/);
assert.match(config, new RegExp(`CLOUDFLARE_ACCOUNT_ID = "${accountId}"`));
assert.match(config, new RegExp(`binding = "${binding}"[\\s\\S]{0,120}bucket_name = "${bucketName}"`));

function wrangler(commandArgs) {
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), ...commandArgs], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }
  });
  if (result.status !== 0) throw new Error('Wrangler backup lifecycle command failed');
  return result.stdout.replace(/\x1b\[[0-9;]*m/g, '').trim();
}

function lifecycleReadback() {
  return wrangler(['r2', 'bucket', 'lifecycle', 'list', bucketName]);
}

function hasExpiryRule(text) {
  return text.includes(`name:     ${ruleName}`) && /action:\s*(?:Delete|Expire).*365 days/i.test(text);
}

async function collectInventory() {
  const inventoryConfig = {
    name: 'agapay-portability-production-backup-inventory',
    account_id: accountId,
    compatibility_date: '2026-05-25',
    workers_dev: false,
    preview_urls: false,
    r2_buckets: [{ binding, bucket_name: bucketName, remote: true }],
    triggers: { crons: [] }
  };
  writeFileSync(inventoryConfigPath, JSON.stringify(inventoryConfig, null, 2) + '\n');
  const proxy = await getPlatformProxy({ configPath: inventoryConfigPath, envFiles: [], remoteBindings: true, persist: false });
  try {
    const bucket = proxy.env[binding];
    assert.ok(bucket?.list, 'Production backup binding is unavailable');
    const objects = [];
    let cursor;
    do {
      const page = await bucket.list({ limit: 1000, ...(cursor ? { cursor } : {}) });
      assert.ok(Array.isArray(page.objects));
      objects.push(...page.objects);
      assert.ok(objects.length <= 10000, 'Production backup inventory exceeds the reviewed bound');
      if (!page.truncated) break;
      assert.ok(page.cursor && page.cursor !== cursor, 'Production backup inventory cursor is invalid');
      cursor = page.cursor;
    } while (cursor);
    assert.ok(objects.length > 0, 'Production backup bucket has no recovery objects');
    const now = Date.now();
    const cutoff = now - retentionDays * 86400000;
    const uploaded = objects.map(object => {
      const timestamp = new Date(object.uploaded).getTime();
      assert.ok(Number.isFinite(timestamp) && timestamp <= now, 'Backup upload timestamp is invalid');
      return timestamp;
    }).sort((left, right) => left - right);
    const prefixes = {};
    for (const object of objects) {
      const prefix = String(object.key).includes('/') ? String(object.key).split('/', 1)[0] + '/' : '(root)';
      prefixes[prefix] = (prefixes[prefix] || 0) + 1;
    }
    const expiredObjects = uploaded.filter(timestamp => timestamp < cutoff).length;
    const core = {
      bucket: bucketName,
      retentionDays,
      objectsScanned: objects.length,
      prefixes,
      oldestUploadedAt: new Date(uploaded[0]).toISOString(),
      newestUploadedAt: new Date(uploaded.at(-1)).toISOString(),
      expiredObjects,
      currentRulePresent: hasExpiryRule(lifecycleReadback()),
      strictApplicationSweepEnabled: false
    };
    return { core, evidenceSha256: await sha256(JSON.stringify(core)) };
  } finally {
    await proxy.dispose();
  }
}

mkdirSync(artifactDir, { recursive: true });

if (args[0] === '--inventory') {
  const evidence = await collectInventory();
  const report = { checkedAt: new Date().toISOString(), readOnly: true, status: evidence.core.currentRulePresent ? 'already_configured' : evidence.core.expiredObjects ? 'blocked_expired_objects' : 'verified_ready', ...evidence };
  writeFileSync(evidencePath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, checkedAt: report.checkedAt, evidenceSha256: report.evidenceSha256, objectsScanned: report.core.objectsScanned, oldestUploadedAt: report.core.oldestUploadedAt, newestUploadedAt: report.core.newestUploadedAt, expiredObjects: report.core.expiredObjects, writes: false }, null, 2));
  process.exit(0);
}

const saved = JSON.parse(readFileSync(evidencePath, 'utf8'));
assert.equal(saved.evidenceSha256, args[1], 'The supplied evidence hash does not match the saved inventory');
assert.equal(await sha256(JSON.stringify(saved.core)), saved.evidenceSha256, 'The saved backup inventory was changed');
assert.ok(Date.now() - Date.parse(saved.checkedAt) <= 30 * 60 * 1000, 'Backup inventory is older than 30 minutes; inventory again');
assert.equal(saved.core.expiredObjects, 0, 'Existing expired objects require reviewed disposal before adding provider expiry');
const fresh = await collectInventory();
assert.equal(fresh.evidenceSha256, saved.evidenceSha256, 'Production backup inventory or lifecycle changed after verification');

let ruleAdded = false;
if (!fresh.core.currentRulePresent) {
  wrangler(['r2', 'bucket', 'lifecycle', 'add', bucketName, ruleName, '--expire-days', String(retentionDays), '--force']);
  ruleAdded = true;
}
const readback = lifecycleReadback();
assert.equal(hasExpiryRule(readback), true, 'Production backup object-expiration rule readback failed');
const appliedAt = new Date().toISOString();
writeFileSync(evidencePath, JSON.stringify({ ...saved, status: 'applied_and_verified', appliedAt, ruleAdded, lifecycleReadbackSha256: await sha256(readback) }, null, 2) + '\n');
console.log(JSON.stringify({ status: 'applied_and_verified', appliedAt, evidenceSha256: saved.evidenceSha256, ruleAdded, strictApplicationSweepEnabled: false }, null, 2));
