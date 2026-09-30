import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { readUpload, persistDocument } from '../src/sacraments/document-upload.js';
import { MAX_MULTIPART_BODY_BYTES } from '../src/lib/sacrament-document-storage.js';
import {
  addPreparationDocument,
  ensureDefaultPreparationTemplates,
  loadPreparationTemplates,
} from '../src/sacraments/preparation.js';
import { json } from '../src/lib/core.js';

const pdf = new TextEncoder().encode('%PDF-1.7 service test');
async function multipart(value, { length, filename = 'guide.pdf', type = 'application/pdf' } = {}) {
  const form = new FormData();
  if (value !== null) form.set('document', typeof value === 'string' ? value : new File([value], filename, { type }));
  form.set('displayName', 'Parish guide');
  const serialized = new Response(form);
  const body = await serialized.arrayBuffer();
  return new Request('https://agapay.test/upload', {
    method: 'POST',
    body,
    headers: {
      'Content-Type': serialized.headers.get('Content-Type'),
      'Content-Length': length ?? String(body.byteLength),
    },
  });
}
for (const [length, status] of [
  ['', 411],
  ['0', 411],
  ['-1', 411],
  ['invalid', 411],
  ['Infinity', 411],
  [String(MAX_MULTIPART_BODY_BYTES + 1), 413],
]) {
  const request = await multipart(pdf, { length });
  const result = await readUpload(request, json);
  assert.equal(result.error.status, status);
  assert.equal(request.bodyUsed, false, 'header rejection must happen before parsing the body');
  assert.equal(result.error.headers.get('cache-control'), 'no-store');
}
const invalidForm = new Request('https://agapay.test/upload', {
  method: 'POST',
  body: 'bad',
  headers: { 'Content-Type': 'multipart/form-data; boundary=x', 'Content-Length': '3' },
});
assert.equal((await readUpload(invalidForm, json)).error.status, 400);
for (const value of [null, 'text field'])
  assert.equal((await readUpload(await multipart(value), json)).error.status, 422);
assert.equal((await readUpload(await multipart(new Uint8Array()), json)).error.status, 422);
assert.equal(
  (await readUpload(await multipart(pdf, { filename: 'guide.png', type: 'image/png' }), json)).error.status,
  422
);
const upload = await readUpload(await multipart(pdf, { length: String(MAX_MULTIPART_BODY_BYTES) }), json);
assert.equal(upload.error, undefined);
assert.equal(upload.form.get('displayName'), 'Parish guide');
assert.equal(upload.file.name, 'guide.pdf');
assert.equal(upload.sanitizedFilename, 'guide.pdf');
assert.equal(upload.mimeType, 'application/pdf');
assert.deepEqual(new Uint8Array(upload.arrayBuffer), pdf);
assert.equal(upload.sha256, createHash('sha256').update(pdf).digest('hex'));

const input = {
  parishId: 'parish-a',
  templateId: 'template-a',
  documentRole: 'guide',
  uploadedByType: 'parish',
  uploadedByEmail: 'parish@example.test',
  displayName: 'Guide',
  originalFilename: upload.file.name,
  sanitizedFilename: upload.sanitizedFilename,
  mimeType: upload.mimeType,
  fileSize: upload.arrayBuffer.byteLength,
  sha256: upload.sha256,
  arrayBuffer: upload.arrayBuffer,
};
const calls = [];
const bucket = {
  put: async (key, bytes, options) => {
    calls.push(['put', key]);
    assert.equal(bytes, input.arrayBuffer);
    assert.equal(options.customMetadata.agapayParishId, input.parishId);
  },
  delete: async (key) => {
    calls.push(['delete', key]);
  },
};
const env = { SACRAMENT_DOCUMENTS: bucket };
const result = await persistDocument(env, input, async (bindings, record) => {
  assert.equal(bindings, env);
  assert.deepEqual(record, { ...input, storageKey: calls[0][1] });
  calls.push(['record', record.storageKey]);
  return 'document-id';
});
assert.deepEqual(
  calls.map(([operation]) => operation),
  ['put', 'record']
);
assert.deepEqual(result, { documentId: 'document-id', storageKey: calls[0][1] });
assert.equal('storageKey' in input, false, 'service must not mutate the supplied metadata');

const writeFailure = new Error('record rejected');
for (const cleanupFails of [false, true]) {
  calls.length = 0;
  const failureEnv = {
    SACRAMENT_DOCUMENTS: {
      ...bucket,
      delete: async (key) => {
        calls.push(['delete', key]);
        if (cleanupFails) throw new Error('cleanup failed');
      },
    },
  };
  await assert.rejects(
    persistDocument(failureEnv, input, async () => {
      calls.push(['record']);
      throw writeFailure;
    }),
    (error) => error === writeFailure
  );
  assert.deepEqual(
    calls.map(([operation]) => operation),
    ['put', 'record', 'delete']
  );
  assert.equal(calls[0][1], calls[2][1]);
}
const storageFailure = new Error('upload failed');
await assert.rejects(
  persistDocument(
    {
      SACRAMENT_DOCUMENTS: {
        put: async () => {
          throw storageFailure;
        },
        delete: async () => assert.fail('must not delete after failed upload'),
      },
    },
    input,
    async () => assert.fail('must not write a row after failed upload')
  ),
  (error) => error === storageFailure
);

// Exercise the actual legacy record writer with real SQLite constraints and transaction rollback.
const sqlite = new DatabaseSync(':memory:');
try {
  sqlite.exec(
    "PRAGMA foreign_keys = ON; CREATE TABLE sacrament_requests (id TEXT PRIMARY KEY, parish_id TEXT NOT NULL, donor_email TEXT NOT NULL, sacrament_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'requested', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));"
  );
  sqlite.exec(readFileSync(new URL('../migrations/0111_sacrament_preparation.sql', import.meta.url), 'utf8'));
  const db = {
    prepare(sql) {
      return {
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async first() {
          return sqlite.prepare(sql).get(...this.values) ?? null;
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...this.values) };
        },
        async run() {
          const result = sqlite.prepare(sql).run(...this.values);
          return { success: true, meta: { changes: result.changes } };
        },
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  const stored = new Map();
  const databaseEnv = {
    AGAPAY_DB: db,
    SACRAMENT_DOCUMENTS: {
      put: async (key, body) => {
        stored.set(key, body);
      },
      delete: async (key) => {
        stored.delete(key);
      },
    },
  };
  await ensureDefaultPreparationTemplates(databaseEnv, 'parish-a');
  const [template] = await loadPreparationTemplates(databaseEnv, 'parish-a');
  const saved = await persistDocument(databaseEnv, { ...input, templateId: template.id }, addPreparationDocument);
  const row = sqlite.prepare('SELECT * FROM sacrament_preparation_documents WHERE id = ?').get(saved.documentId);
  assert.equal(row.storage_key, saved.storageKey);
  assert.equal(row.parish_id, 'parish-a');
  assert.equal(row.sha256, upload.sha256);
  assert.equal(row.file_size, pdf.byteLength);
  assert.equal(stored.size, 1);
  await assert.rejects(
    persistDocument(databaseEnv, { ...input, templateId: 'missing-template' }, addPreparationDocument),
    /FOREIGN KEY/
  );
  assert.equal(stored.size, 1, 'failed metadata writes must clean up only the new uploaded object');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM sacrament_preparation_documents').get().count, 1);
} finally {
  sqlite.close();
}
console.log(
  'PASS - multipart rejection and validated metadata, ordered storage/record writes, cleanup failure precedence, and real SQLite record integration'
);
