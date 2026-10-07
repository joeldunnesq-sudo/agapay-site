import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { activeFestalAlmsCampaigns } from '../src/festal-alms.js';
import { paidOfferingStatus } from '../src/lib/paid-offering-status.js';
import * as liveModule from '../src/handlers/parish-giving-catalog.js';
import * as legacyCore from '../src/lib/core.js';
import * as legacyParish from '../src/handlers/parish.js';
import { d1, d1First } from '../src/lib/database-reads.js';
import { DONOR_OFFERING_KEY_PREFIX, listKvKeys } from '../src/lib/kv-reads.js';
import { json } from '../src/lib/http-responses.js';
import { loadParishPaidOfferings } from '../src/handlers/parish-giving-read-models.js';

// The declaration bridges must point at the existing canonical implementations.
for (const [name, implementation] of Object.entries({ d1, d1First, DONOR_OFFERING_KEY_PREFIX, listKvKeys }))
  assert.equal(legacyCore[name], implementation);
for (const [name, implementation] of Object.entries({ json, paidOfferingStatus, loadParishPaidOfferings }))
  assert.equal(legacyParish[name], implementation);
const registration = {
  parishId: 'synthetic-catalog',
  parishName: 'Synthetic',
  city: 'Test',
  status: 'verified',
  givingStatus: 'active',
  subscriptionTier: 'giving',
  campaigns: [],
  funds: [],
};
const indexWrites = [];
const publicEnv = {
  AGAPAY_REGISTRATIONS: {
    async put(key, value) {
      indexWrites.push({ key, value });
    },
    async get(key) {
      return key === 'registration' ? JSON.stringify(registration) : null;
    },
    async list({ prefix = '' } = {}) {
      return { keys: 'registration'.startsWith(prefix) ? [{ name: 'registration' }] : [], list_complete: true };
    },
  },
};
const publicResponse = await liveModule.handleParishes(
  new Request('https://app.test/api/parishes?id=synthetic-catalog'),
  publicEnv
);
assert.equal(publicResponse.status, 200);
assert.equal(indexWrites[0].value, 'registration');
assert.equal((await publicResponse.json()).parish.id, 'synthetic-catalog');
assert.equal(publicResponse.headers.get('cache-control'), 'no-store');
registration.givingStatus = 'hidden';
assert.equal(
  (await liveModule.handleParishes(new Request('https://app.test/api/parishes?id=synthetic-catalog'), publicEnv))
    .status,
  404
);

const source = readFileSync(new URL('../src/handlers/parish-giving-catalog.js', import.meta.url), 'utf8');
const code = transformSync(source, { format: 'cjs', target: 'es2022' }).code;
const plain = (value) => JSON.parse(JSON.stringify(value));
function fixture() {
  const state = {
    found: true,
    authorized: true,
    entitled: true,
    store: true,
    limited: false,
    saveFails: false,
    registration: { logoStorageKey: 'old-logo' },
    parish: { id: 'p', status: 'verified', campaigns: [], feastCampaigns: [] },
    gifts: [],
    calls: [],
    saved: [],
    puts: [],
    deletes: [],
    rows: {},
    database: false,
  };
  const env = {
    CAMPAIGN_ASSETS_URL: 'https://assets.test/',
    CAMPAIGN_ASSETS: {
      async put(...args) {
        state.puts.push(args);
      },
      async delete(key) {
        state.deletes.push(key);
      },
    },
    AGAPAY_REGISTRATIONS: {
      async get(key) {
        return state.rows[key] ?? null;
      },
    },
  };
  const parish = {
    findRegistrationByParishId: async (_env, id) => {
      state.calls.push(['find', id]);
      return state.found ? { key: 'record', registration: state.registration } : null;
    },
    getBearerToken: () => 'token',
    givingFeatureAccess: (_r, feature) => {
      state.calls.push(['feature', feature]);
      return state.entitled;
    },
    hasProductionStore: () => state.store,
    json: (body, init) => Response.json(body, init),
    loadParishPaidOfferings: async (_env, id, limit) => {
      state.calls.push(['gifts', id, limit]);
      return state.gifts;
    },
    loadVerifiedRegistrationParishPage: async (_env, options) => {
      state.calls.push(['page', options]);
      return { parishes: [state.parish], cursor: 'next', hasMore: true, limit: 2, source: 'd1' };
    },
    missingProductionStoreResponse: () => new Response('', { status: 500 }),
    paidOfferingStatus,
    parishFromRegistration: () => state.parish,
    rateLimit: async (_r, _e, bucket, options) => {
      state.calls.push(['rate', bucket, options]);
      return state.limited ? new Response('', { status: 429 }) : null;
    },
    registrationRequiresJurisdiction: () => true,
    saveRegistrationRecord: async (_env, key, updated, previous) => {
      state.saved.push({ key, updated, previous });
      if (state.saveFails) throw Error('save failed');
    },
    slugify: (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-'),
    unauthorized: () => new Response('', { status: 401 }),
    verifiedRegistrationParishes: async () => [state.parish],
    verifyParishDashboardBearer: async () => state.authorized,
  };
  const core = {
    DONOR_OFFERING_KEY_PREFIX: 'offerings:',
    d1: () => state.database,
    d1First: async (_env, sql) => {
      state.calls.push(['sql', sql]);
      return { gift_count: '2', total_given_cents: '1234' };
    },
    listKvKeys: async (_env, options) => {
      state.calls.push(['keys', options]);
      return Object.keys(state.rows).map((name) => ({ name }));
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    Response,
    Request,
    URL,
    crypto,
    require: (path) => {
      if (path === './parish.js') return parish;
      if (path === '../lib/core.js') return core;
      if (path === '../festal-alms.js') return { activeFestalAlmsCampaigns };
      throw Error(path);
    },
  });
  return { api: module.exports, state, env };
}
const request = (method = 'POST', headers = {}, body = 'image') =>
  new Request('https://app.test/upload?campaign=roof', {
    method,
    headers: { 'content-type': 'image/png', ...headers },
    ...(method === 'POST' ? { body } : {}),
  });
assert.deepEqual(Object.keys(fixture().api).sort(), Object.keys(liveModule).sort());
assert.deepEqual(
  liveModule.campaignRaisedTotals({ id: 'roof' }, [
    { giftType: 'campaign', campaignId: 'ROOF', amountCents: '250' },
    { giftType: 'feast', campaign: 'roof', amountCents: -50 },
    { giftType: 'offering', campaignId: 'roof', amountCents: 900 },
  ]),
  { raisedCents: 200, giftCount: 2 }
);
assert.equal(liveModule.publicComment('  hello\n world '), 'hello world');
assert.equal(liveModule.publicComment('x'.repeat(300)).length, 280);
for (const value of [true, 'TRUE', '1']) assert.equal(liveModule.publicBoolean(value), true);
for (const value of [false, null, 'false', '0']) assert.equal(liveModule.publicBoolean(value), false);

{
  const { api, state, env } = fixture();
  state.parish.campaigns = [{ id: 'roof', photos: [{ url: '/cover' }], goalCents: '1000' }];
  state.gifts = Array.from({ length: 27 }, (_, n) => ({
    giftType: 'campaign',
    campaignId: 'roof',
    amountCents: 100,
    publicAnonymous: n === 26,
    donorName: 'Visible',
    publicComment: ' hello\n world ',
    createdAt: String(n).padStart(2, '0'),
  }));
  const result = await api.enrichParishGivingOptions(env, state.parish);
  assert.equal(result.campaigns[0].raisedCents, 2700);
  assert.equal(result.campaigns[0].supporters.length, 24);
  assert.equal(result.campaigns[0].supporters[0].name, 'Anonymous');
  assert.equal(result.campaigns[0].coverPhotoUrl, '/cover');
  assert.equal(result.campaigns[0].supporters[0].comment, 'hello world');
  assert.deepEqual(plain(state.calls[0]), ['gifts', 'p', 1000]);
  assert.equal(await api.enrichParishGivingOptions(env, null), null);
  state.gifts = [];
  state.parish.id = 'st-fiacre';
  const demo = await api.enrichParishGivingOptions(env, state.parish);
  assert.equal(demo.campaigns[0].raisedCents, 0); // Unrecognized ID must not acquire demo totals.
  state.parish.campaigns[0].id = 'roof-campaign';
  const seeded = await api.enrichParishGivingOptions(env, state.parish);
  assert.equal(seeded.campaigns[0].raisedCents, 557500);
  assert.equal(seeded.campaigns[0].supporters.length, 8);
}
{
  const { api, state, env } = fixture();
  state.parish = null;
  assert.equal((await api.handleParishes(new Request('https://app.test/api/parishes?id=p'), env)).status, 404);
  state.parish = { id: 'p', status: 'verified', campaigns: [{ id: 'roof', name: 'Roof' }], feastCampaigns: [] };
  const response = await api.handleParishes(
    new Request('https://app.test/api/parishes?limit=2&cursor=x&q=roof&type=mission&jurisdiction=test'),
    env
  );
  assert.equal((await response.json()).cursor, 'next');
  assert.deepEqual(plain(state.calls.find((c) => c[0] === 'page')[1]), {
    limit: '2',
    cursor: 'x',
    q: 'roof',
    type: 'mission',
    jurisdiction: 'test',
  });
  assert.equal((await api.handlePublicCampaign(request(), env)).status, 405);
  assert.equal((await api.handlePublicCampaign(new Request('https://app.test/api/campaign'), env)).status, 422);
  const campaignRequest = new Request('https://app.test/api/campaign?parish=p&slug=roof');
  assert.equal((await api.handlePublicCampaign(campaignRequest, env)).status, 200);
  state.parish.campaigns[0].status = 'hidden';
  assert.equal((await api.handlePublicCampaign(campaignRequest, env)).status, 404);
  state.found = false;
  assert.equal((await api.handlePublicCampaign(campaignRequest, env)).status, 404);
}
for (const name of ['handleParishCampaignUpload', 'handleParishLogo']) {
  const { api, state, env } = fixture();
  const call = (r = request()) => api[name](r, env, 'p');
  assert.equal((await call(request('GET'))).status, 405);
  state.limited = true;
  assert.equal((await call()).status, 429);
  state.limited = false;
  state.store = false;
  assert.equal((await call()).status, 500);
  state.store = true;
  state.found = false;
  assert.equal((await call()).status, 404);
  state.found = true;
  state.authorized = false;
  assert.equal((await call()).status, 401);
  state.authorized = true;
  state.entitled = false;
  assert.equal((await call()).status, 403);
  state.entitled = true;
  const bucket = env.CAMPAIGN_ASSETS;
  delete env.CAMPAIGN_ASSETS;
  assert.equal((await call()).status, 503);
  env.CAMPAIGN_ASSETS = bucket;
  assert.equal((await call(request('POST', { 'content-type': 'image/svg+xml' }))).status, 415);
  assert.equal((await call(request('POST', { 'content-length': '10485761' }))).status, 413);
  assert.equal((await call(request('POST', {}, ''))).status, 422);
  const max = name === 'handleParishLogo' ? 5 : 10;
  assert.equal((await call(request('POST', {}, new Uint8Array(max * 1024 * 1024 + 1)))).status, 413);
  assert.equal(state.puts.length, 0);
  const success = await (await call()).json();
  assert.equal(success.ok, true);
  assert.equal(success.size, 5);
  assert.ok(success.key.endsWith('.png'));
  assert.deepEqual(plain(state.puts[0][2]), {
    customMetadata: { agapayParishId: 'p' },
    httpMetadata: { contentType: 'image/png', cacheControl: 'no-store' },
  });
  assert.equal(success.url || success.logoUrl, 'https://assets.test/' + success.key);
  if (name === 'handleParishLogo') {
    assert.deepEqual(state.deletes, ['old-logo']);
    assert.equal(state.saved[0].previous, state.registration);
  }
}
{
  const { api, state, env } = fixture();
  state.saveFails = true;
  await assert.rejects(api.handleParishLogo(request(), env, 'p'), /save failed/);
  assert.deepEqual(state.deletes, [state.puts[0][0]]);
  assert.ok(!state.deletes.includes('old-logo'));
  state.deletes = [];
  state.saveFails = false;
  state.entitled = false;
  assert.equal((await api.handleParishLogo(request('DELETE'), env, 'p')).status, 200);
  assert.deepEqual(state.deletes, ['old-logo']);
  assert.equal(state.saved.at(-1).updated.logoUrl, '');
}
{
  const { api, state, env } = fixture();
  state.database = true;
  assert.deepEqual(plain(await api.loadPaidDonorOfferingPlatformTotals(env)), { giftCount: 2, totalGivenCents: 1234 });
  assert.match(state.calls.at(-1)[1], /payment_status IN \('paid', 'succeeded'\)/);
  state.database = false;
  state.rows = {
    one: JSON.stringify({ status: 'paid', amountCents: '123' }),
    bad: '{',
    unpaid: JSON.stringify({ status: 'pending', amountCents: 999 }),
  };
  assert.deepEqual(plain(await api.loadPaidDonorOfferingPlatformTotals(env)), { giftCount: 1, totalGivenCents: 123 });
  assert.deepEqual(plain(state.calls.at(-1)[1]), { prefix: 'offerings:', limit: 5000 });
  state.parish.campaigns = [{ active: true }, { active: false }, { hidden: true }];
  const summary = await (await api.handlePublicPlatformSummary(env)).json();
  assert.equal(summary.summary.activeCampaigns, 1);
  assert.equal(summary.summary.totalGivenCents, 123);
  state.store = false;
  assert.equal((await (await api.handlePublicPlatformSummary(env)).json()).summary.dataSource, 'not_configured');
}
console.log(
  'PASS - catalog handler: campaign totals/supporter privacy, hidden public records, pagination, method/auth/tier/storage/size guards, R2 metadata, logo rollback and D1/KV totals'
);
