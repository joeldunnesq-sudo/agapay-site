import assert from 'node:assert/strict';
import { baseUrlFrom, requiredEnvironment, writeArtifact } from './lib/accounting-release-gates.mjs';

const baseUrl = baseUrlFrom();
assert.equal(new URL(baseUrl).origin, 'https://agapay-site-staging.joeldunnesq.workers.dev');
const credentials = requiredEnvironment([
  'ACCOUNTING_GATE_PARISH_A_ID',
  'ACCOUNTING_GATE_PARISH_A_PASSWORD',
  'ACCOUNTING_GATE_PARISH_B_ID',
  'ACCOUNTING_GATE_PARISH_B_PASSWORD',
]);
const parishA = credentials.ACCOUNTING_GATE_PARISH_A_ID;
const parishB = credentials.ACCOUNTING_GATE_PARISH_B_ID;
assert.notEqual(parishA, parishB, 'Isolation requires two distinct staging parishes.');
const prefix = (parish) => `/api/parish/dashboard/${encodeURIComponent(parish)}`;
async function request(path, { token, method = 'GET', body, headers = {} } = {}) {
  return fetch(baseUrl + path, {
    method,
    body,
    headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(30000),
  });
}
async function login(parish, password) {
  const response = await request(`${prefix(parish)}/session`, {
    method: 'POST',
    body: JSON.stringify({ password }),
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(response.status, 200, 'Staging parish login');
  const { token } = await response.json();
  assert.ok(token, 'Staging parish session token');
  return token;
}
const tokenA = await login(parishA, credentials.ACCOUNTING_GATE_PARISH_A_PASSWORD);
const tokenB = await login(parishB, credentials.ACCOUNTING_GATE_PARISH_B_PASSWORD);
const preparation = (parish) => `${prefix(parish)}/sacraments/preparation`;
const templatesResponse = await request(`${preparation(parishA)}/templates`, { token: tokenA });
assert.equal(templatesResponse.status, 200, 'Preparation templates');
const { templates, documentsConfigured } = await templatesResponse.json();
assert.equal(documentsConfigured, true, 'Staging private R2 binding');
assert.ok(templates?.[0]?.sacramentType, 'Existing preparation template');
const uploadPath = `${preparation(parishA)}/templates/${encodeURIComponent(templates[0].sacramentType)}/documents`;
// A synthetic one-pixel PNG; no parish or donor information is included.
const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);
const filename = `typescript-release-${crypto.randomUUID()}.png`;
const form = new FormData();
form.set('document', new Blob([bytes], { type: 'image/png' }), filename);
form.set('displayName', 'Temporary TypeScript release verification');
let documentId;
const checks = [];
try {
  const uploaded = await request(uploadPath, { token: tokenA, method: 'POST', body: form });
  const payload = await uploaded.json();
  // Capture the ID before assertions so a malformed success still gets cleaned up.
  documentId = payload.documentId;
  assert.equal(uploaded.status, 201, 'Multipart upload through Worker, R2, and D1');
  assert.ok(documentId, 'Persisted document ID');
  checks.push('authenticated multipart upload');
  const documentPath = `${preparation(parishA)}/documents/${encodeURIComponent(documentId)}`;
  const downloaded = await request(`${documentPath}?download=1`, { token: tokenA });
  assert.equal(downloaded.status, 200, 'Authenticated private download');
  assert.equal(downloaded.headers.get('content-type'), 'image/png');
  assert.match(downloaded.headers.get('content-disposition') || '', /attachment/);
  assert.match(downloaded.headers.get('cache-control') || '', /no-store/);
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), bytes);
  checks.push('exact download bytes and private response headers');
  for (const [label, path, token] of [
    ['anonymous', documentPath, ''],
    ['foreign token', documentPath, tokenB],
    ['foreign parish path', `${preparation(parishB)}/documents/${encodeURIComponent(documentId)}`, tokenB],
  ]) {
    const denied = await request(path, { token });
    assert.ok([401, 403, 404].includes(denied.status), `${label} must be denied (HTTP ${denied.status}).`);
    await denied.arrayBuffer();
    checks.push(`${label} denied`);
  }
  const invalid = new FormData();
  invalid.set('document', new Blob(['not a PNG'], { type: 'image/png' }), 'invalid.png');
  const rejected = await request(uploadPath, { token: tokenA, method: 'POST', body: invalid });
  assert.equal(rejected.status, 422, 'Invalid signature rejected');
  await rejected.arrayBuffer();
  checks.push('invalid signature rejected');
} finally {
  if (documentId) {
    const documentPath = `${preparation(parishA)}/documents/${encodeURIComponent(documentId)}`;
    const deleted = await request(documentPath, { token: tokenA, method: 'DELETE' });
    assert.equal(deleted.status, 200, 'Synthetic document cleanup');
    await deleted.arrayBuffer();
    const absent = await request(documentPath, { token: tokenA });
    assert.equal(absent.status, 404, 'Deleted document no longer available');
    await absent.arrayBuffer();
    checks.push('document deleted and subsequent download denied');
  }
  await writeArtifact('artifacts/sacrament-documents-staging-smoke.json', {
    target: baseUrl,
    checkedAt: new Date().toISOString(),
    documentId,
    checks,
  });
}
console.log(`PASS - ${checks.join('; ')}`);
