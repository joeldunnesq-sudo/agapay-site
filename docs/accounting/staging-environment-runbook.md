# Accounting Release-Gate Staging Environment

## Purpose and safety boundary

This environment exists only for authenticated accounting release gates and
Stripe test-mode reconciliation. It is not a production mirror. Never copy
production parish, donor, payment, or accounting data into it.

Production remains the top-level `wrangler.toml` configuration and is deployed
only by `.github/workflows/deploy.yml`. Staging is the named `staging`
environment, deploys as the distinct `agapay-site-staging` Worker, and must
always be addressed with `--env staging`.

Staging URL:

```text
https://agapay-site-staging.joeldunnesq.workers.dev
```

## Provisioned Cloudflare resources

The following commands are the one-time creation commands. If rebuilding the
environment, list resources first and never create a second resource with the
same purpose.

```sh
npx wrangler d1 create agapay-staging
npx wrangler d1 create agapay-acct-staging-parish-a
npx wrangler d1 create agapay-acct-staging-parish-b
npx wrangler kv namespace create AGAPAY_REGISTRATIONS_STAGING
npx wrangler r2 bucket create agapay-accounting-attachments-staging
```

The current resource IDs are committed only under `[env.staging]` in
`wrangler.toml`. The staging environment contains:

- `AGAPAY_DB`: `agapay-staging`
- `ACCOUNTING_DB_ST_FIACRE`: `agapay-acct-staging-parish-a`
- `ACCOUNTING_DB_RELEASE_GATE_B`: `agapay-acct-staging-parish-b`
- `AGAPAY_REGISTRATIONS`: `AGAPAY_REGISTRATIONS_STAGING`
- `ACCOUNTING_ATTACHMENTS`: `agapay-accounting-attachments-staging`

Do not bind any of these resources to the top-level production Worker.

## Migrate and deploy

Review the targets before executing:

```sh
npm run accounting:migration-plan -- --env=staging --database=agapay-staging --remote
npm run accounting:migration-plan -- --env=staging --database=agapay-acct-staging-parish-a --remote
npm run accounting:migration-plan -- --env=staging --database=agapay-acct-staging-parish-b --remote
```

Apply the central platform migrations and each parish accounting migration set:

```sh
npx wrangler d1 migrations apply AGAPAY_DB --env staging --remote
npx wrangler d1 migrations apply ACCOUNTING_DB_ST_FIACRE --env staging --remote
npx wrangler d1 migrations apply ACCOUNTING_DB_RELEASE_GATE_B --env staging --remote
npx wrangler deploy --env staging
```

The separate `deploy-staging.yml` workflow performs the same sequence after
`npm run check`. It runs on the dedicated `staging` branch or by manual
dispatch, never from a push to `main`.

## Configure Stripe test mode

In the Stripe Dashboard, enable test mode and obtain a test secret key beginning
with `sk_test_`. Never reuse the production live key.

Set it interactively so it never appears in shell history or this repository:

```sh
npx wrangler secret put STRIPE_SECRET_KEY --env staging
npx wrangler secret list --env staging
```

Then run the real parish Stripe onboarding flow for staging Parish A. This must
produce a test-mode `acct_...` Connect account and persist it through the normal
registration update path. Do not write `stripeAccountId` directly in D1.

Create test-mode charges and payouts for that connected account using Stripe's
test tools. No live-mode account or payment identifier belongs in staging.

Before and after setting the staging key, run the production command below and
compare only the returned secret names. They must be identical:

```sh
npx wrangler secret list
```

## Provision the two synthetic parishes

Use the deployed site's real registration, review, login, and activation
routes. Do not seed registration or authorization rows directly.

### Parish A

1. Register a new synthetic parish whose generated parish ID is `st-fiacre`.
2. Complete the normal admin review and activation flow.
3. Set a parish dashboard password through the normal password setup/reset flow.
4. Activate Funds & Alms through the real accounting activation path, targeting
   the prepared `agapay-acct-staging-parish-a` database.
5. Verify the accounting entity is `ready`, activation is `active`, provisioning
   is `ready`, and health is `healthy`.
6. Complete Stripe onboarding using the staging test-mode key and generate
   representative test charges and payouts.
7. Add a synthetic vendor and bill through the application UI.

### Parish B

1. Register a genuinely separate synthetic parish with the intended ID
   `release-gate-b`.
2. Complete the same normal review, password, and accounting activation flows,
   targeting `agapay-acct-staging-parish-b`.
3. Verify the same ready/active/healthy states.
4. If the real registration produces a different parish ID, replace
   `ACCOUNTING_TEST_PARISH_IDS = "release-gate-b"` in
   `[env.staging.vars]` with the actual ID and redeploy staging.

For each parish, create through the real UI/API:

- one platform user with an accounting-capable parish membership;
- one accounting staff PIN profile;
- synthetic accounting data only.

## Configure the GitHub release-gate environment

Create a GitHub Environment named `accounting-release-gates`. Add these twelve
environment secrets using the credentials produced by the real flows above:

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

Do not add these values to repository secrets used by `deploy.yml`. Production's
post-deploy smoke is intentionally allowed to remain unconfigured.

## Run the gates and reconciliation verification

Manually dispatch `.github/workflows/accounting-release-gates.yml` with:

```text
target_url: https://agapay-site-staging.joeldunnesq.workers.dev
environment: accounting-release-gates
```

Confirm gates 1 and 3 produce authenticated evidence and do not report
`blocked_missing_credentials`.

With Parish A's test Connect account containing test charges and payouts,
exercise all reconciliation paths:

1. Load the fast payout summary.
2. Load the same period with `?detail=full` and verify payout balance
   transactions are returned.
3. Attempt to close the month without a note and confirm validation rejects it.
4. Close the month with a note and confirm the stored close result.

Retain the workflow evidence artifact and update
`docs/accounting/accounting-release-gates-signoff.md` with the run date and
reviewer.

## Required isolation checks

```sh
npm run check
npx wrangler deploy --env staging --dry-run
npx wrangler secret list
```

For each `database_id` and KV `id` in `[env.staging]`, run `git grep -n` with
that exact ID. Every result must point to the `[env.staging]` block in
`wrangler.toml`. The production secret-name list must match the
pre-provisioning snapshot exactly.
