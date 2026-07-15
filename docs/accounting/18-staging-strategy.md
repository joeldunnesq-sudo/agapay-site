# AGAPAY Accounting Package 0.75G -- Staging Strategy

## 1. Purpose

Staging exists to validate accounting architecture and migrations without touching production donor, parish, Stripe, R2, or accounting data.

This package defines the strategy and safety rails. It does not create staging Cloudflare resources.

## 2. Expected Staging Resources

Future staging should have its own:

- Worker deployment: `agapay-site-staging`
- central D1: `agapay-staging`
- at least two synthetic parish accounting D1 databases
- private accounting document bucket
- private backup bucket
- staging KV namespace where needed for non-accounting compatibility
- Stripe test-mode secrets only
- no production donor data

## 3. Deployment Flow

Recommended future flow:

1. Open a branch or PR.
2. Run `npm run check`.
3. Deploy to staging with staging bindings.
4. Apply staging migrations only to staging databases.
5. Run smoke checks against synthetic parishes.
6. Promote to production only after staging passes.

The current production workflow remains push-triggered and CI-gated. This package does not add a staging deploy workflow because real staging resource IDs do not exist in the repo yet.

## 4. Migration Flow

Accounting migration commands should be prepared through the migration guard:

```text
npm run accounting:migration-plan -- --env=staging --database=agapay-staging --remote
```

Future fan-out across per-parish accounting databases should use the same safety model:

- environment explicit
- database explicit
- production requires confirmation
- generated command reviewed before execution
- no client-supplied binding identifiers

## 5. Promotion to Production

Production promotion should remain gated by:

- full automated checks
- staging validation
- explicit production migration target
- production confirmation
- auditability of who promoted and when

## 6. Rollback Expectations

This package does not add automatic rollback. D1 migrations can be partially applied, so rollback remains a manual recovery process using the backup/restore runbook until a future migration orchestration package extends it.

Production deploy failure after successful migration must be treated as "schema may already be live"; do not assume code rollback equals database rollback.
