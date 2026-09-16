# St. Fiacre accounting presentation

Prepared September 16, 2026. All amounts below are synthetic demonstration records, not a customer's accounts or evidence of live Stripe settlement.

## Before the meeting

1. Open https://agapay.app/parish/dashboard?parish=st-fiacre and complete normal login/MFA and the Accounting profile PIN.
2. Confirm the sidebar says **St Fiacre (Demo)**. Use Treasurer view.
3. Visit Payables, Budgets, and Reconciliation → Bank reconciliation once, then return to Overview. These modules load on demand; this also populates the overview's module cards.
4. Keep this guide open beside the demonstration. Do not rely on memory for dates or amounts.
5. The books intentionally illustrate a historical period. July is the open accounting period. Do not submit a new transaction with today's default date; use July 2026 for a deliberate posting exercise.

Opening statement: “This is the working accounting suite with sample parish books. I'll show how a treasurer records activity, keeps restricted funds separate, reviews bills, reconciles a statement, and prepares reports.”

## Fifteen-minute walkthrough

### 1. Overview and fund balances — 2 minutes

Show:

- Cash on hand: **$37,587.00**.
- Net assets: **$35,656.75**.
- General Operating Fund: **$31,871.75**.
- Building Fund: **$1,350.00**; Iconography: **$1,300.00**; Benevolence: **$300.00**.

Explain that fund balances describe the purpose of resources; they are not additional bank accounts. The $92.90 difference between total assets and cash is the sample bookstore clearing balance, not a verified live Stripe balance.

### 2. Record income — 2 minutes

Open **Record Income**. Show income type, bank account, fund, and split-allocation controls. Use a proposed $100 deposit with $75 general and $25 building as a form demonstration. **Do not submit** during the standard repeatable walkthrough. Return to Overview.

### 3. Payables — 3 minutes

Open **Payables**. Existing posted bills total **$2,023.15**:

| Bill | Amount |
| --- | ---: |
| Utilities | $286.40 |
| Church supplies | $486.75 |
| Roof repair | $1,250.00 |

Show a bill's details, the vendor list, and aging. These historical bills are intentionally unpaid, so overdue labels are expected. Open **Enter bill** to explain the fields without saving. Do not print checks or post payments as part of the standard demonstration.

### 4. Bank reconciliation — 3 minutes

Choose **Reconciliation → Bank reconciliation**. Use the **January 1–July 31, 2026** sample statement, ending **$37,587.00**. The older July-only session is voided and retained as history.

The presentation fixture contains a single outstanding **$27.00** candle-deposit match. **Review matches** should show it. The difference is $27 before matching and $0 after confirmation. This matching operation does not create another donation or journal entry.

For a repeatable, non-mutating presentation, show the suggestion and explain confirmation without clicking it. If you do confirm it, leave the reconciliation open; do not click Complete. The preparation evidence contains a successful rehearsal of the same matching service reaching zero.

The accompanying sample-bank-statement.csv is a synthetic statement constructed for this demonstration, including historical fixture corrections. Do not present it as an actual bank download or import it again into the same books.

### 5. Reports and budget — 4 minutes

Show **Reports → Balance Sheet** and **Income Statement**. With the existing sample books, year-to-date figures are:

| Measure | Amount |
| --- | ---: |
| Assets | $37,679.90 |
| Liabilities | $2,023.15 |
| Net assets | $35,656.75 |
| Revenue | $12,679.90 |
| Expenses | $2,023.15 |
| Change in net assets | $10,656.75 |

For **Statement of Cash Flows**, set report dates to **July 1–31, 2026** and apply them. July net cash movement and actual cash movement are both **$12,587.00**, with zero reconciliation difference. July revenue is **$12,636.95**, expenses **$1,736.75**, and change in net assets **$10,900.20**.

Do not use the default full-year cash-flow report as the validated example: the historical seed posts $25,000 of opening equity on January 1, which produces an opening-balance reconciliation warning when that date is included. July avoids that opening entry and is the period validated for this walkthrough. This limitation is not concealed by changing account classifications or posted journals.

Open **Budgets → Variance**. Explain the per-account comparison; the sample has sparse historical transactions, so it is not a realistic forecast of a parish's annual performance. Finish by showing the available CSV export and council packet controls.

### 6. Close — 1 minute

Ask: “Would your treasurer be comfortable working through these tasks? What would you need to verify before bringing your existing books over?”

## Preparation and verification

- Confirmed the hosted database belongs to st-fiacre and saved a pre-change snapshot in the ignored local artifacts/accounting-demo directory.
- Corrected two synthetic bookstore source-record identifiers to match the references already held by immutable journals. No posted journal was edited.
- Voided the stale synthetic reconciliation and superseded its sample bank rows; created a consistent presentation statement with one $27 match remaining.
- Rehearsed matching on the local copy with the real accounting service: $27 difference becomes $0.
- SQLite integrity and foreign-key checks passed. Full accounting integrity scan on the corrected local copy passed all nine checks.
- Preserve normal MFA, profile PIN, and accounting permissions. No credentials belong in this guide.

Live UI verification and release evidence are recorded separately in the completion report. This guide is not a claim that unverified screens or live Stripe settlement have been tested.
