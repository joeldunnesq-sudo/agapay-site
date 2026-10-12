import { bytesToBase64Url, safeJson, webauthnRpContext } from '../../src/lib/webauthn.js';
import { mfaErrorDetails, MfaServiceError } from '../../src/lib/mfa-diagnostics.js';
void bytesToBase64Url(new Uint8Array([1]));
void mfaErrorDetails(null);
void mfaErrorDetails(new Error('unknown'));
// @ts-expect-error bytes must be iterable numbers
void bytesToBase64Url(['1']);
// @ts-expect-error request must be a Request
void webauthnRpContext({}, {});
// @ts-expect-error categories must be text
void new MfaServiceError(42);
// @ts-expect-error parsed JSON remains unknown until narrowed
void safeJson('{}', {}).credential;
