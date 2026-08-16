# Test Lubbock critical-flow evidence — 2026-08-16

## Outcome

The product owner completed the remaining admin and parish soft-launch walkthroughs in production using the dedicated Test Lubbock organization. This closes the three manual rows that were still pending in the critical-flow QA matrix:

| Flow | Result | Evidence boundary |
|---|---|---|
| Parish registration → admin review → invitation | PASS-OWNER | Product-owner production walkthrough; sensitive account and inbox evidence retained outside the repository |
| Parish first-time setup → plan/billing → Stripe onboarding | PASS-OWNER | Product-owner production walkthrough with the Test Lubbock account; Stripe identifiers and credentials are not recorded here |
| Admin queue management → status/configuration save | PASS-OWNER | Product-owner production walkthrough confirmed edits persisted without forcing the operator back to the registration list |

The walkthrough also exercised authenticated admin and parish access. The earlier donor signup, verification, login, Checkout creation, payment lifecycle, webhook replay, refund, and dispute exercise remains recorded separately as owner-confirmed on August 1, 2026.

## Findings resolved during the walkthrough

The owner-run exercise identified usability and state-management issues before a real parish was admitted:

- Admin registration edits needed to save without closing the church record and returning the operator to the list.
- Starter-tier setup needed to remain Starter throughout the setup and final approval experience rather than presenting Giving Plus.
- The parish giving URL needed to remain unavailable until its required launch configuration was saved and the treasurer completed the guarded Go-Live process.

Those findings were corrected and deployed to `main`. Relevant implementation history includes the tier-aware setup and Go-Live sequence (`d52408b3`, `1c31bf24`, `f6437ea2`, `8cd34a00`) and the admin in-context save behavior (`eaedb53a`). Subsequent production deployments passed the complete CI test, deployment, route/health smoke, and authenticated accounting smoke workflow.

## Readiness decision

The Test Lubbock walkthrough is valid owner-run evidence for the software flows above. It is not represented as a canonical real parish, a real-parish authority verification, or a substitute for the treasurer controls required on every onboarding.

AGAPAY is approved for controlled onboarding of the first real parish. Each real parish must still remain hidden until canonical verification, verified priest approval of the treasurer, personal invitation acceptance, fresh Stripe readiness, locked configuration review, the eight P1-3 treasurer affirmations, and the treasurer's authenticated Go-Live action are complete. The first real parish receives the standard 24-hour and 72-hour early-life monitoring checks.

