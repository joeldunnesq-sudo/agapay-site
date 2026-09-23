# Parish backups in Settings

The primary parish login can select **Settings → Parish backups → Download parish backup**. The existing MFA step-up protects records. One click queues a non-destructive export, polls its progress, verifies the downloaded ZIP's size and SHA-256, and hands it to the browser to save. The UI does not claim the operating system saved a file. Closing the page leaves the export available in **Data portability & closure**; returning and clicking again resumes an in-progress ordinary export. Closure exports are never reused by this button.

The existing portability pipeline supplies scoped CSV/JSON records, accounting records, supported stored files, external media links, and the inventory/checksum manifest. Credentials, independent personal accounts, and parent-owned Learn records are excluded. Existing self-service limits remain 24 MB and 10,000 rows per dataset. Larger exports require support; incomplete exports fail rather than producing a misleading successful backup. Existing limits on active export jobs still apply; old jobs can be cancelled in Data portability & closure.

Cloud status uses `GET /api/parish/dashboard/:parishId/portability/backup-status`. It requires the primary parish session but does not trigger MFA on a background timer. Responses are private and uncached. Settings refreshes every 30 seconds while visible and offers manual refresh. This is periodic live polling, not push notification.

The status reads `ACCOUNTING_BACKUPS/platform-d1/verified.json`, published by the production backup workflow only after uploading, downloading, and checking the backup. It validates the timestamp, local restore evidence, and artifact presence/size. Missing, malformed, future-dated, or unreadable evidence shows unavailable. Evidence older than 48 hours shows overdue, retaining the actual date. Internal keys and platform record counts are never returned.

This timestamp explicitly covers the **AGAPAY central database**, not separate accounting databases or uploaded file storage. It is not a claim that all parish information has a single coordinated cloud snapshot. A local export never updates the cloud timestamp.

## Release

Deploy the application changes and update the production backup workflow. The first successful run of the updated workflow publishes the verified status marker; until then Settings truthfully shows no verified timestamp. No new bindings or migrations are needed.

## Verification

- `node scripts/parish-backup-tests.mjs`
- `node scripts/parish-backup-browser-tests.mjs`
- `node scripts/parish-portability-tests.mjs`
- `node scripts/production-operations-workflow-tests.mjs`

Browser tests use synthetic data and include the real Settings page at desktop and mobile widths. Screenshots are in `artifacts/parish-backup/`.
