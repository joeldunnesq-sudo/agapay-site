# First three churches: onboarding readiness

Reviewed September 30, 2026 against main `566c3ac8`, with the fixes in
`codex/first-church-readiness`. These fixes were merged to main as `60b55bf8`
and deployed successfully on September 30.

## Assessment

The reviewed onboarding paths pass the automated checks below. The public
registration form was walked through to its final review screen on agapay.app
using clearly marked synthetic details, without submission. The public parish
login also loaded correctly. No real registration, invitation, payment, bank
connection, or public launch was created during this review.

This supports a supervised first onboarding. It does not establish delivery to
a church's mailbox or that Stripe has approved that church's payout account.
The owner confirms prior successful Stripe and Resend tests. Complete the
per-church checks before public launch.

## Launch follow-up

- The [onboarding release](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/36741924604)
  passed Quality, Test, deployment, and public post-deploy health checks.
- Authenticated accounting smoke was **skipped**, because its two-parish fixture
  credentials are not configured in GitHub Actions. Configure dedicated test
  fixtures and run this gate before relying on unattended accounting releases.
  A green workflow currently does not establish authenticated accounting coverage.
- The latest [recovery drill](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/33517852415)
  passed on September 1. The workflow restores a stored platform D1 backup into
  a disposable database and checks schema and row counts; it runs monthly.
  This is separate from parish self-service recovery.
- Self-service Restore remains unfinished and undeployed. Do not present it as
  available for the first churches.

## Fixes

- The onboarding email and plan-selection guidance now explain the no-card
  30-day demo instead of telling a new church to pay before connecting Stripe.
- A Parish plan missing its general-fund accounting link now offers **Open
  Accounting setup**, with instructions to return and save the giving review.
  The existing accounting-mapping gate is still enforced. Browser coverage
  verifies that this button opens the actual accounting activation screen.
- The SOP's opening instructions now match the intended shared parish access
  for initial setup and the separate individual-access flow after payment.

## Evidence

Passed: onboarding workflow and hardening; ten onboarding browser scenarios;
registration security; privileged MFA; accounting activation access, trial access,
and provisioning; notification regression; launch controls; pricing bands;
prelaunch, architecture, asset-version, and quality checks. Quality retains only
the existing warning baseline.

The added three-church rehearsal uses one synthetic store, separate parish
credentials and Stripe identities, and Give, Give+, and Parish trials. Each launch
affects only its own church. Another church's credentials are rejected. Missing
payout readiness prevents launch; refreshing and reviewing the corrected state
allows it. Accounting provisioning is tested separately; the Parish launch
fixture represents its reviewed fund mapping, not a real cloud provisioning run.

Production evidence checked:

- [September 30 monitor](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/36692804364): health, dashboard, public giving, authenticated bindings/scheduler check, and backup freshness passed at approximately 08:56 UTC.
- [September 30 backup](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/36726157837): completed successfully after the monitor, starting at 14:03 UTC.

## Repeat for each church

1. Record its registration reference, selected plan, verified priest and
   treasurer contacts, and AGAPAY onboarding owner. Confirm receipt of the
   welcome/setup email with the intended recipient.
2. Complete canonical review and representative authorization. Keep giving
   hidden. The parish replaces its temporary password and completes MFA when
   prompted; never record passwords or one-use links in the tracking notes.
3. Confirm the chosen plan and household band, where applicable. Start the
   eligible free demo and review its end date; no card is required for the demo.
4. Have the treasurer complete Stripe's organization and payout-bank details.
   Return to AGAPAY and check Stripe status. Both charges and payouts must be
   enabled, with no outstanding requirements.
5. If Accounting is included, finish books setup and its separate named-staff
   access/PIN. Return to giving setup, review funds and recurring-gift settings,
   save, and record whether donor or pledge import help is needed.
6. The authorized treasurer reviews the current configuration, completes all
   eight affirmations, and selects Go Live. AGAPAY staff must not attest on the
   treasurer's behalf.
7. Open the giving link signed out and scan the QR code on a phone. Confirm the
   correct parish and giving destinations. If a real donation/receipt test is
   desired, have the authorized donor perform it and confirm the result and
   receipt before sharing the page widely.

Do not promise self-service Restore during this onboarding: the separate recovery
feature remains an undeployed local change. Existing download backups and platform
backup monitoring are separate from that feature.
