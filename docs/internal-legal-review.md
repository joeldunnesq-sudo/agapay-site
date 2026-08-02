# AGAPAY — Internal Legal Review Tracker (not for public distribution)

This file exists so `[LEGAL REVIEW]` flags have one internal home instead of appearing on customer-facing pages. Nothing here is legal advice; it's a checklist for AGAPAY's attorney/CPA.

## Open items

1. **Marketplace-facilitator classification (Parish+ commerce).** `public/terms.html` Section 8 states the parish is seller/merchant of record and describes the direct-charge architecture, but does not and should not claim this conclusively resolves marketplace-facilitator status under any specific state's law. Needs attorney sign-off per state where AGAPAY has active parishes, particularly states with broad marketplace-facilitator statutes that look past fee/charge-ownership to control over listing/checkout/customer interaction.
2. **No-statewide-general-sales-tax states (AK, DE, MT, NH, OR).** `public/terms.html` Section 9 and the registration UI state that lacking a statewide general sales tax isn't equivalent to tax-exempt status. This is believed correct as a general matter but has not been reviewed by a tax adviser state-by-state (e.g. Alaska local-tax nuances, Delaware gross-receipts tax scope).
3. **Exact contracting entity and legal-notice address — launch blocker.** The public Terms identify the contracting party as "AGAPAY," but the repository does not establish the full legal entity name or a physical/legal-notice address. Counsel must insert the exact entity and confirm a valid service-of-process address before broad commercial onboarding.
4. **Arbitration clause sign-off — launch blocker.** The August 1, 2026 Terms now distinguish AAA Consumer and Commercial Rules, preserve small-claims and regulatory rights, allocate fees under the applicable rules, and provide a 30-day opt-out. Counsel must approve the clause, class waiver, venue, opt-out operations, and onboarding presentation before reliance on it.
5. **Subscription/auto-renew operations.** Confirm every paid checkout clearly presents price, interval, renewal, cancellation timing, taxes, and refund treatment before billing information; confirm cancellation remains available through the account or Stripe portal. This supports ROSCA and differing state automatic-renewal requirements.
6. **Copyright/DMCA process.** Koinonia and other tools store user-directed content. If AGAPAY intends to rely on 17 U.S.C. § 512 safe harbors, register and maintain a designated DMCA agent with the Copyright Office and publish the registered agent details. The Terms intentionally do not claim registration already exists.
7. **Final Stripe product tax codes.** `src/lib/tax-codes.js` `SUBSCRIPTION_TAX_CODES` are intentionally blank. Needs CPA/tax-adviser-approved values for Giving, Parish+, Learn, and Stewardship before `SUBSCRIPTION_TAX_CODES_ENABLED` is turned on.
8. **Retroactive tax adjustments.** Approving an exemption does not retroactively adjust already-finalized/paid invoices (Stripe's own behavior, not something AGAPAY code overrides). Whether AGAPAY should ever manually refund previously-charged tax after a late approval is a policy/legal question, not resolved by this code.

## Resolved product-language items

- **Donation application fee conflict (resolved July 2026).** Current checkout code and release gates prohibit AGAPAY application fees on donations. Historical reconciliation fields remain only to read old Stripe records. The Terms correctly state that AGAPAY does not charge a percentage fee on donations.

## Where NOT to put these flags
Per policy, `[LEGAL REVIEW]` labels must never appear as visible text on customer-facing pages (`public/*.html`). Keep them here, in code comments, or in `docs/reports/`.
