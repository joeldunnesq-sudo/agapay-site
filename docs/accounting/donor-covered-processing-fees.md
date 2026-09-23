# Donor-covered processing fees

## U.S. treatment and evidence

A voluntary additional amount paid to a qualifying parish to help meet its payment-processing costs is part of the donor's contribution, provided no goods or services are received in exchange (apart from qualifying intangible religious benefits). It is not a second, independent deduction for a fee paid to Stripe. Actual deductibility remains subject to the donor's circumstances and applicable limits.

This treatment follows the IRS's cash contribution and substantiation rules and the requirement to report gross contribution revenue separately from expenses. The IRS material is general guidance rather than an AGAPAY-specific ruling. The directly relevant nonprofit legal commentary below reaches the same result for donor-paid card costs.

- [IRS Publication 526](https://www.irs.gov/publications/p526): cash contributions, qualified organizations, goods/services, credit-card timing, and recordkeeping.
- [IRS substantiation requirements](https://www.irs.gov/charities-non-profits/substantiating-charitable-contributions): charitable acknowledgments and disclosure requirements.
- [IRS Form 990-EZ instructions, line 1](https://www.irs.gov/instructions/i990ez): gross contributions and separately reported related expenses. This reporting principle does not imply that a parish is required to file Form 990-EZ.
- [Nonprofit Issues: Is donor's payment of credit card fee deductible?](https://www.nonprofitissues.com/to-the-point/donors-payment-credit-card-fee-deductible): direct discussion of fee-covering gifts.
- [Stripe Balance Transaction object](https://docs.stripe.com/api/balance_transactions/object): actual amount, fee, net, and currency.

Verified September 23, 2026.

## Example

For a $100 intended gift, a $3.30 voluntary addition, and a $3.30 actual Stripe fee:

| Record | Amount |
| --- | ---: |
| Donor contribution / receipt | $103.30 |
| Contribution revenue | $103.30 |
| Stripe processing expense | $3.30 |
| Net proceeds | $100.00 |

If the donor contributes only $100 and Stripe retains $3.20, the receipt remains $100, the processing expense is $3.20, and net proceeds are $96.80. An exempt parish's expense recognition does not imply that it receives an income-tax deduction in the same way as an individual donor.

## Implementation

- Statements use the recorded gross charge, including the fee-covering addition, rather than the intended gift alone. Where a legacy charge is unavailable, only explicitly recorded coverage is added; the checkbox alone cannot manufacture an amount.
- Statements itemize fee-covering additions and recorded refunds. Payment completion dates determine the calendar year, falling back to the stored creation date for legacy records. Recorded partial refunds reduce the amount; a later-year refund does not silently reduce the earlier-year receipt. Cross-year refund tax recovery must be reviewed separately. USD statements exclude other currencies.
- Original accounting principal events remain immutable. A linked, idempotent contribution event recognizes any omitted fee-covering addition. Actual Stripe expense remains separately posted. Gross revenue equals intended gift plus the fee-covering contribution, without counting the processor expense twice.
- A reconciled zero Stripe fee is kept as zero rather than replaced by an estimate.
- Stewardship Health and both stewardship report variants show annual, quarterly, and monthly fee information. Reports cover USD AGAPAY giving and group transactions by gift date. Commerce, subscription fees, and standalone Stripe adjustments are outside this view.
- Confirmed Stripe fees require the recorded balance-transaction source and identifier. Estimated fees are displayed separately; missing reconciliation never appears as confirmed zero.
- Donor-funded costs are capped at actual Stripe fees. Remaining costs are parish-funded; excess voluntary coverage remains contribution revenue. For refunded gifts, recorded refunds reduce the retained coverage first, a conservative reporting allocation. Original processing fees are not assumed to have been refunded. Separate Stripe fee credits/adjustments require ledger reconciliation.

## Historical rollout

Existing stored PDFs are immutable artifacts and do not recalculate automatically. Preview and reissue affected annual statements through the normal dashboard flow after reviewing corrections; this change does not automatically email donors.

In **Accounting → Give & Stripe accounting → Donor fee-covering gifts**, choose a calendar year and preview historical gifts. Each preview covers at most 100 records. Review the missing amount, then recognize the reviewed additions and continue to the next batch. The ledger's review policy and closed-period rules still apply. Existing posted journals are never rewritten, and replaying a batch cannot duplicate already recognized additions. This only repairs gifts with an existing AGAPAY principal source event; missing original imports require the normal accounting import/reconciliation workflow.

The parish-scoped endpoint is `POST /api/parish/dashboard/:parishId/accounting/integrations/give-stripe/fee-coverage-backfill`. Preview with `{year, afterId}`. Application adds `apply: true` and the exact returned `expectedAdditions` list. It requires accounting backfill permission and, for application, posting permission. Use the returned cursor for subsequent batches. Refresh a preview if an amount changes. Review any returned non-posted status before closing the books.

No production records or previously issued statements were changed as part of implementing this feature.
