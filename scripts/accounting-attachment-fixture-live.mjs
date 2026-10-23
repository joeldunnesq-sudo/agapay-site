import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { runAccountingHealth } from './accounting-health-live.mjs';

const origin = 'https://agapay.app';
const root = '/api/parish/dashboard/test-lubbock/accounting';
const marker = 'AGAPAY-ATTACHMENT-SMOKE-V1';
const filename = 'agapay-attachment-smoke-v1.png';
const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64'
);
export async function prepareAttachmentFixture({ env = process.env, fetchImpl = fetch } = {}) {
  let headers;
  const preflight = await runAccountingHealth({
    env,
    requireAttachments: false,
    fetchImpl: async (url, options) => {
      assert.equal(new URL(url).origin, origin);
      if (url.startsWith(origin + root + '/') && options.headers['X-AGAPAY-Accounting-Token'])
        headers = { ...options.headers };
      return fetchImpl(url, options);
    },
  });
  // A missing attachment is the only preflight defect this operation may repair.
  assert.ok(
    headers && preflight.checks.every((c) => c.passed || c.skipped || c.name === 'accounting-attachment-download'),
    'Authenticated accounting preflight failed.'
  );
  const permitted = new Set([
    '/payables/vendors',
    '/payables/bills',
    '/workspace-reference',
    '/attachments',
    '/attachments/upload',
  ]);
  async function request(path, body) {
    assert.ok(permitted.has(path.split('?')[0]), 'Outside the fixture endpoint allowlist.');
    const form = body instanceof FormData;
    const response = await fetchImpl(origin + root + path, {
      method: body ? 'POST' : 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(60000),
      headers: { ...headers, ...(body && !form ? { 'content-type': 'application/json' } : {}) },
      body: body ? (form ? body : JSON.stringify(body)) : undefined,
    });
    assert.ok(response.ok, 'Fixture ' + path.split('?')[0] + ' returned HTTP ' + response.status);
    return response.json();
  }
  let bill = (await request('/payables/bills')).bills.find((b) => b.vendorInvoiceNumber === marker);
  let billCreated = false;
  if (!bill) {
    const name = 'AGAPAY attachment smoke fixture - DO NOT PAY';
    let vendor = (await request('/payables/vendors')).vendors.find((v) => v.displayName === name);
    if (!vendor)
      vendor = (
        await request('/payables/vendors', {
          displayName: name,
          notes: 'Synthetic Test Lubbock attachment fixture. Never submit, approve, post or pay.',
        })
      ).vendor;
    const reference = await request('/workspace-reference');
    const account = reference.accounts.find((a) => a.category === 'expense');
    const fund = reference.funds.find((f) => f.isDefault) || reference.funds[0];
    assert.ok(account && fund, 'An active expense account and fund are required.');
    bill = (
      await request('/payables/bills', {
        vendorId: vendor.id,
        vendorInvoiceNumber: marker,
        billDate: new Date().toISOString().slice(0, 10),
        description: 'Synthetic attachment smoke fixture - DO NOT POST OR PAY',
        lines: [
          {
            accountId: account.id,
            fundId: fund.id,
            quantity: 1,
            unitAmount: 0,
            description: 'Zero-value attachment test fixture',
          },
        ],
      })
    ).bill;
    billCreated = true;
  }
  assert.equal(bill.status, 'draft', 'Never change a fixture that has entered a financial workflow.');
  assert.equal(bill.totalAmount, 0, 'Fixture must remain zero value.');
  const listPath = '/attachments?entityType=bill&entityId=' + encodeURIComponent(bill.id);
  let attachment = (await request(listPath)).attachments.find(
    (a) => a.displayName === filename && a.storageStatus === 'stored'
  );
  let attachmentCreated = false;
  if (!attachment) {
    const form = new FormData();
    form.set('entityType', 'bill');
    form.set('entityId', bill.id);
    form.set('displayName', filename);
    form.set('file', new Blob([bytes], { type: 'image/png' }), filename);
    attachment = (await request('/attachments/upload', form)).attachment;
    attachmentCreated = true;
  }
  const downloadUrl = origin + root + '/attachments/' + encodeURIComponent(attachment.id) + '/download';
  const download = await fetchImpl(downloadUrl, {
    method: 'GET',
    headers,
    redirect: 'error',
    signal: AbortSignal.timeout(60000),
  });
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes, 'Stored fixture bytes must match exactly.');
  const anonymous = await fetchImpl(downloadUrl, {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(60000),
  });
  assert.ok([401, 403, 404].includes(anonymous.status), 'Anonymous attachment access must be denied.');
  return {
    status: 'passed',
    parishId: 'test-lubbock',
    billCreated,
    attachmentCreated,
    billId: bill.id,
    attachmentId: attachment.id,
    billStatus: 'draft',
    totalAmount: 0,
    sizeBytes: bytes.length,
    exactBytesVerified: true,
    anonymousStatus: anonymous.status,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const evidence = await prepareAttachmentFixture();
  await mkdir('artifacts/accounting-health', { recursive: true });
  await writeFile('artifacts/accounting-health/attachment-fixture.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log('PASS - zero-value draft fixture, uploaded bytes, authenticated download, and anonymous denial');
}
