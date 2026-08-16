# AGAPAY Soft Launch Checklist

This is the launch gate for the first production soft launch.

Companion execution guide:

- `docs/stripe-testmode-e2e-runbook.md`
- `docs/soft-launch-test-execution-sheet.md`
- `docs/reports/test-lubbock-critical-flow-evidence-2026-08-16.md`

Current decision: **approved for controlled onboarding of the first real parish**. This checklist records software readiness; every real parish must still satisfy the identity, Stripe, treasurer-signoff, publication, and early-life monitoring controls in `docs/parish-onboarding-go-live-sop.md`.

## 1) Release preflight (must pass)

- [x] Run `npm run check`
- [x] Run `npm run prelaunch`
- [x] Production smoke: `AGAPAY_BASE_URL=https://agapay.app npm run prelaunch`
- [x] Confirm `main` branch is clean after checks

Latest confirmation: GitHub Actions run `31978438201` passed the complete check, Cloudflare deployment, production route/health smoke, and authenticated accounting smoke on 2026-08-16 for production commit `b079b9efaba86361325f240fc864b01cf53887b0`.

## 2) Critical journey QA (must pass)

- [x] Donor signup -> email verify -> login -> donation checkout start
- [x] Parish registration -> admin review -> dashboard invite email
- [x] Parish first-time setup -> billing -> Stripe onboarding
- [x] Admin login -> registration queue -> status update save
- [x] Donor, parish, and admin authenticated session cycle exercised across the owner-run flows

Owner evidence: the donor/Stripe exercise was confirmed on 2026-08-01; the remaining Test Lubbock admin and parish flows were confirmed on 2026-08-16. Sensitive account, inbox, and provider evidence remains outside the public repository.

## 3) Payments and webhook lifecycle (must pass)

Owner-confirmed completed with Stripe test-mode keys on August 1, 2026. Detailed event IDs or screenshots should remain with the private launch evidence rather than this public repository.

- [x] Donation success updates offering status correctly
- [x] Donation failed/canceled updates status correctly
- [x] Subscription checkout completion updates billing state
- [x] Webhook retry/idempotency does not duplicate writes
- [x] Refund/dispute events update status safely

## 4) Security and abuse controls

- [ ] Turnstile enabled in production env
- [ ] Rate limiting active on auth and payment routes
- [ ] Admin token/password rotation path tested
- [ ] Parish password reset path tested
- [ ] Donor password reset path tested

## 5) Data durability

- [ ] D1 database backup/export scheduled
- [ ] KV fallback behavior verified for any legacy records
- [ ] Index rebuild endpoint works with admin auth
- [ ] Runbook for rollback documented and accessible

## 6) Observability and incident response

- [x] Cloudflare logs and application-level scheduled-job failure alerts enabled; this account does not offer a native Worker/Cron error notification type
- [x] Stripe webhook delivery and processing-failure monitoring verified
- [x] Resend bounce, delay, failure, and complaint alerts verified with a controlled production bounce
- [x] Owner/on-call recipient configured for launch week

See `docs/MONITORING_CHECKLIST.md` and `docs/reports/email-monitoring-evidence-2026-08-16.md` for the evidence boundary and launch-week routine.

## 7) Content, UX, and accessibility

- [ ] AGAPAY branding casing verified site-wide
- [ ] Mobile nav works across public pages
- [ ] No horizontal overflow on key mobile pages
- [ ] Keyboard navigation and focus states verified on major forms
- [ ] Footer/nav links all resolve as expected

## 8) Soft launch readiness decision

Soft launch is approved only when:

- [x] All section 1 checks pass
- [x] All section 2 and 3 flows pass
- [x] No open P0 bugs
- [x] Named owner confirms monitoring and support coverage

Decision recorded 2026-08-16: **APPROVED — controlled first-parish onboarding**. Broad unattended rollout remains an operational scaling decision after the first real parish completes its 24-hour and 72-hour monitoring checks; it is not part of this approval.
