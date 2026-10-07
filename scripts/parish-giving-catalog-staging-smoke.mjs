import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { slugify } from '../src/lib/format.js';
import { stagingParishSession } from './lib/staging-parish-session.mjs';
import { baseUrlFrom, requiredEnvironment, writeArtifact } from './lib/accounting-release-gates.mjs';

const STAGING_ORIGIN = 'https://agapay-site-staging.joeldunnesq.workers.dev';
const EVIDENCE_PATH = 'artifacts/parish-giving-catalog-staging-smoke.json';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

export function deleteStagingCampaignUpload(key, expectedPrefix, run = execFileSync) {
  assert.ok(/^campaigns\/[a-z0-9-]+\/release-gate-[0-9a-f-]{36}\/$/.test(expectedPrefix));
  assert.ok(key.startsWith(expectedPrefix), 'Cleanup must target only this smoke upload.');
  assert.match(key.slice(expectedPrefix.length), /^\d+-[0-9a-f-]{36}\.png$/);
  run(
    process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js',
      'r2',
      'object',
      'delete',
      `agapay-campaign-assets-staging/${key}`,
      '--remote',
      '--env',
      'staging',
    ],
    { stdio: 'pipe', timeout: 60000 }
  );
  const sql = `UPDATE parish_portability_objects SET state='deleted',updated_at=${Date.now()} WHERE binding='CAMPAIGN_ASSETS' AND object_key='${key}' AND disposition='delete'`;
  run(
    process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js',
      'd1',
      'execute',
      'AGAPAY_DB',
      '--remote',
      '--env',
      'staging',
      '--command',
      sql,
    ],
    { stdio: 'pipe', timeout: 60000 }
  );
}

export async function runCatalogSmoke({
  baseUrl = baseUrlFrom(),
  env = process.env,
  fetchImpl = fetch,
  session = stagingParishSession,
  artifact = writeArtifact,
  deleteUpload = deleteStagingCampaignUpload,
} = {}) {
  assert.equal(baseUrl, STAGING_ORIGIN, 'Catalog mutations require the dedicated staging origin.');
  const credentials = requiredEnvironment(
    [
      'ACCOUNTING_GATE_PARISH_A_ID',
      'ACCOUNTING_GATE_USER_A_EMAIL',
      'ACCOUNTING_GATE_USER_A_PASSWORD',
      'ACCOUNTING_GATE_USER_A_TOTP_SECRET',
      'CLOUDFLARE_API_TOKEN',
    ],
    env
  );
  const parishId = credentials.ACCOUNTING_GATE_PARISH_A_ID;
  const uploadId = `release-gate-${randomUUID()}`;
  // The upload handler uses this same slug normalization for the storage prefix.
  const parishSlug = slugify(parishId);
  const uploadPrefix = `campaigns/${parishSlug}/${uploadId}/`;
  const evidence = { target: baseUrl, parishId, upload: null, catalogRestored: false, uploadDeleted: false };
  async function requestJson(
    path,
    { method = 'GET', token = '', body, rawBody, contentType = 'application/json' } = {}
  ) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
      headers: {
        accept: 'application/json',
        ...(body === undefined && rawBody === undefined ? {} : { 'content-type': contentType }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : rawBody,
    });
    let payload = {};
    try {
      payload = await response.json();
    } catch {}
    return { response, payload };
  }
  const directory = await requestJson('/api/parishes?limit=50');
  assert.equal(directory.response.status, 200);
  assert.ok(Array.isArray(directory.payload.parishes));
  const publicParish = await requestJson(`/api/parishes?id=${encodeURIComponent(parishId)}`);
  assert.ok([200, 404].includes(publicParish.response.status));
  const publiclyVisible = publicParish.response.status === 200;
  if (!publiclyVisible) assert.ok(!directory.payload.parishes.some((parish) => parish.id === parishId));
  evidence.publicParishStatus = publicParish.response.status;
  const summary = await requestJson('/api/platform/summary');
  assert.equal(summary.response.status, 200);
  assert.ok(
    Number.isInteger(summary.payload.summary?.organizationsSupported) &&
      summary.payload.summary.organizationsSupported >= 0
  );
  const token = await session({
    baseUrl,
    parishId,
    email: credentials.ACCOUNTING_GATE_USER_A_EMAIL,
    password: credentials.ACCOUNTING_GATE_USER_A_PASSWORD,
    totpSecret: credentials.ACCOUNTING_GATE_USER_A_TOTP_SECRET,
    label: 'Giving catalog staging parish A',
  });
  const dashboardPath = `/api/parish/dashboard/${encodeURIComponent(parishId)}`;
  const dashboard = await requestJson(dashboardPath, { token });
  assert.equal(dashboard.response.status, 200);
  const originalCampaigns = Array.isArray(dashboard.payload.parish?.campaigns)
    ? dashboard.payload.parish.campaigns
    : [];
  let saveAttempted = false;
  let uploadKey;
  const failures = [];
  try {
    const uploaded = await requestJson(`${dashboardPath}/campaign-upload?campaign=${uploadId}`, {
      method: 'POST',
      token,
      rawBody: PNG,
      contentType: 'image/png',
    });
    assert.equal(uploaded.response.status, 200, `Campaign upload HTTP ${uploaded.response.status}`);
    assert.equal(typeof uploaded.payload.key, 'string');
    uploadKey = uploaded.payload.key;
    evidence.upload = {
      key: uploadKey,
      url: uploaded.payload.url,
      size: uploaded.payload.size,
      contentType: uploaded.payload.contentType,
    };
    await artifact(EVIDENCE_PATH, evidence);
    assert.ok(uploadKey.startsWith(uploadPrefix));
    const uploadedUrl = new URL(uploaded.payload.url);
    assert.equal(uploadedUrl.origin, baseUrl);
    const image = await fetchImpl(uploadedUrl.href, { redirect: 'error', signal: AbortSignal.timeout(30000) });
    assert.equal(image.status, 200);
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), PNG);
    const temporaryCampaign = {
      id: uploadId,
      slug: uploadId,
      name: 'Catalog Release Smoke',
      description: 'Temporary staging verification campaign.',
      category: 'Building',
      goalCents: 1000000,
      active: true,
      coverPhotoUrl: uploaded.payload.url,
    };
    const campaigns = [...originalCampaigns, temporaryCampaign];
    saveAttempted = true;
    const saved = await requestJson(dashboardPath, {
      method: 'PATCH',
      token,
      body: { campaigns, givingCatalogChanged: true, accountingCatalogChanged: false },
    });
    assert.equal(saved.response.status, 200, `Temporary campaign save HTTP ${saved.response.status}`);
    assert.equal(saved.payload.parish?.campaigns?.find((c) => c.id === uploadId)?.coverPhotoUrl, uploaded.payload.url);
    const campaign = await requestJson(`/api/campaign?parish=${encodeURIComponent(parishId)}&slug=${uploadId}`);
    assert.equal(campaign.response.status, publiclyVisible ? 200 : 404);
    if (publiclyVisible) {
      assert.equal(campaign.payload.campaign?.name, temporaryCampaign.name);
      assert.equal(campaign.payload.campaign?.coverPhotoUrl, uploaded.payload.url);
      assert.ok(Array.isArray(campaign.payload.campaign?.supporters));
    } else {
      assert.equal(campaign.payload.campaign, undefined, 'Unpublished parish must not expose campaign details.');
    }
    evidence.campaign = {
      status: campaign.response.status,
      visibility: publiclyVisible ? 'public' : 'unpublished',
      authenticatedSaveVerified: true,
    };
    evidence.directoryCount = directory.payload.parishes.length;
    evidence.verifiedAt = new Date().toISOString();
  } catch (error) {
    failures.push(error);
  } finally {
    if (saveAttempted) {
      try {
        const restored = await requestJson(dashboardPath, {
          method: 'PATCH',
          token,
          body: { campaigns: originalCampaigns, givingCatalogChanged: true, accountingCatalogChanged: false },
        });
        assert.equal(restored.response.status, 200, `Campaign cleanup HTTP ${restored.response.status}`);
        evidence.catalogRestored = true;
      } catch (error) {
        failures.push(error);
      }
    }
    if (uploadKey) {
      try {
        await deleteUpload(uploadKey, uploadPrefix);
        evidence.uploadDeleted = true;
      } catch {
        failures.push(new Error('Staging image cleanup failed; use the scoped upload key in the evidence artifact.'));
      }
    }
    evidence.passed = failures.length === 0;
    await artifact(EVIDENCE_PATH, evidence);
  }
  if (failures.length) throw new AggregateError(failures, 'Giving catalog staging smoke failed.');
  return evidence;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCatalogSmoke();
  console.log(
    'PASS - enrolled MFA, public directory/summary, campaign image bytes, catalog save, campaign totals and cleanup'
  );
}
