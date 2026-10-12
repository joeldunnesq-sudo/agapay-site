// Only fixed categories reach logs. Never log raw MFA errors, request bodies,
// tokens, setup keys, ciphertext, codes, or credential responses.
export class MfaServiceError extends Error {
  declare reason: string;
  constructor(reason: string) {
    super('Authenticator verification is temporarily unavailable. Please use a passkey or try again later.');
    this.name = 'MfaServiceError';
    this.reason = reason;
  }
}

const SERVICE_REASONS = new Set([
  'totp_key_unconfigured',
  'totp_encrypt_failed',
  'totp_decrypt_failed',
  'totp_profile_write_failed',
  'totp_transaction_write_failed',
]);

const EXPECTED_ERRORS = new Map<string | undefined, string>([
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

export function mfaErrorDetails(error: unknown) {
  if (error instanceof MfaServiceError && SERVICE_REASONS.has(error.reason)) {
    return { reason: error.reason, status: 503, message: error.message };
  }
  const expected = EXPECTED_ERRORS.get((error as { message?: string } | null | undefined)?.message);
  if (expected) return { reason: expected, status: 400, message: (error as { message: string }).message };
  return {
    reason: 'unexpected_failure',
    status: 500,
    message:
      'Security verification could not be completed. Please try again or contact support with the reference number.',
  };
}
