# Importing a parish directory

Open **Parish Directory → Import directory** in the parish dashboard.

1. Select a CSV UTF-8, TSV, or Excel `.xlsx` file. Files may contain up to 500 people, 60 columns, and 2 MB. For a workbook, select the worksheet that contains the directory. Legacy `.xls` files must be saved as `.xlsx` or CSV first.
2. Match the columns. Use Full name, or First name plus Last name. Email, phone, household name, relationship, and address fields are optional. Unmapped columns are ignored. Use the same explicit household name for relatives who should share a household. Without a household name, each person gets a separate household.
3. Review the preview. New valid rows are ready; invalid rows and possible duplicates are excluded. Nothing has been imported or emailed yet.
4. Choose whether to send signup invitations, confirm your authorization, and start the import. The results show imported, skipped, invalid, and invitation delivery counts. Download a results CSV for follow-up.

Use the template download for an example. Remove its example people before importing your own directory. Prefer simple spreadsheets with a header in A1 and no formulas. Workbooks are parsed in a browser worker; the raw file never leaves the device. Only mapped values go to the authenticated import API.

## Household and privacy rules

- Relationships are `head`, `spouse`, `child`, `grandparent`, or `other`; a blank relationship becomes `other`. **Mark every child as `child`.** Children can be imported but never receive account invitations.
- Contacts without an email can still be imported. Each invited adult needs an individual email address. Repeated names or shared emails in a file are skipped for staff review rather than automatically deciding which identity to link.
- Household names are explicit grouping keys, not surname matching. Existing households from other workflows are not automatically merged. Conflicting household addresses must be resolved before importing.
- A street address and city must be provided together. Country uses a two-letter code and defaults to `US`. Postal codes are kept as text; format them as text in Excel to preserve leading zeros.
- Imported contacts and addresses are private, unverified, and unpublished. People and households start with draft publication profiles. An import does not grant household administrator privileges or bypass household verification/publication review.
- Existing records, privacy choices, donor accounts, and giving history are not overwritten. A repeated import is checked against parish-scoped names, emails, and original import IDs. Ambiguous matches are skipped; staff can review them through the existing record tools.

## Invitations and recovery

Each eligible adult receives an individual email from AGAPAY's existing central Resend account. The email names the parish, explains account creation/sign-in, and contains a 14-day invitation. It does not request a gift or payment. Account creation and email verification preserve the invitation destination; acceptance requires the invited email address. Only a token hash is stored in the invitation table.

An import processes five rows per request. Keep the dialog open while it runs, or use **Pause after this group**. Closing a tab does not undo completed rows; reopen a batch from **Recent imports** to continue. This is resumable request processing, not an unattended background queue.

“Sent” in stored results means the email provider accepted the request, not proof of inbox delivery. Failed deliveries can be retried explicitly; successfully sent invitations are not resent. A timeout or interruption may leave delivery uncertain. These rows are not automatically retried: inspect the person's invitation before choosing a resend through the existing directory record controls. Imported contacts remain saved even if their email fails.

## Deployment and operations

- Apply `0108_directory_imports.sql` with the normal D1 migration process before deploying the updated Worker and assets. This migration adds private batch/row progress and parish import leases; it does not modify existing directory records.
- No new email provider, queue, Worker binding, or secret is required. Invitations require the existing `RESEND_API_KEY`, trusted `AGAPAY_APP_URL`, and sender configuration. No keys are accepted from uploaded files.
- Import APIs require `directory.manage` in the authenticated parish. Sending and retrying invitations additionally require `directory.invitations.manage`. Preview and result responses use private/no-store headers. JSON requests are bounded at 1 MB and imports at 500 rows, with per-parish/IP rate limits and a parish processing lease.
- Raw workbook files are not retained. Normalized mapped rows and outcomes are retained in the private import tables for resumability and support. These include contact information and must follow the same access and retention practices as directory records.
- Excel parsing uses the locally served SheetJS 0.20.3 mini build. Its package URL is pinned to the [official SheetJS distribution](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/); no spreadsheet parser is downloaded from a third party while staff use the tool.

Run `npm run test:directory-import` for the feature tests or `npm run check:directory` for the full directory suite. Tests use temporary SQLite databases and intercepted email calls, never real recipients.
