import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  bytesToBase64Url,
  base64UrlToBytes,
  safeJson,
  webauthnRpContext,
  opaqueWebauthnUserId,
} from '../src/lib/webauthn.js';
import { MfaServiceError, mfaErrorDetails } from '../src/lib/mfa-diagnostics.js';
for (const bytes of [
  new Uint8Array(),
  Uint8Array.from({ length: 256 }, (_, i) => i),
  new Uint8Array([255, 254, 253, 0]),
]) {
  const encoded = bytesToBase64Url(bytes);
  assert.match(encoded, /^[A-Za-z0-9_-]*$/);
  assert.deepEqual(base64UrlToBytes(encoded), bytes);
  assert.equal(encoded, Buffer.from(bytes).toString('base64url'));
}
assert.throws(() => base64UrlToBytes('%%%'));
assert.deepEqual(base64UrlToBytes(null), new Uint8Array());
const fallback = { fallback: true };
for (const value of ['null', 'invalid', '', undefined]) assert.equal(safeJson(value, fallback), fallback);
assert.equal(safeJson('false', fallback), false);
assert.equal(safeJson('0', fallback), 0);
assert.deepEqual(safeJson('[1]', fallback), [1]);
assert.deepEqual(
  webauthnRpContext(new Request('http://localhost:8787/path'), { AGAPAY_APP_URL: 'https://agapay.app/path' }),
  { origin: 'http://localhost:8787', rpID: 'localhost' }
);
assert.deepEqual(webauthnRpContext(new Request('http://127.0.0.1:3000'), {}), {
  origin: 'http://127.0.0.1:3000',
  rpID: '127.0.0.1',
});
assert.deepEqual(
  webauthnRpContext(new Request('https://staging.example/path'), { AGAPAY_APP_URL: ' https://agapay.app/path ' }),
  { origin: 'https://agapay.app', rpID: 'agapay.app' }
);
assert.deepEqual(webauthnRpContext(new Request('https://staging.example/path'), null), {
  origin: 'https://staging.example',
  rpID: 'staging.example',
});
assert.throws(() => webauthnRpContext(new Request('https://example.test'), { AGAPAY_APP_URL: 'invalid' }));
assert.deepEqual(
  await opaqueWebauthnUserId('staff', 'a'),
  new Uint8Array(createHash('sha256').update('staff:a').digest())
);
assert.notDeepEqual(await opaqueWebauthnUserId('staff', 'a'), await opaqueWebauthnUserId('donor', 'a'));
assert.deepEqual(await opaqueWebauthnUserId(null, null), await opaqueWebauthnUserId('agapay', ''));
for (const reason of [
  'totp_key_unconfigured',
  'totp_encrypt_failed',
  'totp_decrypt_failed',
  'totp_profile_write_failed',
  'totp_transaction_write_failed',
]) {
  const result = mfaErrorDetails(new MfaServiceError(reason));
  assert.equal(result.status, 503);
  assert.equal(result.reason, reason);
}
for (const error of [
  null,
  undefined,
  42,
  'raw secret',
  new Error('raw secret'),
  { message: 'raw secret' },
  new MfaServiceError('raw secret'),
]) {
  const result = mfaErrorDetails(error);
  assert.equal(result.status, 500);
  assert.equal(result.reason, 'unexpected_failure');
  assert.ok(!result.message.includes('raw secret'));
}
assert.equal(mfaErrorDetails(new Error('That authenticator code is not valid.')).reason, 'totp_code_invalid');
assert.equal(mfaErrorDetails({ message: 'Admin session expired during verification.' }).status, 400);
console.log('PASS - WebAuthn encoding, RP context, opaque IDs, JSON fallback and safe MFA classification');
