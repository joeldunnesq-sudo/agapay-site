# Support and onboarding operations

## Customer commitment

- Customers can open **Get help** or **Support** in the parish dashboard, including from guided Accounting setup. A submitted message is saved as a ticket before an email notification is attempted.
- Contact address: **support@agapay.app**. The platform owner is the primary responder.
- Regular hours: **Monday–Friday, 8 a.m.–6 p.m. Central Time**, using `America/Chicago` so the same local hours apply through daylight-saving changes.
- Respond within **16 business hours**. This is a first-response commitment, not a guaranteed resolution deadline. For example, a Monday 9 a.m. ticket is due Tuesday at 3 p.m.; a Friday 5 p.m. ticket is due Tuesday at 1 p.m.
- A backup responder has not been assigned. Do not promise uninterrupted staffing or a 24-hour emergency response service. No holiday exclusions have been defined beyond the weekday schedule.

## Daily queue procedure

1. During support hours, check the admin support queue and support mailbox. Start with overdue first responses and reports of data exposure, financial inconsistencies or blocked parish access.
2. The ticket shows the calculated response due time and notification status. A failed notification does not mean the ticket was lost; it remains in the queue. Investigate mail delivery separately.
3. Reply from `support@agapay.app`, identifying the ticket reference, what you understand, any immediate workaround and the next update. Never ask for passwords, MFA codes, full bank credentials or a donor list.
4. Only after sending that reply, use **Mark response sent** in the admin queue. Merely changing status to In progress does not record a response or satisfy the target.
5. Keep the ticket In progress while investigating. Use safe request IDs and timestamps. Preserve existing notes when updating status. Confirm the outcome before marking it resolved.

## Incident triage

| Report                                                | Immediate operator action                                                                                     | Verification before closure                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Possible cross-parish exposure or unauthorized access | Restrict the affected operation through supported controls; preserve evidence; escalate to the platform owner | Verify identity and parish boundaries; review access and incident scope            |
| Financial totals differ                               | Confirm dates, fund, fiscal year and budget version; inspect transactions; avoid repeat posting               | Explain and reconcile the difference using auditable corrections                   |
| Donation or payment status unknown                    | Inspect source IDs and idempotency results before any retry                                                   | Establish the actual external outcome and one correct ledger treatment             |
| Site unavailable                                      | Check outside-in monitoring, deployment version and provider status; preserve failure timestamps              | Confirm public and authenticated checks pass after remediation                     |
| Document or restore failure                           | Keep recovery fenced; preserve safety state and checksums                                                     | Verify the intended scope, documents, ledger and ownership before reopening writes |

Do not restore production over current financial activity as an ordinary troubleshooting shortcut. A production replacement requires a concrete reviewed restore plan, verified snapshot, safety backup, external-activity reconciliation and authorization for that restore.

## Guided onboarding handoff

Accounting Overview and Setup link to **Continue guided setup**. The journey covers fiscal dates, categories, funds and giving destinations, prior-record decisions, older assets, a bank ledger account, ledger validation and the first completed reconciliation.

- Existing seeded records count as available, not as an operator review.
- Reviews are stored per parish with the reviewer, reason, date, version and a fingerprint of the records reviewed. Changed configuration requires a fresh review.
- Importing or deferring work does not make it complete. Historical asset registration must reconcile to its mapped ledger accounts, or the operator must explicitly record that no older assets exist.
- New books and existing books require an explicit reason when no additional opening entry is needed. Actual posted opening batches also provide evidence.
- Viewing or saving a setup review does not post financial amounts. A completed zero-difference reconciliation, through the normal controls, supplies the final milestone.
- Import and accounting actions continue to use their existing preview, approval, period and posting protections.

When helping a church migrate, collect its fiscal dates, reviewed prior balance sheet, fund list, latest bank statement and historical asset schedule through the authorized private workflow. Prefer opening balances over unexplained transaction-history imports. Keep accounting advice and source-document verification with the responsible treasurer/accountant.

## Operational evidence

Run `npm run ops:readiness` from a clean checkout with authenticated read access to this repository. It checks the latest main-branch results for health monitoring, database backups, stored-backup recovery and hosted parish/accounting recovery. A newer failed or running result cannot be concealed by an older successful run. Stale evidence stays visible.

The report is written to `artifacts/operations/readiness.json`. It includes workflow URLs and aggregate status only; it contains no credentials, customer records or backup bodies. The declared support channel and primary owner are part of operational readiness. Optional backup coverage remains explicitly disclosed and does not imply additional staffing or a different support commitment.

Validated qualifications for this work:

- [Stored production backup restored into disposable D1](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/41766392759).
- [Hosted parish/accounting recovery with synthetic data and confirmed cleanup](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/41766389428).
- [Refreshed outside-in production monitor](https://github.com/joeldunnesq-sudo/agapay-site/actions/runs/41767370840).

These are recovery qualifications, not a replacement of any active production parish database and not a promised recovery-time SLA. Repeat qualifications after material recovery or schema changes and retain the aggregate evidence.
