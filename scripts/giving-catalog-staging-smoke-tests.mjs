import assert from 'node:assert/strict';
import { runCatalogSmoke, deleteStagingCampaignUpload } from './parish-giving-catalog-staging-smoke.mjs';
const origin = 'https://agapay-site-staging.joeldunnesq.workers.dev';
const env = {
  ACCOUNTING_GATE_PARISH_A_ID: 'parish-a',
  ACCOUNTING_GATE_USER_A_EMAIL: 'staff@example.test',
  ACCOUNTING_GATE_USER_A_PASSWORD: 'synthetic',
  ACCOUNTING_GATE_USER_A_TOTP_SECRET: 'synthetic',
  CLOUDFLARE_API_TOKEN: 'synthetic',
};
const prefix = 'campaigns/parish-a/release-gate-00000000-0000-0000-0000-000000000000/';
const key = `${prefix}123-00000000-0000-0000-0000-000000000000.png`;
let command;
deleteStagingCampaignUpload(key, prefix, (...args) => {
  command = args;
});
assert.equal(command[1][4], `agapay-campaign-assets-staging/${key}`);
assert.deepEqual(command[1].slice(-3), ['--remote', '--env', 'staging']);
for (const invalid of [key.replace('parish-a', 'other'), `${prefix}../other.png`, `${prefix}unexpected.png`]) {
  assert.throws(() => deleteStagingCampaignUpload(invalid, prefix, () => assert.fail('Unsafe cleanup executed')));
}
await assert.rejects(
  runCatalogSmoke({ baseUrl: 'https://agapay.app', env, fetchImpl: () => assert.fail('Production request') }),
  /dedicated staging/
);
await assert.rejects(
  runCatalogSmoke({
    baseUrl: origin,
    env: { ...env, ACCOUNTING_GATE_USER_A_TOTP_SECRET: '' },
    fetchImpl: () => assert.fail('Missing-factor request'),
  }),
  /TOTP_SECRET/
);
for (const scenario of ['success', 'save-failed', 'public-failed', 'restore-failed', 'delete-failed']) {
  const original = [
    { id: 'roof-campaign', name: 'Original roof', accountingFundId: 'fund_roof', custom: 'preserve' },
    { id: 'other', name: 'Other campaign' },
  ];
  const before = structuredClone(original);
  const patches = [];
  let uploadedBytes;
  let uploadedKey;
  let uploadedUrl;
  let deleted = false;
  let evidence;
  const execute = () =>
    runCatalogSmoke({
      baseUrl: origin,
      env,
      session: async (options) => {
        assert.equal(options.email, env.ACCOUNTING_GATE_USER_A_EMAIL);
        assert.equal(options.totpSecret, env.ACCOUNTING_GATE_USER_A_TOTP_SECRET);
        return 'synthetic-token';
      },
      artifact: async (_path, value) => {
        evidence = structuredClone(value);
      },
      deleteUpload: async (actualKey, expectedPrefix) => {
        assert.equal(actualKey, uploadedKey);
        assert.ok(actualKey.startsWith(expectedPrefix));
        deleted = true;
        if (scenario === 'delete-failed') throw new Error('Synthetic cleanup failure');
      },
      fetchImpl: async (url, options) => {
        assert.equal(new URL(url).origin, origin);
        assert.equal(options.redirect, 'error');
        const path = new URL(url).pathname;
        if (path === '/api/parishes') return Response.json({ parishes: [{ id: 'parish-a' }] });
        if (path === '/api/platform/summary') return Response.json({ summary: { organizationsSupported: 1 } });
        if (path.endsWith('/campaign-upload')) {
          assert.equal(options.headers.authorization, 'Bearer synthetic-token');
          uploadedBytes = options.body;
          uploadedKey = `campaigns/parish-a/${new URL(url).searchParams.get('campaign')}/123-00000000-0000-0000-0000-000000000000.png`;
          uploadedUrl = `${origin}/api/public/parish-assets/campaign/${uploadedKey}`;
          return Response.json({
            key: uploadedKey,
            url: uploadedUrl,
            contentType: 'image/png',
            size: uploadedBytes.length,
          });
        }
        if (url === uploadedUrl) return new Response(uploadedBytes);
        if (path === '/api/parish/dashboard/parish-a') {
          assert.equal(options.headers.authorization, 'Bearer synthetic-token');
          if (options.method === 'GET') return Response.json({ parish: { campaigns: original } });
          const patch = JSON.parse(options.body);
          patches.push(patch);
          assert.equal(patch.accountingCatalogChanged, false);
          const failing =
            (scenario === 'save-failed' && patches.length === 1) ||
            (scenario === 'restore-failed' && patches.length === 2);
          return Response.json({}, { status: failing ? 503 : 200 });
        }
        if (path === '/api/campaign')
          return Response.json(
            {
              campaign: { name: 'Church Roof Restoration', coverPhotoUrl: uploadedUrl, supporters: Array(8).fill({}) },
            },
            { status: scenario === 'public-failed' ? 503 : 200 }
          );
        assert.fail(`Unexpected synthetic request ${path}`);
      },
    });
  if (scenario === 'success') await execute();
  else await assert.rejects(execute(), /catalog staging smoke failed/);
  assert.equal(deleted, true, `${scenario} cleans up uploaded image`);
  assert.equal(patches.length, 2);
  assert.equal(patches[0].campaigns.length, original.length, 'Never append a duplicate roof campaign');
  assert.equal(patches[0].campaigns[0].accountingFundId, 'fund_roof');
  assert.equal(patches[0].campaigns[0].custom, 'preserve');
  assert.deepEqual(patches[1].campaigns, original);
  assert.deepEqual(original, before);
  assert.equal(evidence.catalogRestored, scenario !== 'restore-failed');
  assert.equal(evidence.uploadDeleted, scenario !== 'delete-failed');
  assert.equal(evidence.passed, scenario === 'success');
  assert.ok(!JSON.stringify(evidence).includes('synthetic-token'));
}
console.log(
  'PASS - catalog smoke requires staging MFA, preserves existing campaigns, verifies bytes, and cleans up after success/failure'
);
