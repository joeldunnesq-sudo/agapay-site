# AGAPAY Soft Launch Checklist

This is the launch gate for the first production soft launch.

Companion execution guide:

- `docs/stripe-testmode-e2e-runbook.md`

## 1) Release preflight (must pass)

- [ ] Run `npm run check`
- [ ] Run `npm run prelaunch`
- [ ] (Optional production smoke) `AGAPAY_BASE_URL=https://agapay.app npm run prelaunch`
- [ ] Confirm `main` branch is clean after checks

## 2) Critical journey QA (must pass)

- [ ] Donor signup -> email verify -> login -> donation checkout start
- [ ] Parish registration -> admin review -> dashboard invite email
- [ ] Parish first-time setup -> billing -> Stripe onboarding
- [ ] Admin login -> registration queue -> status update save
- [ ] Donor, parish, and admin logout/login cycle

## 3) Payments and webhook lifecycle (must pass)

- [ ] Donation success updates offering status correctly
- [ ] Donation failed/canceled updates status correctly
- [ ] Subscription checkout completion updates billing state
- [ ] Webhook retry/idempotency does not duplicate writes
- [ ] Refund/dispute events update status safely

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

- [ ] Cloudflare error-rate alert configured
- [ ] Stripe webhook error alert configured
- [ ] Email send failure alert configured
- [ ] Owner/on-call contact listed for launch week

## 7) Content, UX, and accessibility

- [ ] AGAPAY branding casing verified site-wide
- [ ] Mobile nav works across public pages
- [ ] No horizontal overflow on key mobile pages
- [ ] Keyboard navigation and focus states verified on major forms
- [ ] Footer/nav links all resolve as expected

## 8) Soft launch readiness decision

Soft launch is approved only when:

- [ ] All section 1 checks pass
- [ ] All section 2 and 3 flows pass
- [ ] No open P0 bugs
- [ ] Named owner confirms monitoring and support coverage
