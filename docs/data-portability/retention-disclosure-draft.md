# Parish closure retention disclosure

**Disclosure version:** `2026-08-29-draft-v1`

**Status:** Draft pending formal approval

**Production effect:** Automatic parish closure remains disabled until the exact
version above is approved and configured as
`PARISH_RETENTION_DISCLOSURE_APPROVED`.

This document is the review copy for the disclosure shown to a parish before it
can prepare a final closure export. It does not authorize production deletion.
Ordinary, non-destructive parish exports remain independent of this approval.

## Plain-language disclosure

### Eligible active parish data

After you save and verify the final export and explicitly confirm closure,
eligible active parish data is deleted. Preparing or downloading an export by
itself never deletes data.

### Accounting, financial, and legal records

Accounting books, transaction records, and supporting financial or legal
evidence are not erased at closure. They are frozen and access is restricted.
They enter retention review seven years after closure, or later when a longer
configured accounting period or legal hold applies. A review date does not
cause automatic deletion.

### Support records

Support and reconciliation correspondence enters retention review three years
after closure. A legal hold or a record dependency can require it to remain
longer.

### Closure safeguards

A minimal closure receipt and suppression record remains while any backup or
recovery source could restore the parish. It prevents restored data from
reactivating the parish and documents what was closed. Its final disposal
requires an approved retention schedule.

### Shared or independent accounts

Independent donor accounts, parent-owned Learn records, and identities used by
another parish are not deleted because they do not belong only to the closing
parish.

### Backups and recovery copies

When strict expiry is enabled, AGAPAY recovery objects expire after the
configured retention period with no newest-copy exception. Provider recovery
history expires on its separate schedule. Restores must replay the independent
closure ledger before traffic resumes. Retained financial data can appear in
later backups until its approved disposal.

When strict expiry has not passed release verification, automatic parish
closure remains unavailable.

### Copies outside AGAPAY

Records held independently by Stripe, email delivery providers, external
media services, or people who already downloaded a copy are outside the AGAPAY
parish purge and follow those providers' or recipients' controls.

## Approval checklist

Approval should record all of the following before production configuration is
changed:

- the approver and approval timestamp;
- the exact disclosure version;
- the approved duration and disposal authority for the minimal closure receipt
  and suppression ledger;
- confirmation that the seven-year financial/legal and three-year support
  review defaults match the published policy;
- confirmation that legal holds and configured longer accounting periods take
  precedence;
- confirmation that backup and provider-copy wording matches the operational
  evidence; and
- confirmation that the public terms/privacy notice and this in-product copy do
  not conflict.

Any wording change requires a new disclosure version and a new exact-version
approval. A stale approval token fails closed.
