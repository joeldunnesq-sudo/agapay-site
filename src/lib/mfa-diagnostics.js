// Generated from src/lib/mfa-diagnostics.ts by npm run build:server. Do not edit.
class MfaServiceError extends Error {
  constructor(reason) {
    super('Authenticator verification is temporarily unavailable. Please use a passkey or try again later.');
    this.name = 'MfaServiceError';
    this.reason = reason;
  }
}
const SERVICE_REASONS = /* @__PURE__ */ new Set([
  'totp_key_unconfigured',
  'totp_encrypt_failed',
  'totp_decrypt_failed',
  'totp_profile_write_failed',
  'totp_transaction_write_failed',
]);
const EXPECTED_ERRORS = /* @__PURE__ */ new Map([
  ['MFA setup expired. Please sign in again.', 'setup_expired'],
  ['MFA verification expired. Please sign in again.', 'verification_expired'],
  ['This MFA transaction cannot enroll a new method.', 'enrollment_not_allowed'],
  ['Verify an existing MFA method before adding another one.', 'existing_factor_required'],
  ['Unsupported MFA method.', 'unsupported_method'],
  ['That authenticator code is not valid.', 'totp_code_invalid'],
  ['That recovery code is invalid or has already been used.', 'recovery_code_invalid'],
  ['Passkey setup was not started.', 'passkey_setup_missing'],
  ['Passkey verification was not started.', 'passkey_verification_missing'],
  ['The passkey could not be verified.', 'passkey_invalid'],
  ['That passkey is not registered for this account.', 'passkey_not_registered'],
  ['Choose a passkey, authenticator code, or recovery code.', 'method_required'],
  ['Admin session expired during verification.', 'session_expired'],
  ['Parish session expired during verification.', 'session_expired'],
  ['Staff session expired during verification.', 'session_expired'],
  ['Parish dashboard record not found.', 'parish_unavailable'],
]);
function mfaErrorDetails(error) {
  if (error instanceof MfaServiceError && SERVICE_REASONS.has(error.reason)) {
    return { reason: error.reason, status: 503, message: error.message };
  }
  const expected = EXPECTED_ERRORS.get(error?.message);
  if (expected) return { reason: expected, status: 400, message: error.message };
  return {
    reason: 'unexpected_failure',
    status: 500,
    message:
      'Security verification could not be completed. Please try again or contact support with the reference number.',
  };
}
export { MfaServiceError, mfaErrorDetails };
