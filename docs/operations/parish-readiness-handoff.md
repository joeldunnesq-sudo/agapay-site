# Parish readiness and operational handoff

This handoff covers work that can be validated with synthetic records before a real parish joins. It does not claim an independent usability study, an accountant's approval, a live production restore, or round-the-clock staffing.

## Product promise

An Orthodox parish’s giving, people, ministry work, and finances connected in one system—with clear tools for the volunteers responsible for them.

Use this promise to explain the connected workflow. Avoid claiming that every feature replaces specialist accounting advice or that automated tests establish ease of use for a new volunteer.

## Repeatable treasurer workflow

1. Open **Accounting → Overview**. Confirm the parish and fiscal year, and check any incomplete setup items.
2. Use **Record Income** for a deposit and **Record a Non-Cash Gift** for an in-kind gift. Confirm the fund and category; attach supporting documents. Review the proposed entry before posting.
3. Use **Pay a Bill** to create, review, post and pay a bill through the existing approval controls. An approved bill and a bank payment represent different accounting events; do not enter the payment twice.
4. Open reconciliation. Import the synthetic statement, match its lines, investigate every difference and complete reconciliation only when its checks pass.
5. Open **Assets**. Register acquisitions against posted asset debits. For older property, expand **Import an older asset with opening depreciation**. Link existing cost and accumulated-depreciation balances rather than posting them again. Enter remaining useful life after the opening month.
6. Preview and post depreciation. Review the register's cost and accumulated-depreciation differences against the ledger. Explain that the schedule is an estimate until a journal is explicitly posted.
7. Open **Reports** and choose one shared fiscal YTD range ending on a month-end. Review income and expenses, financial position, cash flow, fund activity and budget to actual.
8. Open **Departments, projects & council packages**. Classify income and expense lines with a reason. Review Unassigned activity; it is included in totals. Open a department or project report and click an actual amount to inspect the underlying lines.
9. Allocate department/project shares on a **draft** budget. Percentages may total up to 100%; the remainder stays Unassigned. Submit and approve the budget using the normal controls. Submitted, approved and locked allocations cannot be edited.
10. Open **Month-end checklist**. Run its real subsystem checks, resolve blockers, preserve the close snapshot and complete the period close using the existing workflow.
11. Save a council package selection, generate it using the selected dates and download its combined PDF. Packages with budget comparisons require an approved or locked budget and a fiscal YTD month-end range. The saved snapshot does not change when later bookkeeping changes.

### Correcting an asset

- To correct a posted depreciation or disposal, open the asset and enter a correction date and reason. Preview the exact opposite journal and explicitly confirm it. Reverse the latest unreversed asset posting first. Closed-period controls still apply.
- To replace incorrect registration terms, reverse its asset postings, cancel the registration with a dated reason, then register the replacement against the released original allocation. The replacement cannot take effect before cancellation.
- Previous postings, reversals, cancellations and audit records remain available. Historical reports use their effective dates. Cancellation does not remove or reverse the original acquisition journal.
- Asset-account differences require review; a balanced trial balance alone does not prove that every asset has been registered.

## Synthetic verification and evidence

Run from a clean checkout with locked dependencies and the local Playwright browser installed:

```text
node scripts/accounting-asset-readiness-tests.mjs
node scripts/accounting-report-readiness-tests.mjs
node scripts/accounting-recovery-readiness-tests.mjs
node scripts/accounting-readiness-browser-tests.mjs
node scripts/run-tests.mjs accounting
node scripts/typecheck.mjs
```

Evidence generated under `artifacts/parish-readiness/` includes recovery checks, browser checks, desktop/mobile screenshots and a synthetic council PDF. These artifacts contain fictional records. Regenerate them for the exact release commit; a prior successful run does not validate later edits.

The recovery rehearsal uses the application's capture, plan, apply and file-validation functions with native SQLite and in-memory private object storage. It verifies an exact database round trip, attachment metadata, document body hashes, rejection of tampered snapshots, cleanup of post-snapshot files and preservation of populated legacy asset records. Local elapsed time is diagnostic evidence, not a production RTO.

## Recovery runbook

1. Identify the affected parish, environment, database, incident window and requested restore scope. Confirm ownership before accessing data. Do not paste donor names, gift details, private documents, session tokens or credentials into logs or tickets.
2. Preserve the current state and diagnostic identifiers. Pause affected writes through the existing recovery workflow; avoid editing financial tables directly. Retain unaffected parish access.
3. Identify a verified snapshot and inspect its scope, schema, ledger validation and file checksums. If financial source activity changed after the snapshot, stop automated replacement and reconcile external payment activity first.
4. Review the restore plan and safety snapshot before any replacement. A production restore is a separate, explicitly reviewed operation. Never run a local fixture against a configured production database.
5. Restore through the recovery workflow. Verify database state, private document bytes, ownership, reconciliation, financial statements, audit protections and removal of post-snapshot objects. Resolve failures before resuming writes.
6. Confirm parish access and the most recent valid financial activity. Preserve the incident record, evidence and any reconciliation needed. Do not treat a restore as a way to erase posted accounting history during ordinary corrections.

## Support triage and ownership

Primary support is the platform owner through **support@agapay.app** or the dashboard ticket form. Regular support hours are **Monday–Friday, 8 a.m.–6 p.m. Central Time (America/Chicago)**. The first-response commitment is **16 business hours**; resolution depends on the issue. The backup owner remains unassigned. Record a backup before claiming coverage when the owner is unavailable.

| Situation                                                  | First response                                                                                 | Evidence to preserve                                                           | Resolution gate                                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Incorrect parish access or suspected cross-parish exposure | Restrict the affected path and escalate for security review                                    | Environment, parish ID, timestamp, request/incident ID; no private payloads    | Ownership boundaries verified; incident reviewed                                     |
| Financial totals differ                                    | Compare the same posting-date range, fund, budget version and report basis; inspect drilldowns | Report parameters, journal IDs, reconciliation difference and validation codes | Explain and reconcile the difference; use normal correction controls                 |
| Donation missing or fee total differs                      | Check source event, receipt total, covered fee and integration status before retrying          | Event and gift IDs, processing status, idempotency result                      | One source gift maps to the correct receipt and ledger entries; no duplicate posting |
| Report or document fails to load                           | Capture the timestamp and request ID, retry once, check service health and scope               | Safe error code and screen; redact personal information                        | Original operation's outcome is known before repeating a write                       |
| Restore or attachment verification fails                   | Keep recovery paused; preserve the safety snapshot                                             | Operation ID, phase, checksum/ownership failure                                | All restored bytes and financial checks verified                                     |
| New volunteer cannot finish a task                         | Record the exact stopping point and expected next action                                       | Task, role, screen and anonymized wording                                      | Reproduce, simplify and retest with an unfamiliar user                               |

## First-parish usability study prepared in advance

Recruit an unfamiliar treasurer or volunteer when available. Use fictional records and normal permissions; do not coach until the participant stops. Record completion, time, wrong turns, help requests and confidence, without entering real parish information.

| Task                                                                  | Successful outcome                                                                         |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Record a Sunday deposit split between operating and a restricted fund | Correct amount, categories, funds and one posted entry                                     |
| Record and pay a utility bill                                         | Correct payable and payment; no duplicate expense                                          |
| Import and reconcile a bank statement                                 | Every difference explained and reconciliation validated                                    |
| Bring over an older piece of equipment                                | Cost and opening depreciation linked once; remaining life understood                       |
| Explain YTD spending against budget                                   | Correct fiscal cutoff, approved budget, variance explanation and transaction click-through |
| Prepare a council package                                             | Correct date range, readable PDF and preserved snapshot                                    |
| Correct a mistake                                                     | Participant finds the supported correction path and understands its audit history          |

Do not mark human usability proven until these sessions occur. Report task-level evidence and fix observed stopping points before broad claims about ease of use.
