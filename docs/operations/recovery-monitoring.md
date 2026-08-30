# Production recovery and monitoring

## Recovery objectives

The platform D1 recovery planning targets are a 24-hour recovery point (RPO) and an 8-hour recovery time (RTO). These are operational targets, not guarantees. Each daily manifest records them, and each monthly drill records the backup age plus measured end-to-end database creation, import, and validation duration.

The daily `Production D1 backup` workflow exports production, prepends the restore-safe foreign-key pragma, restores the SQL into an isolated local SQLite database, runs `PRAGMA quick_check`, inventories all user schema objects and every table row count, and uploads the SQL, checksum, unique manifest, and `platform-d1/latest.json` pointer to the private backup bucket. It then downloads the stored SQL, checksum, and pointer and recomputes SHA-256. Nothing from the backup workflow is uploaded as a GitHub artifact; the durable evidence remains in private R2 and the result is recorded in the workflow summary.

The monthly `Production D1 recovery drill` downloads the exact object identified by the latest stored manifest, verifies its checksum and age, creates a uniquely named remote D1 database, imports the stored SQL, runs `PRAGMA quick_check`, and compares the complete user schema inventory and every table row count. The isolated database is deleted in an `always()` cleanup step. Production is never an import target.

An off-provider copy is not enabled because the production database payload should not be placed in GitHub artifacts without a separately managed encryption recipient and retention decision. If Cloudflare-account loss enters the threat model, add client-side age encryption and a second-provider object store; do not upload plaintext SQL.

## Outside-in monitor

`Production outside-in monitor` runs every 15 minutes and checks:

- three `/api/health` samples, including live D1 and KV checks, for a short-window error-rate signal;
- parish dashboard and public giving availability;
- latency budgets for every endpoint;
- a bearer-authenticated, read-only operations canary for D1, KV, private backup/document bindings, failed jobs, and the five-minute scheduler heartbeat;
- private R2 backup-manifest freshness, with a 30-hour ceiling.

Failures remain visible in GitHub Actions and also call the authenticated monitor-alert route, which sends email through the production Resend configuration to `AGAPAY_OPS_ALERT_EMAIL`. The email path is independent of GitHub notifications, but a total Worker outage can also prevent that route from sending; a future provider-level health check should cover that final failure mode.

The canary secret exists only as the Worker secret and GitHub Actions secret `AGAPAY_MONITOR_CANARY_TOKEN`. Rotate both values together. Never put the token in `wrangler.toml`, logs, artifacts, or a workflow input.
