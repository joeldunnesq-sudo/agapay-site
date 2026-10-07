import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const elements = new Map(['qrCode', 'givingUrlInput'].map((id) => [id, { innerHTML: '', value: '' }]));
const downloads = [],
  statuses = [],
  copied = [],
  revoked = [],
  canvases = [];
let url = '',
  logoFailure = true,
  logoRequests = 0,
  imageFailure = false,
  blobFailure = false;
const context = vm.createContext({
  document: {
    getElementById: (id) => elements.get(id) || null,
    createElement: () => {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({ fillRect() {}, drawImage() {} }),
        toBlob: (fn) => fn(blobFailure ? null : new Blob(['png'], { type: 'image/png' })),
      };
      canvases.push(canvas);
      return canvas;
    },
  },
  currentParish: null,
  dedicatedGivingUrl: () => url,
  dedicatedGivingEmbedUrl: () => (url ? url + '?embed=1&preview=parish' : ''),
  escapeHtml: (v) => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
  window: { location: { origin: 'https://example.test' } },
  navigator: { clipboard: { writeText: async (v) => copied.push(v) } },
  setStatus: (...args) => statuses.push(args),
  downloadBlob: (name, blob) => downloads.push({ name, blob }),
  Blob,
  URL: { createObjectURL: () => 'blob:test', revokeObjectURL: (v) => revoked.push(v) },
  fetch: async () => {
    logoRequests++;
    if (logoFailure) throw Error('offline');
    return { blob: async () => new Blob(['logo']) };
  },
  FileReader: class {
    readAsDataURL() {
      this.result = 'data:image/png;base64,bG9nbw==';
      this.onload();
    }
  },
  Image: class {
    set src(v) {
      assert.equal(v, 'blob:test');
      if (imageFailure) this.onerror();
      else this.onload();
    }
  },
  qrcode: (version, correction) => {
    assert.equal(version, 0);
    assert.equal(correction, 'H');
    return {
      addData: (v) => assert.equal(v, url),
      make() {},
      createSvgTag: () =>
        '<svg width="100" height="100" preserveAspectRatio="xMinYMin meet" viewBox="0 0 100 100"><path fill="#000000" /></svg>',
    };
  },
});
vm.runInContext(readFileSync(new URL('../public/parish/features/giving/sharing.js', import.meta.url), 'utf8'), context);
await context.copyGivingLink();
await context.copyGivingEmbedCode();
await context.downloadBulletinSvg();
await context.downloadBulletinPng();
await context.downloadQrSvg();
assert.equal(downloads.length, 0);
assert.equal(copied.length, 0);
assert.match(elements.get('qrCode').innerHTML, /Load dashboard/);
context.currentParish = { parishId: 'test', parishName: 'Saint <Test> & Friends' };
url = 'https://example.test/give/test';
await context.copyGivingLink();
await context.copyGivingEmbedCode();
assert.equal(copied[0], url);
assert.match(copied[1], /embed=1&amp;preview=parish/);
assert.match(copied[1], /rel="noopener"/);
await context.downloadQrSvg();
assert.match(statuses.at(-1)[0], /logo could not/);
assert.equal(downloads.at(-1).name, 'test-giving-qr.svg');
assert.doesNotMatch(await downloads.at(-1).blob.text(), /<image /);
logoFailure = false;
await context.downloadQrSvg();
assert.equal(logoRequests, 2);
assert.match(await downloads.at(-1).blob.text(), /data:image\/png;base64/);
assert.match(await downloads.at(-1).blob.text(), /xmlns=/);
assert.equal(elements.get('givingUrlInput').value, url);
await context.downloadQrPng();
assert.equal(downloads.at(-1).name, 'test-giving-qr.png');
assert.equal(canvases.at(-1).width, 1200);
assert.equal(canvases.at(-1).height, 1200);
await context.downloadBulletinSvg();
const bulletin = await downloads.at(-1).blob.text();
assert.match(bulletin, /Saint &lt;Test> &amp; Friends/);
assert.equal((bulletin.match(/preserveAspectRatio=/g) || []).length, 2);
assert.match(bulletin, /<svg x="289" y="94" width="96" height="96"/);
await context.downloadBulletinPng();
assert.equal(downloads.at(-1).name, 'test-bulletin-insert.png');
assert.equal(canvases.at(-1).width, 1680);
assert.equal(canvases.at(-1).height, 1120);
assert.equal(logoRequests, 2);
const count = downloads.length;
blobFailure = true;
await context.downloadQrPng();
await context.downloadBulletinPng();
assert.equal(downloads.length, count);
assert.match(statuses.at(-1)[0], /Unable to create PNG/);
imageFailure = true;
await context.downloadQrPng();
assert.match(statuses.at(-1)[0], /Unable to render QR/);
await context.downloadBulletinPng();
assert.match(statuses.at(-1)[0], /Unable to render bulletin/);
assert.equal(revoked.length, 6);
assert.match(context.positionBulletinQr('', 10, 20, 30), /QR code/);
assert.equal(context.positionBulletinQr('invalid', 10, 20, 30), 'invalid');
context.qrcode = undefined;
await context.renderQrCode();
assert.match(elements.get('qrCode').innerHTML, /Load dashboard/);
console.log(
  'PASS - giving sharing: copy, escaping, missing state, logo retry/cache, QR/bulletin downloads, rasterization failures and URL cleanup'
);
