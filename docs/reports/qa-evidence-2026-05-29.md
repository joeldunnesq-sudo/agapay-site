# AGAPAY QA Evidence Report

Date: 2026-05-29  
Timezone: America/Chicago

## Local automated checks

1. Worker syntax check
   - Command: `node --check src/worker.js`
   - Result: PASS

2. Platform checks
   - Command: `node scripts/check.mjs`
   - Result: PASS
   - Output: `AGAPAY platform checks passed.`

3. Worker hardening tests
   - Command: `node scripts/worker-hardening-tests.mjs`
   - Result: PASS
   - Output: `AGAPAY Worker hardening tests passed.`

4. Prelaunch checks
   - Command: `node scripts/prelaunch-checks.mjs`
   - Result: PASS
   - Output: `AGAPAY prelaunch checks passed.`

## Production smoke checks

All commands used `Invoke-WebRequest ... -UseBasicParsing | Select-Object StatusCode` unless noted.

| URL | Status |
|---|---|
| `https://agapay.app/` | `200` |
| `https://agapay.app/giving` | `200` |
| `https://agapay.app/marketplace` | `200` |
| `https://agapay.app/directory` | `200` |
| `https://agapay.app/donor/login` | `200` |
| `https://agapay.app/parish/login` | `200` |
| `https://agapay.app/admin/login` | `200` |

Security config endpoint:

- URL: `https://agapay.app/api/security/config`
- Status: `200`
- Body: `{"turnstileEnabled":false,"turnstileSiteKey":""}`

## Notes

- Turnstile is currently disabled in production config.
- Manual live-path checks still required for Stripe completion, full role-based walkthroughs, and inbox deliverability confirmation.
