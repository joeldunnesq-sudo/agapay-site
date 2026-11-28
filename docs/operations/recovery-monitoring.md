# Production recovery and monitoring

## Recovery objectives

The platform D1 recovery planning targets are a 24-hour recovery point (RPO) and an 8-hour recovery time (RTO). These are operational targets, not guarantees. Each daily manifest records them, and each monthly drill records the backup age plus measured end-to-end database creation, import, and validation duration.

The daily `Production D1 backup` workflow exports production, prepends the restore-safe foreign-key pragma, restores the SQL into an isolated local SQLite database, runs `PRAGMA quick_check`, inventories all user schema objects and every table row count, and uploads the SQL, checksum, unique manifest, and `platform-d1/latest.json` pointer to the private backup bucket. It then downloads the stored SQL, checksum, and pointer and recomputes SHA-256. Nothing from the backup workflow is uploaded as a GitHub artifact; the durable evidence remains in private R2 and the result is recorded in the workflow summary.

The monthly `Production D1 recovery drill` downloads the exact object identified by the latest stored manifest, verifies its checksum and age, creates a uniquely named remote D1 database, imports the stored SQL, runs `PRAGMA quick_check`, and compares the complete user schema inventory and every table row count. The isolated database is deleted in an `always()` cleanup step. Production is never an import target.

An off-provider copy is not enabled because the production database payload should not be placed in GitHub artifacts without a separately managed encryption recipient and retention decision. If Cloudflare-account loss enters the threat model, add client-side age encryption and a second-provider object store; do not upload plaintext SQL.

## Outside-in monitor

Scheduled invocations wrap central and bound accounting D1 reads, plus read-only accounting provisioner RPC queries, with up to three retries for recognized D1 throttling (including the accounting adapter's HTTP 429). Delays use exponential backoff with jitter: 1–2, 2–4, and 4–8 seconds. All jobs share a 20-second total delay allowance per invocation. The fixed-value portability retention-review update is also safe to retry; other writes, mixed batches, payments, messages, and whole jobs are never replayed. SQL errors, limits requiring intervention, and unknown write outcomes still fail normally. Retry exhaustion reaches the existing failed heartbeat and email path, with the existing one-hour per-job email deduplication. Recurring accounting processors finish both branches and surface failed saved runs to that alert path.

The outside-in monitor confirms a failed read-only check after two seconds and, if still failing, four more seconds. A healthy confirmation avoids an email while retaining the original failure and confirmation samples in the JSON evidence. Repeated latency, HTTP, unhealthy-payload, or scheduler failures still fail the workflow. Backup freshness remains a separate mandatory gate.

The private R2 backup manifest download also gets three attempts with two- and four-second delays. Exhausted downloads fail before freshness validation; successfully downloaded manifests must still pass the unchanged 30-hour age and validity checks. A transient R2 control-plane failure is not evidence of an overdue backup.

`Production outside-in monitor` runs every 15 minutes and checks:

- three `/api/health` samples, including live D1 and KV checks, for a short-window error-rate signal;
- parish dashboard and public giving availability;
- latency budgets for every endpoint;
- a bearer-authenticated, read-only operations canary for D1, KV, private backup/document bindings, failed jobs, and the five-minute scheduler heartbeat;
- private R2 backup-manifest freshness, with a 30-hour ceiling.

Keep a separate UptimeRobot HTTP monitor for production at `https://agapay.app/api/health`. Use the five-minute interval and enable provider email alerts to the operations contact. Verify the alert setup and a successful probe on the staging health URL before enabling the production monitor. UptimeRobot probes and sends its alerts independently of the AGAPAY Worker and GitHub Actions.

GitHub Actions still records detailed canary and backup evidence. Its supplemental email uses the authenticated monitor-alert route and the production Resend configuration. Use the UptimeRobot incident for an outage that prevents the Worker from responding.

The canary secret exists only as the Worker secret and GitHub Actions secret `AGAPAY_MONITOR_CANARY_TOKEN`. Rotate both values together. Never put the token in `wrangler.toml`, logs, artifacts, or a workflow input.

The staging Worker uses a separate canary credential. Its GitHub Actions counterpart is `AGAPAY_STAGING_MONITOR_CANARY_TOKEN`. The staging and production workflows verify that their own Stripe Connect destination is active, points to their own Worker, and includes every required event. The probe returns only the destination match and missing event names.
