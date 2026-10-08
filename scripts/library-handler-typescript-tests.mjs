import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  handleParishLibrary,
  handleDonorParishLibrary,
  validateParishLibraryPdf,
  PARISH_LIBRARY_PDF_MAX_BYTES,
} from '../src/handlers/parish-library.js';
import { issueParishDashboardSession, hashSessionToken } from '../src/lib/core.js';
import { memoryRateLimiter } from './lib/memory-rate-limiter.mjs';
import {
  organizationContextFromRegistration,
  organizationAuthorizationScope,
  bindOrganizationAuthorizationContext,
  organizationAuditFields,
  authorizeOrganization,
} from '../src/organizations/index.js';
const db = new DatabaseSync(':memory:');
for (const migration of ['0001_production_records', '0014_audit_log', '0105_parish_library'])
  db.exec(readFileSync(`migrations/${migration}.sql`, 'utf8'));
let failUploadWrite = false,
  failDelete = false;
const stored = new Map(),
  puts = [],
  deletions = [];
const env = {
  AGAPAY_RATE_LIMITER: memoryRateLimiter(),
  AGAPAY_ENVIRONMENT: 'test',
  AGAPAY_DB: {
    prepare(sql) {
      return {
        params: [],
        bind(...params) {
          this.params = params;
          return this;
        },
        async first() {
          return db.prepare(sql).get(...this.params) || null;
        },
        async all() {
          return { results: db.prepare(sql).all(...this.params) };
        },
        async run() {
          if (failUploadWrite && /SET object_key/.test(sql)) throw Error('injected write failure');
          const result = db.prepare(sql).run(...this.params);
          return { success: true, meta: { changes: result.changes } };
        },
      };
    },
  },
  PARISH_LIBRARY_ASSETS: {
    async put(key, bytes, options) {
      const value = { bytes: bytes.slice(0), options };
      stored.set(key, value);
      puts.push({ key, ...value });
    },
    async get(key) {
      const value = stored.get(key);
      return value ? { body: value.bytes.slice(0) } : null;
    },
    async delete(key) {
      deletions.push(key);
      if (failDelete) throw Error('injected storage deletion failure');
      stored.delete(key);
    },
  },
};
const sessions = {};
const saveRegistration = (r) =>
  db
    .prepare('INSERT OR REPLACE INTO registrations(reference, parish_id, updated_at, data) VALUES(?,?,?,?)')
    .run(r.reference, r.parishId, new Date().toISOString(), JSON.stringify(r));
for (const parishId of ['a', 'b', 'free']) {
  const r = {
    reference: 'REG-' + parishId,
    parishId,
    parishName: 'Parish ' + parishId,
    communityType: 'Parish',
    subscriptionTier: parishId === 'free' ? 'starter' : 'parish',
    subscriptionStatus: 'active',
    priestEmail: parishId + '@example.test',
  };
  sessions[parishId] = await issueParishDashboardSession(r, { mfaVerifiedAt: new Date().toISOString() });
  saveRegistration(sessions[parishId].registration);
}
const token = 'synthetic-donor-token',
  salt = 'synthetic-salt';
async function donorRecord(parishId = 'a', overrides = {}) {
  const r = {
    email: 'donor@example.test',
    defaultParishId: parishId,
    emailVerifiedAt: new Date().toISOString(),
    sessionSalt: salt,
    sessionTokenHash: await hashSessionToken(token, salt),
    ...overrides,
  };
  db.prepare('INSERT OR REPLACE INTO donors(email,updated_at,data) VALUES(?,?,?)').run(
    r.email,
    new Date().toISOString(),
    JSON.stringify(r)
  );
}
const request = (method, body, headers = {}) =>
  new Request('https://example.test/library', { method, headers, ...(body === undefined ? {} : { body }) });
const admin = (method = 'GET', subpath = '', body, parishId = 'a', auth = sessions[parishId]?.token, binding = env) =>
  handleParishLibrary(
    request(method, body === undefined ? undefined : JSON.stringify(body), {
      authorization: `Bearer ${auth || ''}`,
      'content-type': 'application/json',
    }),
    binding,
    parishId,
    subpath
  );
const donor = (subpath = '', auth = token, binding = env) =>
  handleDonorParishLibrary(
    request('GET', undefined, { authorization: `Bearer ${auth}`, 'X-AGAPAY-Donor-Email': 'donor@example.test' }),
    binding,
    subpath
  );
const upload = (id, text = '%PDF-1.7\nfixture', binding = env) =>
  handleParishLibrary(
    request('POST', text, {
      authorization: `Bearer ${sessions.a.token}`,
      'content-type': 'application/pdf',
      'x-agapay-file-name': 'unsafe/"name.txt',
    }),
    binding,
    'a',
    `${id}/file`
  );
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw Error('Unexpected external network request');
};
try {
  assert.equal((await admin('GET', '', undefined, 'a', 'bad')).status, 401);
  assert.equal((await admin('GET', '', undefined, 'missing', 'bad')).status, 404);
  assert.equal((await admin('GET', '', undefined, 'free')).status, 403);
  assert.equal((await admin('GET', '', undefined, 'b', sessions.a.token)).status, 401);
  assert.equal((await handleParishLibrary(request('GET'), {}, 'a')).status, 500);
  assert.equal((await admin('POST', '', { title: 'Bad', resourceType: 'link', url: 'http://localhost' })).status, 422);
  assert.equal(
    (await admin('POST', '', { title: 'Bad', resourceType: 'pdf', url: 'https://example.test' })).status,
    422
  );
  let response = await admin('POST', '', { title: 'Guide', resourceType: 'pdf', category: 'forms_policies' });
  assert.equal(response.status, 201);
  const pdf = (await response.json()).resource;
  assert.equal(pdf.status, 'draft');
  assert.equal(pdf.fileReady, false);
  assert.equal((await admin('PATCH', pdf.id, { status: 'published' })).status, 422);
  assert.equal((await upload(pdf.id, 'fake')).status, 415);
  response = await upload(pdf.id);
  assert.equal(response.status, 200);
  const firstKey = puts.at(-1).key;
  assert.match(firstKey, new RegExp(`^parish-library/a/${pdf.id}/`));
  assert.deepEqual(puts.at(-1).options, {
    customMetadata: { agapayParishId: 'a' },
    httpMetadata: { contentType: 'application/pdf', cacheControl: 'private, no-store' },
  });
  assert.equal((await response.json()).resource.fileName, 'unsafe-name.txt.pdf');
  const count = stored.size;
  failUploadWrite = true;
  await assert.rejects(upload(pdf.id, '%PDF-1.7\nfailed'), /injected write failure/);
  failUploadWrite = false;
  assert.equal(stored.size, count);
  assert.equal(stored.has(firstKey), true);
  assert.equal(
    db.prepare('SELECT object_key FROM parish_library_resources WHERE id=?').get(pdf.id).object_key,
    firstKey
  );
  response = await upload(pdf.id, '%PDF-1.7\nreplacement');
  assert.equal(response.status, 200);
  assert.equal(stored.has(firstKey), false);
  const latestKey = puts.at(-1).key;
  assert.equal((await admin('PATCH', pdf.id, { status: 'published' })).status, 200);
  assert.equal((await admin('PATCH', pdf.id, { resourceType: 'link' })).status, 422);
  assert.equal((await admin('PATCH', pdf.id, { title: 'attack' }, 'b')).status, 404);
  assert.equal((await admin('DELETE', pdf.id, undefined, 'b')).status, 404);
  await donorRecord();
  assert.equal((await donor('', 'bad')).status, 401);
  assert.equal((await donor()).status, 200);
  assert.equal((await (await donor()).json()).available, false);
  assert.equal((await admin('PATCH', 'settings', { enabled: true })).status, 200);
  response = await donor();
  const listing = await response.json();
  assert.equal(listing.available, true);
  assert.equal(listing.resources.length, 1);
  assert.equal('object_key' in listing.resources[0], false);
  response = await donor(`${pdf.id}/file`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '%PDF-1.7\nreplacement');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('content-disposition'), 'inline; filename="unsafe-name.txt.pdf"');
  await donorRecord('b');
  await admin('PATCH', 'settings', { enabled: true }, 'b');
  assert.equal((await donor(`${pdf.id}/file`)).status, 404);
  await donorRecord('a', { emailVerifiedAt: '' });
  assert.equal((await donor()).status, 401);
  await donorRecord('a', { sessionExpiresAt: '2000-01-01' });
  assert.equal((await donor()).status, 401);
  await donorRecord('');
  assert.equal((await donor()).status, 422);
  await donorRecord('missing');
  assert.equal((await donor()).status, 404);
  await donorRecord('free');
  assert.equal((await (await donor()).json()).available, false);
  await donorRecord();
  assert.equal((await donor(`${pdf.id}/file`, token, { ...env, PARISH_LIBRARY_ASSETS: undefined })).status, 503);
  const object = stored.get(latestKey);
  stored.delete(latestKey);
  assert.equal((await donor(`${pdf.id}/file`)).status, 404);
  stored.set(latestKey, object);
  db.prepare('UPDATE parish_library_resources SET expires_at=? WHERE id=?').run('2000-01-01', pdf.id);
  assert.equal((await donor(`${pdf.id}/file`)).status, 404);
  assert.equal((await (await donor()).json()).resources.length, 0);
  db.prepare('UPDATE parish_library_resources SET expires_at=NULL WHERE id=?').run(pdf.id);
  assert.equal((await admin('POST', `${pdf.id}/archive`)).status, 200);
  assert.equal((await upload(pdf.id)).status, 422);
  assert.equal((await donor(`${pdf.id}/file`)).status, 404);
  failDelete = true;
  assert.equal((await admin('DELETE', pdf.id)).status, 200);
  failDelete = false;
  assert.equal(db.prepare('SELECT id FROM parish_library_resources WHERE id=?').get(pdf.id), undefined);
  assert.equal((await admin('PUT')).status, 405);
  const audits = db.prepare('SELECT organization_id,metadata_json FROM audit_log').all();
  assert.ok(audits.length >= 5);
  assert.ok(audits.every((r) => ['a', 'b'].includes(r.organization_id)));
  assert.ok(audits.every((r) => JSON.parse(r.metadata_json).organizationType === 'church'));
  for (const [headers, body, status] of [
    [{}, '%PDF-', 415],
    [{ 'content-type': 'application/pdf' }, '', 422],
    [{ 'content-type': 'application/pdf', 'content-length': String(PARISH_LIBRARY_PDF_MAX_BYTES + 1) }, '%PDF-', 413],
    [{ 'content-type': 'application/pdf' }, new Uint8Array(PARISH_LIBRARY_PDF_MAX_BYTES + 1), 413],
  ])
    assert.equal((await validateParishLibraryPdf(request('POST', body, headers))).status, status);
  const organization = organizationContextFromRegistration(sessions.a.registration);
  assert.equal(
    organizationAuthorizationScope({ ...organization, legacy: { ...organization.legacy, parishId: 'b' } }),
    null
  );
  assert.equal(bindOrganizationAuthorizationContext(null, organization), null);
  const bound = bindOrganizationAuthorizationContext({ user: { id: 'u' } }, organization);
  assert.equal(bound.user.id, 'u');
  assert.ok(Object.isFrozen(bound));
  const audit = organizationAuditFields(organization, {
    organizationId: 'wrong',
    metadata: { organizationType: 'wrong', keep: true },
  });
  assert.equal(audit.organizationId, 'a');
  assert.equal(audit.metadata.organizationType, 'church');
  assert.equal(audit.metadata.keep, true);
  assert.equal(organizationAuditFields(organization, []), null);
  let calls = 0;
  assert.equal(
    await authorizeOrganization(request('GET'), env, {
      organization: null,
      authorize: () => {
        calls++;
      },
    }),
    null
  );
  assert.equal(calls, 0);
  await assert.rejects(authorizeOrganization(request('GET'), env, { organization }), /explicit authorization/);
  const authorized = await authorizeOrganization(request('GET'), env, {
    organization,
    capability: 'library.manage',
    authorize: (_r, _e, args) => {
      assert.deepEqual(args, { parishId: 'a', capability: 'library.manage' });
      return { user: 'u' };
    },
  });
  assert.equal(authorized.user, 'u');
  assert.equal(authorized.organizationScope.legacyParishId, 'a');
} finally {
  globalThis.fetch = originalFetch;
  db.close();
}
console.log(
  'PASS - real-session library resource lifecycle, scoped private PDF access, upload rollback/replacement, audit identity, expiry/auth failures and organization authorization boundaries'
);
