# All-tier fund reconciliation

Status: approved for release, 2026-08-31; deployment is tracked through the protected main-branch workflow. The preview uses synthetic data and does not call production Stripe.

## Product boundary

Monthly reconciliation is included in Give, Give +, Parish, Diocese, and Monastery. It attributes Stripe payouts to giving funds and records an independent bank check; it is not a general ledger, a fund-balance ledger, or a bank-transfer service. Advanced Accounting and Stewardship Health remain separate features.

The existing Stripe Connect Standard onboarding and bank-account configuration are unchanged. This implementation never initiates payouts or transfers.

## Delivered experience

- One Monthly reconciliation workspace: Give sidebar after Givers, mobile Reconcile tab, Giving Overview weekly card, and a link alongside the Givers CSV export.
- Last completed month by default; the current month is visibly in progress. Month choices cover the most recent 36 months.
- Navy, warm-neutral, and gold styling based on Stewardship Health, with responsive expandable fund cards.
- Three exact-cent totals: Stripe-paid payouts, attributed to funds, and unmatched net, alongside unresolved-item counts.
- Expandable fund allocations and payout/source details. Gifts, fees, refunds, and adjustments remain visible.
- One export menu: fund summary CSV, transaction detail CSV, and a printable report. Exports identify the report revision, date basis, currency, and draft/review status. The fund-summary CSV contains no giver names.
- Blank bank amount, explicit statement-confirmation checkbox, and a server-validated Save reconciled review action.
- Optional manual handling notes default to recording allocation, not transferring designated funds. Nothing moves money.
- Versioned review/reopen history, reviewer session identifier, timestamps, reasons, and immutable report snapshots. Reopening requires a reason; simultaneous saves cannot silently overwrite one another.
- Weekly Giving by fund card for the last completed Monday–Sunday week, including top four funds and View all.

## Money and date rules

The monthly report uses actual signed Stripe balance transactions within known automatic payout batches. It selects payouts by Stripe expected arrival date, using the UTC date Stripe supplies; this is not independently verified bank posting time.

The weekly card and secondary monthly gift-activity view use paid dates in the parish timezone. Their net is original gift net before refunds/disputes, with an estimated-fee warning when appropriate. Refunds/disputes belong in payout reconciliation. These activity totals are neither bank deposits nor current available fund balances. Pledges and uncollected promises are not receipts.

All calculations use integer cents and require supported USD amounts. Funds & Alms is the authoritative parish fund catalog consumed by Accounting on activation/save. Both monthly reconciliation and weekly activity use that catalog's IDs and current labels; original labels remain in gift records. Disabled funds retain their receipts. Removed funds remain explicitly historical, and a new fund reusing an old name cannot take over an explicit older fund ID. Name-only legacy gifts resolve only to an unambiguous catalog match, otherwise retaining a historical identity. Unsupported or unknown fund assignments are not silently placed in General.

A source must belong to the parish and, when recorded, its connected account and live/test mode. Duplicate transactions, invalid amounts, mixed currencies, missing sources, and incomplete pagination prevent a clean report. Unknown positive and negative items cannot cancel into a false success: unresolved count and absolute value are tracked as well as signed net.

Finalization requires a completed reporting month, complete eligible payout composition, no unresolved items, exact bank-total agreement, explicit bank confirmation, and an unchanged report fingerprint. Notes cannot waive a difference. Late changes visibly flag an existing review as revised instead of rewriting its archived snapshot.

Snapshots and the current review pointer are written in one conditional D1 batch. Stale reviewers write neither. A conservative snapshot-size guard prevents marking a month reconciled when its full audit snapshot cannot be stored safely.

## Implemented limits and follow-up work

These limits are explicit review conditions, not silently successful results:

- Standard automatic USD payouts are supported. Manual/instant payouts and unfinished Stripe reconciliation batches cannot be assigned invented transaction membership.
- Offering-backed giving is classified. Unmatched commerce, event, tax, and account-level activity remains Needs review; a dedicated commerce/liability classifier and manual resolution workflow are not implemented.
- Per request: at most 100 payouts, 500 transactions per payout, 2,500 total transactions, and 80 source lookups. Hitting an actual remaining-data boundary marks the report incomplete. A resumable high-volume Stripe sync is future work.
- Gift activity uses period-scoped keyset pagination, with a 25,000-gift safety limit. No latest-2,000-gifts shortcut remains.
- Weekly data has a short per-parish browser cache; there is no persisted backend aggregate cache.
- The bank check is an aggregate comparison. Editable actual bank-posting dates and month-crossing adjustment workflows are not implemented. A timing difference stays unresolved.
- The UI shows the latest 25 review-history entries. Full snapshots are retained server-side; a historical-snapshot download screen is not implemented.
- Existing legacy close records remain readable, but without a matching current fingerprint are not upgraded into independently verified reconciliations.
- No weekly email, scheduled notification, bank feed, or bank-transfer automation is included.

## Local preview

Run:

```text
node scripts/preview-fund-reconciliation.mjs
```

Open http://127.0.0.1:4176/parish/dashboard and choose Monthly reconciliation or Reconcile.

The local-only preview runs real report/review handlers and SQL against an in-memory synthetic fixture. July 2026 has four payouts totaling $12,848.54, five funds, and a refund. The weekly fixture totals $3,445.55 net before refunds. Saves and reopen actions affect only memory and reset when the server restarts.

## Validation

- `node scripts/fund-reconciliation-tests.mjs`: 13 financial scenarios plus timezone/DST/classification checks. Covers all tiers, bank confirmation, stale fingerprints, atomic concurrent saves, oversize archives, late failures, unknown net-zero pairs, cross-tenant/account sources, unsupported payouts, month boundaries, 2,001 gift pagination, empty/pending months, exact volume boundaries, duplicate IDs, and dispute reversals.
- `node scripts/fund-reconciliation-browser-tests.mjs`: desktop/mobile report navigation, fund details, bank save/reopen, draft CSV/print output, numeric refunds, formula injection, unknown activity, exact dates/cents, and mobile layout.
- Existing parish giving browser, entitlement, worksheet, module/runtime/navigation, extraction, marketing, and platform checks are exercised alongside the new tests.
- Full lint, formatting, source-size, and migration quality gates pass. Existing tier/navigation/browser fixtures were updated for the approved feature set; no quality gate was relaxed. The directory actor serializer was extracted to preserve its source-size limit.
- Accounting catalog tests verify that an upgrade, rename, and repeated synchronization reuse one ledger fund identity while reconciliation retains the original giving fund ID.
- SQLite fixtures execute real SQL and atomic transactions, but do not substitute for testing the deployed Cloudflare D1 runtime or a real Stripe sandbox account.

Before release, compare a sandbox automatic payout against Stripe's itemized report and have an authorized treasurer review a representative month, particularly mixed-commerce accounts and month-end posting differences. Deployment requires separate approval.

## Relevant implementation

- `src/lib/fund-reporting.js`: timezone periods, historical fund classification, paginated gift activity.
- `src/handlers/parish-reconciliation.js`: payout matching, completeness, fingerprint, review history, atomic finalization.
- `public/parish/features/giving/reconciliation.js` and `reconciliation-reports.js`: UI, exports, print.
- `public/parish/features/giving/weekly-funds.js`: weekly dashboard card.
- `public/parish/fund-reconciliation.css`: responsive report styling.
