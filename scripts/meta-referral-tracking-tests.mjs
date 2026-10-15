import vm from 'node:vm';
import { appAssetUrl } from './lib/app-asset-versions.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { json } from '../src/lib/core.js';

const [givePage, requestDemoPage, pixel, privacy, headers] = await Promise.all([
  readFile('public/give/index.html', 'utf8'),
  readFile('public/give/request-demo.html', 'utf8'),
  readFile('public/meta-pixel.js', 'utf8'),
  readFile('public/privacy.html', 'utf8'),
  readFile('public/_headers', 'utf8'),
]);
const core = json({}).headers.get('Content-Security-Policy-Report-Only');

const pixelId = '1065546639329281';
const tagCount = (source, pattern) => [...source.matchAll(pattern)].length;

assert.equal(
  tagCount(pixel, /window\d*\.fbq\(['"]init['"], pixelId\)/g),
  1,
  'Meta Pixel must initialize once in the shared loader'
);
assert.equal(
  tagCount(pixel, /window\d*\.fbq\(['"]track['"], ['"]PageView['"]\)/g),
  1,
  'PageView must fire once in the shared loader'
);
assert.match(pixel, new RegExp(pixelId), 'shared loader must use the configured Pixel/Dataset ID');
assert.match(
  pixel,
  /https:\/\/connect\.facebook\.net\/en_US\/fbevents\.js/,
  "shared loader must use Meta's standard client library"
);
assert.match(
  pixel,
  /typeof window\d*\.fbq !== ['"]function['"][\s\S]*catch \(_error\)/,
  'tracking helpers must fail silently when Meta is unavailable'
);

assert.equal(
  requestDemoPage.split('<script src="' + appAssetUrl('/meta-pixel.js') + '"></script>').length - 1,
  1,
  'request-demo page must load the shared Pixel once'
);
assert.equal(
  tagCount(requestDemoPage, new RegExp(`facebook\\.com/tr\\?id=${pixelId}`, 'g')),
  1,
  'request-demo page must have one noscript fallback'
);
assert.match(
  givePage,
  /href="\/downloads\/agapay-parish-council-overview\.pdf" download/,
  'the consolidated Give page must preserve the council proposal download'
);
assert.match(givePage, /href="\/give\/request-demo"/, 'the consolidated Give page must preserve the guided-demo path');

assert.match(requestDemoPage, /attribution: window.getAgapayAttribution/);
const backendSuccessCheck = requestDemoPage.indexOf('if (!response.ok || !payload.ok) {');
const leadCall = requestDemoPage.indexOf('trackLeadOnce();', backendSuccessCheck);
assert.ok(
  backendSuccessCheck > -1 && leadCall > backendSuccessCheck,
  'Lead must fire only after backend-confirmed success'
);
assert.match(requestDemoPage, /trackMetaStandardEvent\("Lead", \{ content_name: "AGAPAY Parish Demo Request" \}\)/);
assert.match(
  requestDemoPage,
  /leadTracked[\s\S]*sessionStorage\.getItem\("agapayMetaDemoLeadTracked"\)[\s\S]*sessionStorage\.setItem\("agapayMetaDemoLeadTracked", "1"\)/,
  'Lead must be guarded against refresh or retry double-fires'
);
assert.doesNotMatch(requestDemoPage, /referralAttributionLines/);

assert.doesNotMatch(privacy, /We do not use Google Analytics, Meta Pixel, or comparable advertising tools/);
assert.match(privacy, /solely for its own internal (?:business|referral and campaign|campaign) analysis/);
assert.match(privacy, /AGAPAY does not sell this information/);
assert.match(privacy, /Meta Platforms, Inc\./);
assert.match(
  privacy,
  /AGAPAY does not send names, email addresses, parish names, or form-message contents through the Pixel/
);
assert.match(headers, /script-src[^;]*https:\/\/connect\.facebook\.net/);
assert.match(headers, /connect-src[^;]*https:\/\/www\.facebook\.com/);
assert.match(core, /script-src[^;]*https:\/\/connect\.facebook\.net/);
assert.match(core, /connect-src[^;]*https:\/\/www\.facebook\.com/);

console.log('Meta referral and demo conversion tracking checks passed.');

// Exercise generated classic-script behavior, including the unchanged arguments queue.
const pixelWindow = {};
const insertedScripts = [];
const firstScript = {
  parentNode: {
    insertBefore(script) {
      insertedScripts.push(script);
    },
  },
};
const pixelDocument = {
  createElement() {
    return {};
  },
  getElementsByTagName() {
    return [firstScript];
  },
};
const pixelContext = vm.createContext({ window: pixelWindow, document: pixelDocument });
vm.runInContext(pixel, pixelContext);
vm.runInContext(pixel, pixelContext);
assert.equal(insertedScripts.length, 1, 'Loading the script twice must reuse the existing Pixel');
assert.deepEqual(
  Array.from(pixelWindow.fbq.queue, (args) => Array.from(args)),
  [
    ['init', pixelId],
    ['track', 'PageView'],
  ]
);
assert.equal(pixelWindow.trackMetaEvent('Fixture', { count: 1 }), true);
assert.equal(pixelWindow.fbq.queue.length, 3);
pixelWindow.fbq = () => {
  throw new Error('Unavailable fixture');
};
assert.equal(pixelWindow.trackMetaEvent('Fixture'), false);
assert.equal(pixelWindow.trackMetaStandardEvent('Lead'), false);
