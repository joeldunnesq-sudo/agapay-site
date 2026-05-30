# AGAPAY Soft Launch Incident Runbook

## Severity levels

- **SEV-1**: payments broken, auth broken for all users, data integrity risk
- **SEV-2**: one major workflow degraded (e.g., donor signup, parish setup)
- **SEV-3**: non-critical UI or content issues

## First 10 minutes

1. Confirm issue with a reproducible request path.
2. Identify blast radius (donor / parish / admin / all).
3. Check recent deploy commit and timestamp.
4. Decide: hotfix forward or rollback.

## Quick diagnostics

- Public routes: `/`, `/giving`, `/marketplace`, `/directory`, `/vision`, `/register`
- Auth routes: `/api/donor/login`, `/api/parish/login`, `/api/admin/registrations`
- Payment routes: `/api/create-checkout-session`, `/api/stripe/webhook`
- Security route: `/api/security/config`

## Hotfix path

1. Create fix commit from `main`.
2. Re-run:
   - `npm run check`
   - `npm run prelaunch`
3. Push and verify production endpoints.

## Rollback path

1. Identify last known good commit.
2. Revert bad commit(s) on `main`.
3. Push revert commit.
4. Verify core endpoints and payment flow recovery.

## Data integrity checks after incident

- Confirm no duplicate webhook side-effects.
- Validate donation/subscription statuses for affected period.
- Validate D1 + KV consistency for touched records.

## Communication template

- **Status:** Investigating / Mitigated / Resolved
- **Impact:** which users/flows affected
- **Start time:** UTC + local
- **Current action:** rollback or hotfix
- **Next update:** time window

## Exit criteria

- Core user flows pass smoke checks.
- Error rate back to baseline.
- Post-incident note captured with root cause + prevention actions.

