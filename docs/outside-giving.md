# Outside giving in Givers

Available on every active giving tier. The form records contributions already received; it never charges a giver, calls Stripe, moves money, or creates a journal entry.

## Authoritative records

- The amount, received date, source and reference live once in `manual_income_entries`, the existing contribution register used by Stewardship financial snapshots.
- `outside_gift_details` adds an individual giver link, stable Funds & Alms fund ID, pledge designation, revision and optional Accounting allocation. It is not a second income total.
- Givers are selected from this parish's giving records. An outside gift can instead remain anonymous/unassigned, but cannot then be a pledge payment. Names are never used alone to attach a gift to an account.
- Select only active funds from the parish registration's Funds & Alms catalog. Reports resolve the current fund name while preserving the originally recorded name.

## Pledge payments

Every gift explicitly chooses **Pledge payment** or **Other giving**. Pledge payments require an identified giver and an existing positive pledge for that parish and pledge year. The pledge year can differ from the received year, allowing a late payment to fulfill a prior-year pledge without moving the gift into a different financial-reporting period.

Only active pledge-designated outside gifts affect pledge progress. Corrections and voids take effect on the next report load. The donor's home-parish pledge tracker, parish pledge fulfillment and nudge eligibility include those payments. Monthly progress uses the received month within the selected annual obligation. Other giving and unclassified legacy aggregate collections do not receive pledge credit automatically.

Existing online general/stewardship gifts retain their established pledge eligibility. This release does not relabel historical online payments.

## Accounting boundary

Recording a gift does not prove a bank deposit. An authorized, unlocked Accounting staff profile can link a gift to an existing **posted manual revenue credit for the same published fund**. Stripe-generated, draft, reversed and different-fund entries are excluded. The treasurer confirms the entry actually includes this gift. Several gifts may share a contribution line, but their combined allocation cannot exceed its credit amount.

Linking is read-only against the ledger. Central allocations and their audit entries are transactional and revision-checked. A linked gift must be unlinked by an authorized treasurer before correction or voiding. Unlinking requires a reason and does not reverse or alter the journal. A review checks that the linked contribution still exists in the current books. There is no automatic posting or historical backfill on upgrade.

Giving-history overview inputs subtract linked outside amounts from the corresponding manual Accounting contribution before combining sources. This avoids showing the same identified contribution twice in those inputs. Existing bank reconciliation and source-event posting remain separate workflows.

## Reporting and corrections

- Givers and Giving History include active outside gifts. Giving totals use contribution amounts before fees.
- Complete monthly giving CSVs include outside source/reference, actor, giving purpose and pledge year. Outside rows leave processor fees, charged amount and bank net blank, explicitly marked unverified. They never appear as Stripe payout transactions.
- Annual statements include identified active outside contributions by **received year**; their existing tier gate is unchanged.
- Create requests have an immutable idempotency key. Matching gift details trigger a duplicate warning; a genuinely separate matching gift requires a recorded explanation. Staff must also confirm it is not already in online giving or a legacy aggregate collection.
- Corrections and voids require reasons, keep revision snapshots and cannot hard-delete the gift. Legacy aggregate screens direct individual gifts back to Givers for changes.
- The annual management list fails closed above 1,000 records; monthly CSV/history reads fail closed above 25,000 rather than returning silent partial outside totals. Giver search and Accounting candidates are bounded to 100 with an explicit more-results indication.

Migration `0115_outside_giver_contributions.sql` is additive, creates no gifts and changes no existing amounts. Both sidecar tables are part of parish export review and financial-record retention. No production gifts are created by the tests or preview.

## Verification

`scripts/outside-gifts-tests.mjs` uses real handlers and SQLite with foreign keys/transaction rollback. It covers validation, tenant-scoped identity, idempotency, duplicate warnings, audit/void behavior, pledge classification, fund renaming, CSV/statements and Accounting allocation capacity. `scripts/outside-gifts-browser-tests.mjs` covers desktop and mobile form submission, pledge/other corrections, attached giver display and audit history. Existing reconciliation browser tests compare computed sidebar typography in selected and unselected states.
