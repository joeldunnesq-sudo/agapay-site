import { readParishDashboardSource } from './lib/parish-dashboard-source.mjs';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const mfaClient = await readFile(new URL('../public/scripts/privileged-mfa.js', import.meta.url), 'utf8');
const portabilityClient = await readFile(new URL('../public/parish/portability.js', import.meta.url), 'utf8');
const parishApp = await readParishDashboardSource();

assert.match(parishApp, /AgapayMfa\?\.installFetchStepUp\(\)/, 'parish dashboard must install the MFA fetch wrapper');
assert.match(portabilityClient, /archiveHash:\s*verifiedHash/, 'closure must submit the locally verified archive hash');
assert.match(portabilityClient, /crypto\.subtle\.digest\('SHA-256'/, 'saved ZIP verification must happen on the device');
assert.match(portabilityClient, /Downloading alone does not close your parish/, 'download UI must state that downloading is non-destructive');
assert.match(portabilityClient, /data-action="confirm"/, 'closure confirmation must remain a separate explicit action');
assert.match(portabilityClient, /retention disclosure is a draft awaiting formal approval/, 'unapproved retention copy must be visible and keep closure disabled');
assert.match(portabilityClient, /Current stage:/, 'the job card must show the sanitized diagnostic stage');
assert.match(portabilityClient, /Failed safeguard:/, 'the job card must show a sanitized failed-safeguard family');
assert.match(mfaClient, /payload\.code !== 'mfa_step_up_required'/, 'the fetch wrapper must recognize only explicit MFA step-up responses');

if (process.argv.includes('--static-only')) {
  console.log('PASS - portability browser safety wiring is present');
  process.exit(0);
}

const archive = Buffer.from('PK\x03\x04synthetic-portability-archive');
const jobId = '11111111-1111-4111-8111-111111111111';
let mfaVerified = false;
let stepUpRequests = 0;
let verifyRequests = 0;
let ordinaryExportRequests = 0;
let closeExportRequests = 0;
let downloadRequests = 0;
let confirmRequests = 0;
let ordinaryReady = false;

async function jsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' });
  response.end(JSON.stringify(body));
}

function portabilityState() {
  return {
    ok: true,
    enabled: true,
    policyVersion: 'synthetic-browser-gate',
    disclosure: {
      version: 'synthetic-browser-gate',
      status: 'approved',
      approvalRequired: false,
      sections: [
        { key: 'financial', title: 'Accounting records', text: 'Financial records required for accounting and legal obligations remain restricted for their approved retention period.' },
        { key: 'support', title: 'Support records', text: 'Support correspondence remains restricted for its approved retention period.' },
      ],
    },
    closure: { available: true, blockers: [] },
    jobs: ordinaryReady ? [{
      id: jobId,
      mode: 'export',
      status: 'ready',
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600_000,
      rowCount: 12,
      archiveBytes: archive.length,
      archiveSha256: 'a'.repeat(64),
      errorCode: '',
      diagnostic: { version: 1, stage: 'ready_for_download', failedSafeguard: null },
      confirmedAt: null,
      closure: { available: false, blockers: [] },
    }] : [],
  };
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname === '/scripts/privileged-mfa.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
    response.end(mfaClient);
    return;
  }
  if (url.pathname === '/parish/portability.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
    response.end(portabilityClient);
    return;
  }
  if (url.pathname === '/api/mfa/step-up') {
    stepUpRequests += 1;
    assert.equal(request.headers.authorization, 'Bearer synthetic-parish-session');
    sendJson(response, 200, { ok: true, mfaRequired: true, pendingToken: 'synthetic-pending-token', enrollmentRequired: false, methods: ['totp'] });
    return;
  }
  if (url.pathname === '/api/mfa/verify') {
    verifyRequests += 1;
    const body = await jsonBody(request);
    assert.deepEqual(body, { pendingToken: 'synthetic-pending-token', method: 'totp', code: '123456' });
    mfaVerified = true;
    sendJson(response, 200, { ok: true, mfaVerifiedAt: new Date().toISOString() });
    return;
  }
  const base = '/api/parish/dashboard/browser-gate-parish/portability';
  if (url.pathname === base && request.method === 'GET') {
    if (!mfaVerified) {
      sendJson(response, 428, { error: 'Confirm your identity before accessing parish data.', code: 'mfa_step_up_required', principalType: 'parish_admin', principalId: 'browser-gate-parish' });
      return;
    }
    sendJson(response, 200, portabilityState());
    return;
  }
  if (url.pathname === base && request.method === 'POST') {
    const body = await jsonBody(request);
    if (body.mode === 'close') {
      closeExportRequests += 1;
      sendJson(response, 409, { error: 'Cancel the AGAPAY subscription and wait until cancellation takes effect before closing. Exporting does not cancel billing.', code: 'cancel_billing_first' });
      return;
    }
    ordinaryExportRequests += 1;
    ordinaryReady = true;
    sendJson(response, 202, { ok: true, job: portabilityState().jobs[0] });
    return;
  }
  if (url.pathname === `${base}/${jobId}/download`) {
    downloadRequests += 1;
    response.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': String(archive.length), 'Cache-Control': 'private, no-store' });
    response.end(archive);
    return;
  }
  if (url.pathname.endsWith('/confirm')) {
    confirmRequests += 1;
    sendJson(response, 500, { error: 'The browser gate must never confirm closure.' });
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(`<!doctype html><html><head><meta charset="utf-8"></head><body>
    <button id="open-portability">Open portability</button>
    <script src="/scripts/privileged-mfa.js"></script>
    <script>window.AgapayMfa.installFetchStepUp();</script>
    <script src="/parish/portability.js"></script>
    <script>
      document.querySelector('#open-portability').onclick = () => window.ParishPortability.open({
        parishId: 'browser-gate-parish',
        headers: () => ({ Authorization: 'Bearer synthetic-parish-session' }),
      });
    </script>
  </body></html>`);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
page.on('pageerror', (error) => console.error('BROWSER PAGE ERROR:', error.message));
const evidence = { generatedAt: new Date().toISOString(), synthetic: true, mfa: {}, billing: {}, download: {} };

try {
  await page.goto(baseUrl);
  assert.equal(await page.evaluate(() => Boolean(window.fetch.__agapayMfaWrapped)), true, 'synthetic parish page must install the MFA fetch wrapper');
  await page.getByRole('button', { name: 'Open portability' }).click();
  await page.getByRole('heading', { name: 'Confirm it’s you' }).waitFor();
  await page.getByRole('button', { name: /Use an authenticator app/ }).click();
  await page.getByLabel('Authenticator code').fill('123456');
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await page.getByRole('button', { name: 'Prepare parish export' }).waitFor();
  evidence.mfa = { prompted: true, stepUpRequests, verifyRequests, resumedOriginalRequest: true };

  await page.getByRole('button', { name: 'Prepare final export' }).click();
  await page.locator('.portability-status').filter({ hasText: 'Cancel the AGAPAY subscription' }).waitFor();
  evidence.billing = { finalExportBlocked: true, closeExportRequests };

  await page.getByRole('button', { name: 'Prepare parish export' }).click();
  await page.getByRole('button', { name: 'Download ZIP' }).waitFor();
  await page.locator('.portability-small').filter({ hasText: 'Current stage: ready for download' }).waitFor();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download ZIP' }).click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), new RegExp(jobId));
  evidence.download = { ordinaryExportRequests, downloadRequests, confirmRequests, suggestedFilename: download.suggestedFilename() };

  assert.deepEqual(evidence.mfa, { prompted: true, stepUpRequests: 1, verifyRequests: 1, resumedOriginalRequest: true });
  assert.deepEqual(evidence.billing, { finalExportBlocked: true, closeExportRequests: 1 });
  assert.equal(ordinaryExportRequests, 1);
  assert.equal(downloadRequests, 1);
  assert.equal(confirmRequests, 0, 'downloading must never call closure confirmation');
  await mkdir(new URL('../artifacts/portability-staging/', import.meta.url), { recursive: true });
  await writeFile(new URL('../artifacts/portability-staging/browser-gate.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
  console.log('PASS - fresh MFA is required and the original portability request resumes after verification');
  console.log('PASS - active billing blocks the final export before a closure job is created');
  console.log('PASS - ordinary export/download does not invoke closure confirmation');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
