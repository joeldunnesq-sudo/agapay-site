import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  generateGivingStatementStorageKey,
  putGivingStatementPdf,
  streamGivingStatementPdf,
  deleteGivingStatementPdf,
} from '../src/lib/giving-statement-storage.js';
import {
  generateSacramentDocumentStorageKey,
  validateSacramentDocumentUpload,
  sacramentDocumentSha256,
  putSacramentDocument,
  streamSacramentDocument,
  deleteSacramentDocumentObject,
  SACRAMENT_DOCUMENT_UPLOAD_LIMITS,
} from '../src/lib/sacrament-document-storage.js';

const pdf = new TextEncoder().encode('%PDF-1.7 test');
for (const [binding, generate, put, stream, remove, prefix] of [
  [
    'GIVING_STATEMENTS',
    generateGivingStatementStorageKey,
    putGivingStatementPdf,
    streamGivingStatementPdf,
    deleteGivingStatementPdf,
    'gstmt',
  ],
  [
    'SACRAMENT_DOCUMENTS',
    generateSacramentDocumentStorageKey,
    putSacramentDocument,
    streamSacramentDocument,
    deleteSacramentDocumentObject,
    'sacdoc',
  ],
]) {
  const storageKey = generate();
  assert.match(storageKey, new RegExp(`^${prefix}/[a-f0-9]{64}$`));
  assert.notEqual(generate(), storageKey);
  const input = {
    parishId: 'parish-a',
    storageKey,
    bytes: pdf,
    arrayBuffer: pdf.buffer,
    mimeType: 'application/pdf',
    filename: 'report-é.pdf',
  };
  await assert.rejects(put({}, input), /not configured/);
  assert.equal((await stream({}, input)).status, 500);
  const puts = [];
  const gets = [];
  const deletes = [];
  let objectPresent = true;
  let releasePut;
  const pendingPut = new Promise((resolve) => {
    releasePut = resolve;
  });
  const env = {
    [binding]: {
      put: async (...args) => {
        puts.push(args);
        await pendingPut;
      },
      get: async (key) => {
        gets.push(key);
        if (!objectPresent) return null;
        return {
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(pdf);
              controller.close();
            },
          }),
          httpEtag: '"etag-test"',
        };
      },
      delete: async (key) => {
        deletes.push(key);
      },
    },
  };
  let putCompleted = false;
  const uploading = put(env, input).then((result) => {
    putCompleted = true;
    return result;
  });
  await Promise.resolve();
  assert.equal(putCompleted, false, 'caller must wait for storage completion');
  releasePut();
  const result = await uploading;
  assert.equal(puts.length, 1);
  assert.equal(puts[0][0], prefix === 'gstmt' ? storageKey : result);
  assert.deepEqual(puts[0][2], {
    customMetadata: { agapayParishId: 'parish-a' },
    httpMetadata: { contentType: 'application/pdf' },
  });
  assert.deepEqual(new Uint8Array(puts[0][1] instanceof ArrayBuffer ? puts[0][1] : puts[0][1].buffer), pdf);
  const response = await stream(env, input);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('content-security-policy'), "default-src 'none'");
  assert.equal(
    response.headers.get('content-disposition'),
    `${prefix === 'gstmt' ? 'attachment' : 'inline'}; filename="report-_.pdf"`
  );
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), pdf);
  assert.equal(gets.at(-1), storageKey);
  if (prefix === 'sacdoc') {
    assert.equal(response.headers.get('etag'), '"etag-test"');
    const download = await stream(env, { ...input, download: true });
    assert.match(download.headers.get('content-disposition'), /^attachment;/);
    await download.body.cancel();
    assert.equal((await stream({ [binding]: { get: async () => ({ body: null }) } }, input)).status, 404);
  }
  objectPresent = false;
  assert.equal((await stream(env, input)).status, 404);
  await remove({}, storageKey);
  await remove(env, null);
  await remove(env, '');
  assert.deepEqual(deletes, []);
  await remove(env, storageKey);
  assert.deepEqual(deletes, [storageKey]);
  const failure = new Error('storage failure');
  for (const [operation, args, method] of [
    [put, input, 'put'],
    [stream, input, 'get'],
    [remove, storageKey, 'delete'],
  ]) {
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
}

assert.equal(await sacramentDocumentSha256(pdf.buffer), createHash('sha256').update(pdf).digest('hex'));
for (const [filename, declaredMimeType, bytes] of [
  ['document.PDF', 'APPLICATION/PDF', pdf],
  ['photo.jpg', 'image/jpeg', new Uint8Array([255, 216, 255, 0])],
  ['photo.png', 'image/png', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
]) {
  assert.deepEqual(validateSacramentDocumentUpload({ filename, declaredMimeType, arrayBuffer: bytes.buffer }), {
    ok: true,
    mimeType: declaredMimeType.toLowerCase(),
  });
}
for (const arrayBuffer of [undefined, null, new ArrayBuffer(0)])
  assert.equal(validateSacramentDocumentUpload({ arrayBuffer }).ok, false);
assert.equal(
  validateSacramentDocumentUpload({ filename: 'x.pdf', declaredMimeType: 'image/png', arrayBuffer: pdf.buffer }).ok,
  false
);
assert.equal(
  validateSacramentDocumentUpload({ filename: 'x.exe', declaredMimeType: 'application/pdf', arrayBuffer: pdf.buffer })
    .ok,
  false
);
assert.equal(
  validateSacramentDocumentUpload({
    filename: 'x.pdf',
    declaredMimeType: 'application/pdf',
    arrayBuffer: new ArrayBuffer(16),
  }).ok,
  false
);
const atLimit = new Uint8Array(SACRAMENT_DOCUMENT_UPLOAD_LIMITS.maxFileSizeBytes);
atLimit.set(pdf);
assert.equal(
  validateSacramentDocumentUpload({
    filename: 'x.pdf',
    declaredMimeType: 'application/pdf',
    arrayBuffer: atLimit.buffer,
  }).ok,
  true
);
assert.match(validateSacramentDocumentUpload({ arrayBuffer: new ArrayBuffer(atLimit.length + 1) }).error, /10 MB/);
console.log(
  'PASS - private document uploads, ownership metadata, streamed responses, missing storage, deletion, propagated failures, hashing and file validation'
);
