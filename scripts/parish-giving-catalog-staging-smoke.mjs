import assert from "node:assert/strict";

import {
  baseUrlFrom,
  requiredEnvironment,
  writeArtifact,
} from "./lib/accounting-release-gates.mjs";

const baseUrl = baseUrlFrom();
const target = new URL(baseUrl);
assert.ok(
  ["localhost", "127.0.0.1", "::1"].includes(target.hostname)
    || target.hostname.toLowerCase().includes("staging"),
  "Giving catalog smoke is restricted to localhost or a hostname containing staging.",
);

const credentials = requiredEnvironment([
  "ACCOUNTING_GATE_PARISH_A_ID",
  "ACCOUNTING_GATE_PARISH_A_PASSWORD",
]);
const parishId = credentials.ACCOUNTING_GATE_PARISH_A_ID;

async function requestJson(path, {
  method = "GET",
  token = "",
  body,
  rawBody,
  contentType = "application/json",
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      accept: "application/json",
      ...(body === undefined && rawBody === undefined ? {} : { "content-type": contentType }),
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

const directory = await requestJson("/api/parishes?limit=50");
assert.equal(directory.response.status, 200, `Parish directory returned HTTP ${directory.response.status}.`);
assert.ok(
  directory.payload.parishes?.some((parish) => parish.id === parishId),
  `Public parish directory should contain ${parishId}.`,
);

const summary = await requestJson("/api/platform/summary");
assert.equal(summary.response.status, 200, `Platform summary returned HTTP ${summary.response.status}.`);
assert.ok(summary.payload.summary?.organizationsSupported > 0, "Platform summary should include organizations.");

const login = await requestJson(
  `/api/parish/dashboard/${encodeURIComponent(parishId)}/session`,
  { method: "POST", body: { password: credentials.ACCOUNTING_GATE_PARISH_A_PASSWORD } },
);
assert.equal(login.response.status, 200, `Parish login returned HTTP ${login.response.status}.`);
assert.ok(login.payload.token, "Parish login did not return a token.");
const token = login.payload.token;
const dashboardPath = `/api/parish/dashboard/${encodeURIComponent(parishId)}`;
const dashboard = await requestJson(dashboardPath, { token });
assert.equal(dashboard.response.status, 200, `Parish dashboard returned HTTP ${dashboard.response.status}.`);
const originalCampaigns = Array.isArray(dashboard.payload.parish?.campaigns)
  ? dashboard.payload.parish.campaigns
  : [];

// Valid 1x1 transparent PNG used only to exercise the staging R2 upload path.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
let uploaded;
let campaignResult;
try {
  uploaded = await requestJson(
    `${dashboardPath}/campaign-upload?campaign=roof-campaign`,
    { method: "POST", token, rawBody: png, contentType: "image/png" },
  );
  assert.equal(uploaded.response.status, 200, `Campaign upload returned HTTP ${uploaded.response.status}.`);
  assert.ok(uploaded.payload.key, "Campaign upload should return its R2 key.");
  assert.ok(uploaded.payload.url, "Campaign upload should return its public URL.");

  const temporaryCampaign = {
    id: "roof-campaign",
    slug: "roof-campaign",
    name: "Catalog Extraction Smoke",
    description: "Temporary staging verification campaign.",
    category: "Building",
    goalCents: 1000000,
    coverPhotoUrl: uploaded.payload.url,
    active: true,
  };
  const saved = await requestJson(dashboardPath, {
    method: "PATCH",
    token,
    body: {
      campaigns: [...originalCampaigns, temporaryCampaign],
      givingCatalogChanged: true,
      accountingCatalogChanged: false,
    },
  });
  assert.equal(saved.response.status, 200, `Temporary campaign save returned HTTP ${saved.response.status}.`);

  campaignResult = await requestJson(
    `/api/campaign?parish=${encodeURIComponent(parishId)}&slug=roof-campaign`,
  );
  assert.equal(campaignResult.response.status, 200, `Public campaign returned HTTP ${campaignResult.response.status}.`);
  assert.equal(campaignResult.payload.campaign?.name, "Church Roof Restoration");
  assert.equal(campaignResult.payload.campaign?.coverPhotoUrl, uploaded.payload.url);
  assert.ok(
    campaignResult.payload.campaign?.supporters?.length >= 8,
    "St. Fiacre roof campaign should exercise its demo-supporter helper.",
  );
} finally {
  if (login.payload.token) {
    const restored = await requestJson(dashboardPath, {
      method: "PATCH",
      token,
      body: {
        campaigns: originalCampaigns,
        givingCatalogChanged: true,
        accountingCatalogChanged: false,
      },
    });
    assert.equal(restored.response.status, 200, `Campaign cleanup returned HTTP ${restored.response.status}.`);
  }
}

const evidence = {
  target: baseUrl,
  parishId,
  directoryCount: directory.payload.parishes.length,
  platformSummary: summary.payload.summary,
  campaign: {
    name: campaignResult.payload.campaign.name,
    supporterCount: campaignResult.payload.campaign.supporters.length,
    coverPhotoUrl: campaignResult.payload.campaign.coverPhotoUrl,
  },
  upload: {
    key: uploaded.payload.key,
    url: uploaded.payload.url,
    contentType: uploaded.payload.contentType,
    size: uploaded.payload.size,
  },
  verifiedAt: new Date().toISOString(),
};
await writeArtifact("artifacts/parish-giving-catalog-staging-smoke.json", evidence);
console.log(`UPLOAD_KEY=${evidence.upload.key}`);
console.log(
  `PASS - public directory, St. Fiacre roof campaign (${evidence.campaign.supporterCount} supporters), `
  + `campaign image upload, and platform summary`,
);
