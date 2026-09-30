import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as tax from '../src/lib/tax-exemption-storage.js';
import * as nonprofit from '../src/lib/nonprofit-pricing-storage.js';
import * as accounting from '../src/lib/accounting-attachment-storage.js';

const pdf = new TextEncoder().encode('%PDF-1.7 test');
assert.equal(nonprofit.sanitizeFilename, tax.sanitizeFilename);
assert.equal(accounting.sha256Hex, tax.sha256Hex);
assert.equal(await nonprofit.sha256Hex(pdf.buffer), createHash('sha256').update(pdf).digest('hex'));
assert.equal(tax.sanitizeFilename('../../bad\r\n"name.pdf'), '.._.._badname.pdf');
for (const [binding, prefix, generate, validate, put, stream, remove] of [
  [
    'TAX_EXEMPTION_DOCS',
    'texdoc',
    tax.generateStorageKey,
    tax.validateExemptionUpload,
    tax.putExemptionDocument,
    tax.streamExemptionDocument,
    tax.deleteExemptionDocument,
  ],
  [
    'NONPROFIT_PRICING_DOCS',
    'nonprofit-pricing',
    nonprofit.generateNonprofitPricingStorageKey,
    nonprofit.validateNonprofitPricingUpload,
    nonprofit.putNonprofitPricingDocument,
    nonprofit.streamNonprofitPricingDocument,
    null,
  ],
  [
    'ACCOUNTING_ATTACHMENTS',
    'acctdoc',
    accounting.generateStorageKey,
    accounting.validateAccountingAttachmentUpload,
    accounting.putAccountingAttachment,
    accounting.streamAccountingAttachment,
    accounting.deleteAccountingAttachment,
  ],
]) {
  const key = generate();
  assert.match(key, new RegExp(`^${prefix}/[a-f0-9]{64}$`));
  assert.notEqual(generate(), key);
  const input = { parishId: 'parish-a', arrayBuffer: pdf.buffer, mimeType: 'application/pdf' };
  await assert.rejects(put({}, input), /not configured/);
  assert.equal((await stream({}, { storageKey: key })).status, 500);
  const writes = [];
  const reads = [];
  const deletes = [];
  let release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  const env = {
    [binding]: {
      put: async (...args) => {
        writes.push(args);
        await barrier;
      },
      get: async (storageKey) => {
        reads.push(storageKey);
        return storageKey === 'missing'
          ? null
          : {
              body: new ReadableStream({
                start(controller) {
                  controller.enqueue(pdf);
                  controller.close();
                },
              }),
            };
      },
      delete: async (storageKey) => {
        deletes.push(storageKey);
      },
    },
  };
  let complete = false;
  const uploading = put(env, input).then((result) => {
    complete = true;
    return result;
  });
  await Promise.resolve();
  assert.equal(complete, false);
  release();
  const storedKey = await uploading;
  assert.equal(writes[0][0], storedKey);
  assert.match(storedKey, new RegExp(`^${prefix}/[a-f0-9]{64}$`));
  assert.equal(writes[0][1], pdf.buffer);
  assert.deepEqual(writes[0][2], {
    customMetadata: { agapayParishId: 'parish-a' },
    httpMetadata: { contentType: 'application/pdf' },
  });
  for (const mode of [undefined, 'inline', 'attachment', 'legacy-unknown']) {
    const response = await stream(env, {
      storageKey: storedKey,
      mimeType: 'application/pdf',
      sanitizedFilename: '../../é"\r\n.pdf',
      mode,
    });
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get('content-disposition'),
      `${mode === 'attachment' ? 'attachment' : 'inline'}; filename=".._..__.pdf"`
    );
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('content-security-policy'), "default-src 'none'");
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), pdf);
    assert.equal(reads.at(-1), storedKey);
  }
  const fallback = await stream(env, { storageKey: storedKey });
  assert.equal(fallback.headers.get('content-type'), 'application/octet-stream');
  assert.equal(fallback.headers.get('content-disposition'), 'inline; filename="document"');
  await fallback.body.cancel();
  assert.equal((await stream(env, { storageKey: 'missing' })).status, 404);
  const failure = new Error('storage error');
  const operations = [
    [put, input, 'put'],
    [stream, { storageKey: storedKey }, 'get'],
  ];
  if (remove) {
    await remove({}, storedKey);
    await remove(env, storedKey);
    await remove(env, '');
    assert.deepEqual(deletes, [storedKey, ''], 'existing helpers forward empty keys when storage is configured');
    operations.push([remove, storedKey, 'delete']);
  }
  for (const [operation, args, method] of operations) {
    await assert.rejects(
      operation(
        {
          [binding]: {
            [method]: async () => {
              throw failure;
            },
          },
        },
        args
      ),
      (error) => error === failure
    );
  }
  for (const [filename, declaredMimeType, bytes, mimeType] of [
    ['document.PDF', 'APPLICATION/PDF', pdf, 'application/pdf'],
    ['photo.jpeg', 'image/jpeg', new Uint8Array([255, 216, 255, 0]), 'image/jpeg'],
    ['photo.png', 'image/png', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png'],
    // Existing policy accepts a supported declaration, then uses signature + extension.
    ['document.pdf', 'image/png', pdf, 'application/pdf'],
  ])
    assert.deepEqual(await validate({ filename, declaredMimeType, arrayBuffer: bytes.buffer }), { ok: true, mimeType });
  for (const arrayBuffer of [undefined, null, new ArrayBuffer(0)])
    assert.equal((await validate({ arrayBuffer })).ok, false);
  for (const [filename, declaredMimeType, arrayBuffer] of [
    ['file.exe', 'application/pdf', pdf.buffer],
    ['file.pdf', 'application/octet-stream', pdf.buffer],
    ['file.png', 'image/png', pdf.buffer],
    ['file.pdf', 'application/pdf', new ArrayBuffer(16)],
  ])
    assert.equal((await validate({ filename, declaredMimeType, arrayBuffer })).ok, false);
  const atLimit = new Uint8Array(10 * 1024 * 1024);
  atLimit.set(pdf);
  assert.equal(
    (await validate({ filename: 'file.pdf', declaredMimeType: 'application/pdf', arrayBuffer: atLimit.buffer })).ok,
    true
  );
  assert.match((await validate({ arrayBuffer: new ArrayBuffer(atLimit.length + 1) })).error, /10 MB/);
}
assert.equal(Object.isFrozen(accounting.ACCOUNTING_ATTACHMENT_UPLOAD_LIMITS), true);
assert.equal(Object.isFrozen(accounting.ACCOUNTING_ATTACHMENT_UPLOAD_LIMITS.allowedMimeTypes), true);
console.log(
  'PASS - certificate/nonprofit/accounting storage retain private streams, metadata, failure propagation, upload boundaries, shared helpers, and legacy MIME acceptance'
);
