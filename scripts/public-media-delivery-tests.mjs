import assert from 'node:assert/strict';
import { POLICY_VERSION } from '../src/portability/catalog.js';
import { parsePublicMediaPath, publicMediaBase, workerPublicMediaDeliveryEnabled, workerPublicMediaVerified } from '../src/portability/public-media.js';
import { handlePublicParishAsset } from '../src/handlers/public-parish-assets.js';

const baseEnv = {
  AGAPAY_PUBLIC_URL: 'https://agapay.test',
  PARISH_PUBLIC_MEDIA_DELIVERY_ENABLED: POLICY_VERSION,
  PARISH_R2_DEV_PUBLIC_ACCESS_DISABLED: POLICY_VERSION,
  CAMPAIGN_ASSETS_URL: 'https://agapay.test/api/public/parish-assets/campaign',
  ANNOUNCEMENT_ASSETS_URL: 'https://agapay.test/api/public/parish-assets/announcement',
  TEACHING_ASSETS_URL: 'https://agapay.test/api/public/parish-assets/teaching',
};
assert.equal(publicMediaBase(baseEnv, 'CAMPAIGN_ASSETS'), baseEnv.CAMPAIGN_ASSETS_URL);
assert.equal(workerPublicMediaDeliveryEnabled(baseEnv), true);
assert.equal(workerPublicMediaVerified(baseEnv), true);
const cutoverEnv = { ...baseEnv, PARISH_R2_DEV_PUBLIC_ACCESS_DISABLED: '' };
assert.equal(workerPublicMediaDeliveryEnabled(cutoverEnv), true);
assert.equal(workerPublicMediaVerified(cutoverEnv), false);
assert.deepEqual(parsePublicMediaPath('/api/public/parish-assets/teaching/teaching/parish/post/audio.mp3'), { binding: 'TEACHING_ASSETS', key: 'teaching/parish/post/audio.mp3' });
assert.equal(parsePublicMediaPath('/api/public/parish-assets/campaign/%2e%2e/secret'), null);
assert.equal(parsePublicMediaPath('/api/public/parish-assets/private/key'), null);

const bytes = new TextEncoder().encode('asset');
const object = { body: new Response(bytes).body, etag: 'etag-1', size: bytes.length, writeHttpMetadata(headers) { headers.set('Content-Type', 'image/png'); headers.set('Cache-Control', 'public, max-age=31536000, immutable'); } };
const env = {
  ...cutoverEnv,
  PARISH_STORAGE_GUARDS_ENABLED: 'false',
  CAMPAIGN_ASSETS: { async get(key) { return key === 'campaigns/parish/photo.png' ? object : null; }, async head() { return object; } },
  AGAPAY_DB: { prepare() { return { bind(binding, key) { return { async first() { return binding === 'CAMPAIGN_ASSETS' && key === 'campaigns/parish/photo.png' ? { parish_id: 'parish-a', state: 'stored', etag: 'etag-1' } : null; } }; } }; } },
};
const response = await handlePublicParishAsset(new Request('https://agapay.test/api/public/parish-assets/campaign/campaigns/parish/photo.png'), env);
assert.equal(response.status, 200);
assert.equal(response.headers.get('cache-control'), 'no-store');
assert.equal(response.headers.get('content-type'), 'image/png');
assert.equal(await response.text(), 'asset');
assert.equal(workerPublicMediaVerified(env), false, 'closure must remain blocked during the delivery cutover');
const disabled = await handlePublicParishAsset(new Request('https://agapay.test/api/public/parish-assets/campaign/campaigns/parish/photo.png'), { ...env, PARISH_PUBLIC_MEDIA_DELIVERY_ENABLED: 'false' });
assert.equal(disabled.status, 404);

console.log('PASS - public parish media delivery is registry-owned, policy-gated, traversal-safe, and no-store');
