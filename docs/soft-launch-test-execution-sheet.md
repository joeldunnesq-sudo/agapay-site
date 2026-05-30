# AGAPAY Soft Launch Test Execution Sheet

Date: ____________________  
Tester: ____________________  
Commit SHA: ____________________  
Deploy time: ____________________  
Environment: `production` / `staging` / `local`

## Quick links

- App: `https://agapay.app`
- Donor login: `https://agapay.app/donor/login`
- Parish login: `https://agapay.app/parish/login`
- Admin login: `https://agapay.app/admin/login`
- Companion runbook: `docs/stripe-testmode-e2e-runbook.md`

## Preconditions

- [ ] Latest deploy is live
- [ ] `npm run check` passed
- [ ] `npm run prelaunch` passed
- [ ] Stripe test mode is enabled for this run
- [ ] Test inbox is accessible
- [ ] Admin credentials available

## Test data

- Parish/org name: ________________________________________
- Parish email: ________________________________________
- Donor email: ________________________________________
- Donor password: ________________________________________
- Stripe success card: `4242 4242 4242 4242`
- Stripe decline card: `4000 0000 0000 9995`
- Stripe 3DS card: `4000 0027 6000 3184`

## Execution log

| Flow | Owner | Result | Evidence | Notes |
|---|---|---|---|---|
| Organization registration submitted | ____ | PASS / FAIL | screenshot / email / none | ____ |
| Admin sees registration in queue | ____ | PASS / FAIL | screenshot / none | ____ |
| Admin verifies registration | ____ | PASS / FAIL | screenshot / none | ____ |
| Parish invite email arrives | ____ | PASS / FAIL | screenshot / email | ____ |
| Parish login works | ____ | PASS / FAIL | screenshot / none | ____ |
| Billing step completes | ____ | PASS / FAIL | screenshot / Stripe session | ____ |
| Stripe onboarding completes | ____ | PASS / FAIL | screenshot / Stripe account | ____ |
| Setup state persists after refresh | ____ | PASS / FAIL | screenshot / none | ____ |
| Donor signup works | ____ | PASS / FAIL | screenshot / email | ____ |
| Donor verification email works | ____ | PASS / FAIL | screenshot / email | ____ |
| Donor login works | ____ | PASS / FAIL | screenshot / none | ____ |
| Donation success flow works | ____ | PASS / FAIL | screenshot / Stripe event | ____ |
| Donation decline flow works | ____ | PASS / FAIL | screenshot / Stripe event | ____ |
| Offering history updates correctly | ____ | PASS / FAIL | screenshot / none | ____ |
| Logout/login cycle works for all roles | ____ | PASS / FAIL | screenshot / none | ____ |
| Unauthorized route protection works | ____ | PASS / FAIL | screenshot / none | ____ |
| Webhook replay is idempotent | ____ | PASS / FAIL | Stripe event IDs | ____ |
| Refund/dispute status handling works | ____ | PASS / FAIL | Stripe event IDs | ____ |

## Evidence checklist

- [ ] Admin verification screenshot
- [ ] Parish setup completion screenshot
- [ ] Donor donation success screenshot
- [ ] Donor donation decline screenshot
- [ ] Invite email screenshot
- [ ] Donor verify email screenshot
- [ ] Stripe event IDs captured

## Launch decision

- [ ] No P0 issues found
- [ ] No unresolved payment/auth data issues
- [ ] Monitoring is on
- [ ] Soft launch approved

Approver: ____________________  
Final status: `APPROVED` / `BLOCKED` / `RETEST REQUIRED`
