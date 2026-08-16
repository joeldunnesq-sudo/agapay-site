# AGAPAY Critical Flow QA Matrix

Last updated: 2026-08-16 (America/Chicago)

## Legend

- `PASS`: completed and validated
- `PASS-OWNER`: completed in an owner-run external-system exercise; sensitive evidence is retained outside the public repository
- `PENDING-MANUAL`: requires live manual validation (or production credentials)
- `BLOCKED`: cannot validate until prerequisite is complete

## Core platform flows

| Flow | Scope | Validation method | Status | Evidence |
|---|---|---|---|---|
| Public page routing and rendering | Home, Giving, Marketplace, Directory, Vision | Production HTTP smoke | PASS | `/docs/reports/qa-evidence-2026-05-29.md` |
| Security config endpoint | `/api/security/config` | Production HTTP smoke | PASS | `/docs/reports/qa-evidence-2026-05-29.md` |
| Donor/Parish/Admin login page availability | `/donor/login`, `/parish/login`, `/admin/login` | Production HTTP smoke | PASS | `/docs/reports/qa-evidence-2026-05-29.md` |
| Worker syntax and integrity assertions | Worker + static checks | `node --check`, `scripts/check.mjs` | PASS | `/docs/reports/qa-evidence-2026-05-29.md` |
| Auth/rate-limit/password/webhook hardening | API logic | `scripts/worker-hardening-tests.mjs` | PASS | `/docs/reports/qa-evidence-2026-05-29.md` |
| Prelaunch static/runtime readiness checks | Launch guardrail | `scripts/prelaunch-checks.mjs` | PASS | `/docs/reports/qa-evidence-2026-05-29.md` |
| Donor signup -> verify email -> login -> checkout creation | Donor journey | Manual + Stripe test mode | PASS-OWNER | Owner confirmed the Stripe test-key exercise completed on 2026-08-01; private evidence not linked here |
| Parish registration -> admin review -> invite | Org onboarding | Manual | PENDING-MANUAL | Needs real registration + admin decision path |
| Parish first-time setup -> billing -> Stripe onboarding | Parish ops | Manual + Stripe | PENDING-MANUAL | Needs live Stripe onboarding completion |
| Admin queue management and status save | Admin ops | Manual | PENDING-MANUAL | Needs credentials and UI walkthrough |
| Refund/dispute lifecycle | Payments | Manual + webhook event replay | PASS-OWNER | Included in the owner-confirmed Stripe test-mode exercise on 2026-08-01 |
| Email deliverability and branding validation | Donor/parish/admin emails | Production Resend + Gmail inbox/render + controlled bounce | PASS-OWNER | `/docs/reports/email-monitoring-evidence-2026-08-16.md` |

## What this gives us now

We already have a reliable automated quality gate plus production route-level smoke coverage.

Real email deliverability, inbox rendering, and bounce-alert handling are now owner-validated in production. The remaining soft-launch QA is the human-driven admin, parish, and donor role walkthroughs listed above.

