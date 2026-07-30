# Accounting release-gate staging runbook

This environment exists solely to run the authenticated accounting release
gates against two synthetic, isolated parishes. It is not a production clone.
Never copy production parish, donor, payment, or accounting data into it.

## Resource inventory

The resources were created in the same Cloudflare account as production, but
they do not share any production binding:

| Purpose | Cloudflare resource |
| --- | --- |
| Worker | `agapay-site-staging` |
| Central platform D1 | `agapay-staging` |
| Parish A accounting D1 | `agapay-acct-staging-parish-a` |
| Parish B accounting D1 | `agapay-acct-staging-parish-b` |
| Registration KV | `AGAPAY_REGISTRATIONS_STAGING` |
| Accounting attachments R2 | `agapay-accounting-attachments-staging` |

The public target is
`https://agapay-site-staging.joeldunnesq.workers.dev`. The real resource IDs
are committed only inside `[env.staging]` in `wrangler.toml`.

If the resources ever need to be recreated in a different Cloudflare account,
run these commands once and replace only the corresponding IDs under
`[env.staging]`:

```sh
npx wrangler d1 create agapay-staging
npx wrangler d1 create agapay-acct-staging-parish-a
npx wrangler d1 create agapay-acct-staging-parish-b
npx wrangler kv namespace create AGAPAY_REGISTRATIONS_STAGING
npx wrangler r2 bucket create agapay-accounting-attachments-staging
```

Do not reuse a production ID or bucket name. Confirm all five resources with
`wrangler d1 list`, `wrangler kv namespace list`, and
`wrangler r2 bucket list` before editing configuration.

## Deploy and migrate

The separate `Deploy accounting release-gate staging` workflow runs on manual
dispatch or a push to the dedicated `staging` branch. It:

1. runs `npm run check`;
2. installs the idempotent empty-D1 prerequisites documented below;
3. applies `migrations/` to `agapay-staging`;
4. applies `accounting-migrations/` independently to both parish databases;
5. deploys with `wrangler deploy --env staging`.

The prerequisites are necessary because two historical migration sequences
assume state that production already had when they were introduced:

- the retained central `0003_stewardship.sql` is a compatibility table rebuild,
  so `scripts/accounting-staging-central-bootstrap.sql` creates the original
  empty stewardship/settings tables first, and the existing annual-meeting
  schema migration is pre-applied before historical seed files;
- accounting migration `0006` expects the default chart and fund created by
  ledger initialization, so the workflow applies the existing
  `scripts/accounting-canary-bootstrap.sql` after migrations 0001–0002 and
  before the remaining accounting migrations.

Both prerequisite scripts are idempotent and target only the three literal
staging database names in the dedicated workflow.

The workflow uses the `accounting-release-gates` GitHub Environment. Store a
`CLOUDFLARE_API_TOKEN` environment secret there with D1, KV, R2, and Workers
deployment access. Do not modify the production deploy workflow.

For a local operator-driven deployment:

```sh
npm run check
npx wrangler d1 execute agapay-staging --env staging --remote --file scripts/accounting-staging-central-bootstrap.sql
npx wrangler d1 execute agapay-staging --env staging --remote --file migrations/0005_stewardship_annual_meetings.sql
npx wrangler d1 migrations apply agapay-staging --env staging --remote
npx wrangler d1 execute agapay-acct-staging-parish-a --env staging --remote --file scripts/accounting-canary-bootstrap.sql
npx wrangler d1 migrations apply agapay-acct-staging-parish-a --env staging --remote
npx wrangler d1 execute agapay-acct-staging-parish-b --env staging --remote --file scripts/accounting-canary-bootstrap.sql
npx wrangler d1 migrations apply agapay-acct-staging-parish-b --env staging --remote
npx wrangler deploy --env staging
```

## Provision the release-gate parishes

Provision both tenants through the deployed application's normal parish
registration, accounting activation, and staff-access screens. Do not insert
fixture rows directly into D1.

### Parish A

1. Register a fresh synthetic parish whose generated parish ID is `st-fiacre`.
2. Complete the normal parish administrator setup.
3. Activate Accounting through the normal product activation flow.
4. Wait until the control-plane record reports `entityStatus: ready`,
   `provisioningStatus: ready`, and `healthStatus: healthy`.
5. Create a platform-user login dedicated to the gates.
6. Create an accounting staff profile with an `ap.pay`-capable role and a
   dedicated test PIN.
7. Add only synthetic accounting data: at least one vendor, one posted bill,
   and enough bank-account configuration to create and print a check.

Parish A is intentionally named `st-fiacre` for test compatibility, but it
must not contain a copy of production St. Fiacre data.

### Parish B

1. Register a second, genuinely new synthetic parish through the same
   onboarding path and record the parish ID generated by the application.
2. Complete administrator setup and activate Accounting.
3. Confirm all three control-plane statuses are `ready`, `ready`, and
   `healthy`.
4. Create a distinct platform-user login and accounting staff/PIN profile.
5. Add Parish B's generated ID to `ACCOUNTING_TEST_PARISH_IDS` under
   `[env.staging.vars]`, then redeploy staging.

Never add `ACCOUNTING_TEST_PARISH_IDS` to the top-level production variables.
The application also rejects that widening unless `AGAPAY_ENVIRONMENT` is
explicitly non-production.

## Configure protected gate credentials

Create or open the GitHub Environment named `accounting-release-gates`.
Configure all twelve secrets from the two real onboarding sessions:

```text
ACCOUNTING_GATE_PARISH_A_ID
ACCOUNTING_GATE_PARISH_B_ID
ACCOUNTING_GATE_USER_A_EMAIL
ACCOUNTING_GATE_USER_A_PASSWORD
ACCOUNTING_GATE_USER_B_EMAIL
ACCOUNTING_GATE_USER_B_PASSWORD
ACCOUNTING_GATE_PARISH_A_PASSWORD
ACCOUNTING_GATE_PARISH_B_PASSWORD
ACCOUNTING_GATE_STAFF_A_PROFILE_ID
ACCOUNTING_GATE_STAFF_A_PIN
ACCOUNTING_GATE_STAFF_B_PROFILE_ID
ACCOUNTING_GATE_STAFF_B_PIN
```

These values belong only to the `accounting-release-gates` environment. Do not
add them as repository-wide secrets and do not expose them to `deploy.yml`.
Restrict environment deployment access to maintainers who are authorized to
run financial release gates.

## Run and retain the evidence

Manually dispatch `Accounting Release-Gate Evidence` with:

- `target_url`:
  `https://agapay-site-staging.joeldunnesq.workers.dev`
- `environment`: `accounting-release-gates`

Gate 1 must produce authenticated check-print evidence. Gate 3 must exercise
both credential sets in both directions and prove cross-parish denial. A run
reported as `blocked_missing_credentials` is not a passing release-gate run.
Download and retain the workflow artifact with the release record.
