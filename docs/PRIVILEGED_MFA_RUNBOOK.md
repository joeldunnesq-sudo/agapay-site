# Privileged multi-factor authentication

AGAPAY requires multi-factor authentication for platform administrators, legacy parish-dashboard administrators, and named parish staff accounts. A passkey is the preferred method. Standards-based TOTP authenticator codes are available when a passkey cannot be used, and every enrollment issues ten single-use recovery codes.

## Security properties

- Password verification happens before an MFA challenge is issued.
- Passkey registration and authentication require user verification and accept ES256 or RS256 credentials.
- TOTP secrets are encrypted with AES-GCM before D1 storage. The encryption key is a Worker secret and is never stored in the repository.
- Pending MFA tokens are random, salted, hashed, single-use, limited to ten attempts, and expire after five minutes.
- Recovery codes are shown once, stored only as scoped SHA-256 hashes, and removed atomically when used.
- Privileged sessions carry the time of the last successful MFA check. State-changing admin operations require a fresh check from the last fifteen minutes.
- MFA enrollment, authentication, and step-up completion are written to the central audit log.
- Resetting a password invalidates sessions but does not remove MFA enrollment. This prevents a password reset from becoming an MFA bypass.

## Deployment prerequisites

Set a unique, high-entropy encryption secret in every Cloudflare environment before enabling the feature. Do not reuse an application password, Stripe secret, or Turnstile key.

```sh
npx wrangler secret put AGAPAY_MFA_ENCRYPTION_KEY
npx wrangler secret put AGAPAY_MFA_ENCRYPTION_KEY --env staging
```

Then apply `migrations/0106_privileged_mfa.sql` to each D1 database before deploying the Worker. `PRIVILEGED_MFA_REQUIRED` is enabled in both production and staging in `wrangler.toml`.

Recommended release order:

1. Back up D1 and apply migration `0106_privileged_mfa.sql` in staging.
2. Configure `AGAPAY_MFA_ENCRYPTION_KEY` in staging.
3. Deploy staging and enroll a test parish administrator with a passkey and an authenticator app in separate test runs.
4. Verify login, one recovery-code login, and a step-up challenge on a state-changing action.
5. Apply the production migration, configure the production secret, and deploy.

Never rotate `AGAPAY_MFA_ENCRYPTION_KEY` without first re-encrypting every stored TOTP secret. Passkeys and recovery codes do not depend on that key.

## Lost-device recovery

The administrator should first use a saved recovery code, then enroll a replacement method. If all passkeys, the authenticator, and recovery codes are unavailable, there is intentionally no self-service bypass. AGAPAY support must verify the administrator through an out-of-band parish authorization process before resetting the MFA profile directly. Password reset alone is insufficient.

Any support reset must be recorded in the audit log with the operator, parish, reason, verification evidence reference, and affected MFA profile. Issue a fresh password reset after the profile reset, and require immediate MFA re-enrollment at the next sign-in.

## Local verification

```sh
npm run test:mfa
npx wrangler deploy --dry-run
```

The test suite covers the D1 migration, AES-GCM-backed TOTP enrollment, authenticator login, one-time recovery-code consumption, the fifteen-minute step-up window, and client integration on both privileged dashboards.
