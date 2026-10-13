import assert from 'node:assert/strict';
import { handleDonorDashboard } from '../src/handlers/donor.js';
import { hashSessionToken, parishIdIndexKey } from '../src/lib/core.js';
const email = 'performance@example.test';
const token = 'synthetic-session';
const donor = { email, emailVerifiedAt: new Date().toISOString(), sessionSalt: 'fixture-salt', sessionTokenHash: await hashSessionToken(token, 'fixture-salt'), sessionExpiresAt: '2099-01-01', defaultParishId: 'performance-parish' };
const registration = { parishId: donor.defaultParishId, parishName: 'Performance Parish', status: 'verified', givingStatus: 'active' };
const records = new Map([
  ['__agapay_donor__' + email, JSON.stringify(donor)],
  [parishIdIndexKey(donor.defaultParishId), 'fixture-registration'],
  ['fixture-registration', JSON.stringify(registration)],
]);
const reads = [];
const env = { AGAPAY_REGISTRATIONS: {
  async get(key) { reads.push(key); return records.get(key) ?? null; },
  async put(key, value) { records.set(key, value); },
  async list() { throw new Error('Navigation must not scan giving history'); },
} };
const request = (suffix = '?view=context', headers = { Authorization: `Bearer ${token}`, 'X-AGAPAY-Donor-Email': email }) => new Request('https://agapay.test/api/donor/dashboard' + suffix, { headers });
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('Navigation must not contact Stripe'); };
try {
  const response = await handleDonorDashboard(request(), env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.donor.email, email);
  assert.equal(payload.parish.id, donor.defaultParishId);
  assert.equal(typeof payload.parish.directoryEnabled, 'boolean');
  assert.equal(typeof payload.parish.libraryEnabled, 'boolean');
  assert.equal(typeof payload.parish.communicationsEnabled, 'boolean');
  assert.equal('summary' in payload, false);
  assert.equal('sessionTokenHash' in payload.donor, false);
  assert.equal(reads.some(key => /offering|commemoration/.test(key)), false);
  assert.equal((await handleDonorDashboard(request('?view=context', {}), env)).status, 401);
  records.set('__agapay_donor__' + email, JSON.stringify({ ...donor, sessionExpiresAt: '2000-01-01' }));
  assert.equal((await handleDonorDashboard(request(), env)).status, 401);
  records.set('__agapay_donor__' + email, JSON.stringify({ ...donor, defaultParishId: '' }));
  assert.equal((await (await handleDonorDashboard(request(), env)).json()).parish, null);
  // The default contract must still run the financial path, rather than silently
  // substituting incomplete context for giving totals.
  await assert.rejects(() => handleDonorDashboard(request(''), env), /Navigation must not scan/);
} finally { globalThis.fetch = originalFetch; }
console.log('PASS - navigation context preserves authentication and avoids financial scans and network reconciliation');
