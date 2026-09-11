import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { appAssets, contentVersion, versionAppAssetReferences } from './lib/app-asset-versions.mjs';

assert.equal(contentVersion('a\r\nb\r\n'), contentVersion('a\nb\n'));
assert.notEqual(contentVersion('a'), contentVersion('b'));
const urls = new Map([['/donor/app.js', '/donor/app.js?v=abc123']]);
const html = `<script src="/donor/app.js?v=old" defer></script><script src='/donor/app.js'></script><a href="/donor/app.js?other=1&v=old#part"></a><script src="/other.js?v=old"></script>`;
const updated = versionAppAssetReferences(html, urls);
assert.equal(
  updated,
  `<script src="/donor/app.js?v=abc123" defer></script><script src='/donor/app.js?v=abc123'></script><a href="/donor/app.js?other=1&v=abc123#part"></a><script src="/other.js?v=old"></script>`
);
assert.equal(versionAppAssetReferences(updated, urls), updated, 'versioning is idempotent');
const serviceWorker = readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8');
const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const sandbox = { self: { location: { origin: 'https://agapay.test' } } };
const start = serviceWorker.indexOf('function isVersionedStaticAsset');
vm.runInNewContext(serviceWorker.slice(start, serviceWorker.indexOf('self.addEventListener("fetch"', start)), sandbox);
for (const asset of appAssets) {
  assert.equal(
    sandbox.isVersionedStaticAsset({ method: 'GET' }, new URL(`${asset}?v=abc`, 'https://agapay.test')),
    true,
    `${asset} must retain PWA cache support`
  );
  assert.ok(
    headers.includes(`${asset}\n  Cache-Control: public, max-age=31536000, immutable`),
    `${asset} must have immutable caching`
  );
}
execFileSync(process.execPath, ['scripts/version-app-assets.mjs', '--check'], { stdio: 'inherit' });
console.log('PASS - content versions are deterministic and all shared app references are current');
