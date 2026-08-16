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
| Parish registration -> admin review -> invite | Org onboarding | Production owner walkthrough | PASS-OWNER | Test Lubbock owner-run exercise completed 2026-08-16; `/docs/reports/test-lubbock-critical-flow-evidence-2026-08-16.md` |
| Parish first-time setup -> billing -> Stripe onboarding | Parish ops | Production owner walkthrough + Stripe | PASS-OWNER | Test Lubbock owner-run exercise completed 2026-08-16; `/docs/reports/test-lubbock-critical-flow-evidence-2026-08-16.md` |
| Admin queue management and status save | Admin ops | Production owner walkthrough | PASS-OWNER | Test Lubbock owner-run exercise completed 2026-08-16; `/docs/reports/test-lubbock-critical-flow-evidence-2026-08-16.md` |
| Refund/dispute lifecycle | Payments | Manual + webhook event replay | PASS-OWNER | Included in the owner-confirmed Stripe test-mode exercise on 2026-08-01 |
| Email deliverability and branding validation | Donor/parish/admin emails | Production Resend + Gmail inbox/render + controlled bounce | PASS-OWNER | `/docs/reports/email-monitoring-evidence-2026-08-16.md` |

## What this gives us now

We already have a reliable automated quality gate plus production route-level smoke coverage.

Real email deliverability, inbox rendering, bounce-alert handling, and the remaining Test Lubbock admin/parish walkthroughs are now owner-validated in production. Together with the earlier donor and Stripe lifecycle exercise, the critical software-flow QA gate is closed for controlled onboarding of the first real parish.

This approval does not bypass the per-parish safeguards in `docs/parish-onboarding-go-live-sop.md`. A real parish remains hidden until canonical and representative verification, personal access acceptance, live Stripe readiness, locked configuration review, and authenticated treasurer Go-Live signoff are complete.

