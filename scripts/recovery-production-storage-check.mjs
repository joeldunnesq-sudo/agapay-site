// Read-only recovery storage qualification. No parish records or file bodies.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getPlatformProxy } from 'wrangler';
import { POLICY_VERSION } from '../src/portability/catalog.js';

if (process.argv.length === 2) {
  console.log(
    'Read-only plan: verify three private recovery buckets, retention policies, and the original closure authority. No provider writes.'
  );
  process.exit(0);
}
assert.deepEqual(process.argv.slice(2), ['--read-only']);
assert.ok(process.env.CLOUDFLARE_API_TOKEN);
const account = '9198ae5ea8adc59e5dedd1b09c9478b9';
const buckets = {
  PARISH_EXPORTS: 'agapay-parish-exports',
  PARISH_RETAINED_DATA: 'agapay-parish-retained-data',
  PARISH_CLOSURE_LEDGER: 'agapay-parish-closure-ledger',
};
const source = readFileSync('wrangler.toml', 'utf8').split(/^\[env\.staging\]/m)[0];
const authority = source.match(/^PARISH_SUPPRESSION_AUTHORITY = "([^"]+)"$/m)?.[1];
assert.ok(authority);
for (const [binding, bucket] of Object.entries(buckets))
  assert.match(source, new RegExp(`binding = "${binding}"\\s+bucket_name = "${bucket}"`));
const dir = path.resolve('artifacts/recovery-storage');
mkdirSync(dir, { recursive: true });
const report = {
  checkedAt: new Date().toISOString(),
  readOnly: true,
  providerWrites: false,
  passed: false,
  buckets: [],
};
async function get(suffix) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${suffix}`, {
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
    signal: AbortSignal.timeout(30000),
  });
  const body = await r.json();
  assert.ok(r.ok && body.success !== false, `Recovery storage metadata check failed (${r.status})`);
  return body.result;
}
try {
  for (const [binding, bucket] of Object.entries(buckets)) {
    const managed = await get(bucket + '/domains/managed');
    const custom = await get(bucket + '/domains/custom');
    const lifecycle = await get(bucket + '/lifecycle');
    assert.equal(managed.enabled, false, `${binding} must be private`);
    assert.deepEqual(custom.domains, [], `${binding} must have no public custom domains`);
    const deletion = (lifecycle.rules || []).filter((r) => r.enabled && r.deleteObjectsTransition);
    if (binding !== 'PARISH_EXPORTS') assert.equal(deletion.length, 0, `${binding} must not expire recovery evidence`);
    else
      for (const rule of deletion) {
        const prefix = rule.conditions?.prefix || '';
        if ('parish-recovery/'.startsWith(prefix) || prefix.startsWith('parish-recovery/')) {
          const condition = rule.deleteObjectsTransition.condition;
          assert.ok(
            condition?.type === 'Age' && condition.maxAge >= 7 * 86400,
            'Recovery points must not expire prematurely'
          );
        }
      }
    if (binding === 'PARISH_CLOSURE_LEDGER') {
      const locks = (await get(bucket + '/lock')).rules || [];
      for (const prefix of ['authority.json', 'closures/', 'completions/'])
        assert.ok(
          locks.some((r) => r.enabled && r.condition?.type === 'Indefinite' && prefix.startsWith(r.prefix || '')),
          'Original closure authority requires immutable locks'
        );
    }
    report.buckets.push({ binding, private: true, retentionVerified: true });
  }
  const configPath = path.join(dir, 'read-only-proxy.json');
  writeFileSync(
    configPath,
    JSON.stringify({
      name: 'agapay-recovery-storage-readonly',
      account_id: account,
      compatibility_date: '2026-09-01',
      workers_dev: false,
      preview_urls: false,
      r2_buckets: [{ binding: 'LEDGER', bucket_name: buckets.PARISH_CLOSURE_LEDGER, remote: true }],
    })
  );
  const proxy = await getPlatformProxy({ configPath, envFiles: [], remoteBindings: true, persist: false });
  try {
    const object = await proxy.env.LEDGER.get('authority.json');
    assert.ok(object, 'Original authority object missing');
    const value = await object.json();
    assert.equal(value.id, authority);
    assert.equal(value.policyVersion, POLICY_VERSION);
    report.originalAuthorityVerified = true;
  } finally {
    await proxy.dispose();
  }
  report.passed = true;
  console.log(
    'PASS - production recovery buckets are private, retention policies are compatible, and original closure authority is verified'
  );
} finally {
  writeFileSync(path.join(dir, 'result.json'), JSON.stringify(report, null, 2) + '\n');
}
