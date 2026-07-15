# Package 0.75F - Background Processing

## Objective

Package 0.75F defines the background-job boundary for future accounting work without creating live queues, workflows, cron triggers, or production resources.

Cloudflare's current platform primitives divide naturally for AGAPAY:

- Queues are suitable for buffered work with retries, batching, and optional dead-letter handling. Cloudflare documents Queues as message buffers where messages are not deleted until successfully consumed, and notes that ordering is not guaranteed. See [Cloudflare Queues overview](https://developers.cloudflare.com/queues/) and [How Queues works](https://developers.cloudflare.com/queues/reference/how-queues-works/).
- Workflows are suitable for durable, multi-step jobs with built-in retries and observability. See [Cloudflare Workflows](https://developers.cloudflare.com/workflows/).
- Cron Triggers are suitable for scheduled Worker entry points. See [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

## Implementation

- Added `src/accounting/background-jobs.js`.
- Defined a transport-neutral job envelope with schema versioning, correlation IDs, idempotency keys, retry metadata, and a gateway-required flag.
- Defined initial job types for Stripe source events, posting retries, database provisioning, migrations, backups, restore validation, reporting, and Aplos imports.
- Added payload guardrails that reject secrets, tokens, raw database selectors, bindings, DSNs, and connection strings.
- Added retry classification and failed-job record creation.
- Added `scripts/accounting-job-tests.mjs`.

## Tests

- `node scripts/accounting-job-tests.mjs`
- `npm run check`

## Acceptance Verdict

Accepted. The repo now has a clear background-job contract and retry model without provisioning any Cloudflare resource.

## Manual Actions Deferred

- Create real Queues, Workflows, Cron Triggers, and DLQs only after Phase 1 job semantics are approved.
- Choose per-job maximum retries and operational alert thresholds before production enablement.
