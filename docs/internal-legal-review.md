# AGAPAY — Internal Legal Review Tracker (not for public distribution)

This file exists so `[LEGAL REVIEW]` flags have one internal home instead of appearing on customer-facing pages. Nothing here is legal advice; it's a checklist for AGAPAY's attorney/CPA.

## Open items

1. **Marketplace-facilitator classification (Parish+ commerce).** `public/terms.html` Section 8 states the parish is seller/merchant of record and describes the direct-charge architecture, but does not and should not claim this conclusively resolves marketplace-facilitator status under any specific state's law. Needs attorney sign-off per state where AGAPAY has active parishes, particularly states with broad marketplace-facilitator statutes that look past fee/charge-ownership to control over listing/checkout/customer interaction.
2. **No-statewide-general-sales-tax states (AK, DE, MT, NH, OR).** `public/terms.html` Section 9 and the registration UI state that lacking a statewide general sales tax isn't equivalent to tax-exempt status. This is believed correct as a general matter but has not been reviewed by a tax adviser state-by-state (e.g. Alaska local-tax nuances, Delaware gross-receipts tax scope).
3. **AGAPAY's own donation application fee vs. donation fund ownership.** AGAPAY collects an application fee on some direct-charge donation transactions (see Phase 1 audit). The framing that AGAPAY never takes ownership of donated funds should be reviewed alongside that fee structure.
4. **Final Stripe product tax codes.** `src/lib/tax-codes.js` `SUBSCRIPTION_TAX_CODES` are intentionally blank. Needs CPA/tax-adviser-approved values for Giving, Parish+, Learn, and Stewardship before `SUBSCRIPTION_TAX_CODES_ENABLED` is turned on.
5. **Retroactive tax adjustments.** Approving an exemption does not retroactively adjust already-finalized/paid invoices (Stripe's own behavior, not something AGAPAY code overrides). Whether AGAPAY should ever manually refund previously-charged tax after a late approval is a policy/legal question, not resolved by this code.

## Where NOT to put these flags
Per policy, `[LEGAL REVIEW]` labels must never appear as visible text on customer-facing pages (`public/*.html`). Keep them here, in code comments, or in `docs/reports/`.
