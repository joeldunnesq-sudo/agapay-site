# AGAPAY Stripe Test-Mode End-to-End Runbook

Last updated: 2026-05-29 (America/Chicago)

This runbook is for soft-launch validation of the full donor/parish/admin lifecycle using Stripe **test mode**.

## 1) Preconditions

- Production deploy is current (`main` clean and deployed).
- Automated checks pass:
  - `npm run check`
  - `npm run prelaunch`
- Stripe test-mode keys are set in Worker secrets:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
- Email provider is configured and working:
  - `RESEND_API_KEY`
  - `AGAPAY_FROM_EMAIL`
  - `AGAPAY_REPLY_TO_EMAIL`
- URL sanity:
  - App: `https://agapay.app`
  - Admin: `https://agapay.app/admin/login`
  - Parish: `https://agapay.app/parish/login`
  - Donor: `https://agapay.app/donor/login`

## 2) Test identities and data

Use unique test values per run:

- Parish org name: `St. QA Softlaunch <YYYYMMDD-HHMM>`
- Parish email: `qa+parish-<timestamp>@example.com`
- Donor email: `qa+donor-<timestamp>@example.com`
- Donor password: use policy-compliant unique password

Stripe test cards:

- Success: `4242 4242 4242 4242`
- Requires auth (3DS): `4000 0027 6000 3184`
- Declined: `4000 0000 0000 9995`
- Any future expiry / any CVC / any ZIP.

## 3) Flow A: Organization registration -> admin review -> parish invite

1. Open `https://agapay.app/register`.
2. Select `Organization`.
3. Choose a church-type organization (mission/parish/cathedral/monastery).
4. Submit all required fields.
5. Verify:
   - API accepts registration.
   - Admin notification email is received.

Admin steps:

6. Open `https://agapay.app/admin/login` and authenticate.
7. Find the new registration in queue/table.
8. Open details and set status to `verified`.
9. Save review.
10. Verify:
    - Registration status updates in admin queue.
    - Parish invite email is sent with parish login path.

Pass criteria:

- Registration is persisted and visible in admin.
- Verified save is successful.
- Parish invite email arrives with working link.

## 4) Flow B: Parish first-time setup -> subscription -> Stripe Connect onboarding

1. Open invite link or `https://agapay.app/parish/login`.
2. Authenticate as parish test user.
3. In first-time setup card:
   - Step 1 (contact verified) is checked.
   - Choose a subscription tier (step 2).
   - Launch subscription checkout and complete with test card `4242...`.
4. Return to parish dashboard.
5. Verify step 2 is checked after refresh.
6. Launch Stripe onboarding (step 3) and complete onboarding flow.
7. Return and refresh Stripe status.
8. Verify:
   - Step 3 checks complete.
   - Stripe status is no longer `not_started`/`restricted`.
   - First-time setup card disappears when all steps complete (if expected UX).

Pass criteria:

- Billing status persists after refresh.
- Stripe connection status persists after refresh.
- Setup progression accurately reflects state.

## 5) Flow C: Donor signup -> verify -> login -> donation checkout

1. Open `https://agapay.app/donor/signup`.
2. Create donor account with unique test email.
3. Verify donor email and follow link.
4. Log in at `https://agapay.app/donor/login`.
5. Initiate donation from donor flow or giving flow.
6. Complete checkout using:
   - Success card (`4242...`) once.
   - Decline card (`4000...9995`) once.
7. Verify:
   - Success path shows completed/paid state.
   - Decline path shows failed/canceled state with safe messaging.
   - Offering history reflects correct status and amount.

Pass criteria:

- Signup + verify + login all succeed.
- Donation success/decline statuses are correct and persistent.

## 6) Flow D: Webhook lifecycle + idempotency

Run this in Stripe test mode after at least one successful payment/subscription:

1. Trigger webhook retries/replays for the same event (Stripe dashboard or CLI).
2. Verify duplicate events do **not** produce duplicate writes/status corruption.
3. Trigger related lifecycle events:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `invoice.payment_succeeded` / `invoice.payment_failed`
   - `charge.refunded`
   - `charge.dispute.created` / `charge.dispute.closed`

Validation targets:

- `stripe_events` tracking shows idempotent handling.
- Donation/subscription states are updated once and correctly.
- No repeated side effects (duplicate emails, duplicate rows, double status flips).

Pass criteria:

- Replayed event IDs are safely ignored or treated idempotently.
- Refund/dispute transitions are reflected accurately.

## 7) Cross-role session/security checks

1. Donor logout/login cycle works.
2. Parish logout/login cycle works.
3. Admin logout/login cycle works.
4. Unauthorized access checks:
   - Access protected donor/parish/admin routes without session.
   - Verify redirect or unauthorized response is correct.

Pass criteria:

- Role isolation is correct.
- Session invalidation works.

## 8) Evidence capture template

For each run, capture:

- Date/time + tester name
- Commit SHA + deploy timestamp
- Stripe event IDs tested
- Screenshots:
  - Admin verified state
  - Parish setup steps completion
  - Donor donation success + decline
- Email screenshots (invite, verify, receipt/notifications)
- Result summary: `PASS` / `FAIL` with issue links

## 9) Exit gate for soft launch

Soft launch readiness for payments/auth flows requires:

- All flows A-D pass with evidence.
- No P0/P1 defects open in donor/parish/admin payment/auth workflows.
- Monitoring active for webhook failures and auth spikes.
