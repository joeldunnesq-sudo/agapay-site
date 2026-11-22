import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/scripts/privileged-mfa.js', import.meta.url), 'utf8');
const encoder = readFileSync(new URL('../public/vendor/qrcode.js', import.meta.url), 'utf8');
const uri =
  'otpauth://totp/AGAPAY%3Achurch%40example.org?secret=JBSWY3DPEHPK3PXP&issuer=AGAPAY&algorithm=SHA1&digits=6&period=30';

for (const failLoad of [false, true]) {
  const elements = new Map();
  let markup = '';
  let encoded;
  const context = vm.createContext({
    window: { fetch: async () => ({ ok: true, json: async () => ({ secret: 'JBSWY3DPEHPK3PXP', otpauthUri: uri }) }) },
    navigator: {},
    document: {
      getElementById: (id) => {
        if (!elements.has(id)) elements.set(id, { nextElementSibling: {}, removeAttribute() {} });
        return elements.get(id);
      },
      createElement: () => ({ remove() {} }),
      head: {
        appendChild: (script) => {
          assert.equal(script.src, '/vendor/qrcode.js?v=1.4.4');
          if (failLoad) script.onerror();
          else {
            vm.runInContext(encoder, context);
            context.window.qrcode = (...args) => {
              const qr = context.qrcode(...args);
              const addData = qr.addData;
              qr.addData = (data, mode) => {
                encoded = data;
                addData(data, mode);
              };
              return qr;
            };
            script.onload();
          }
        },
      },
    },
  });
  vm.runInContext(
    source.replace(
      '  window.AgapayMfa = {',
      `
    setBody = html => { captured(html); };
    activeFlow = { pendingToken: 'test-token' };
    window.testEnrollment = beginTotpEnrollment;
    window.AgapayMfa = {`
    ),
    Object.assign(context, {
      captured: (html) => {
        markup = html;
      },
    })
  );
  await context.window.testEnrollment();
  assert.match(markup, /scan this QR code/);
  assert.match(markup, /<details/);
  assert.equal(typeof elements.get('agapayMfaCodeForm').onsubmit, 'function');
  const target = elements.get('agapayMfaQr');
  if (failLoad) {
    assert.match(target.textContent, /QR code unavailable/);
    assert.equal(target.nextElementSibling.open, true);
  } else {
    assert.equal(encoded, uri);
    assert.match(target.innerHTML, /<svg/);
    assert.match(target.innerHTML, /viewBox=/);
  }
}
console.log('MFA QR enrollment and fallback tests passed.');
