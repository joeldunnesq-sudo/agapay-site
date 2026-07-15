# AGAPAY Accounting Package 0.75G -- Environment Architecture

## 1. Purpose

Package 0.75G establishes environment awareness for future accounting work. It does not build accounting, create ledgers, provision D1 databases, add Stripe behavior, or create Cloudflare resources.

The goal is simple: accounting code should always know whether it is running in local, test, staging, or production, and it should get that answer from one configuration layer.

## 2. Environment Model

The accounting domain recognizes four environments:

| Environment | Purpose | Central database name |
|---|---|---|
| `local` | Developer machine, no production data | `agapay-local` |
| `test` | Automated checks and in-memory fixtures | `agapay-test` |
| `staging` | Cloudflare-hosted pre-production validation | `agapay-staging` |
| `production` | Live AGAPAY | `agapay-production` |

Aliases such as `dev`, `preview`, and `prod` are normalized by `src/accounting/environment.js`.

## 3. Isolation Model

Environment awareness is centralized in:

- `createAccountingConfiguration()`
- `detectAccountingEnvironment()`
- `summarizeAccountingConfiguration()`
- `createAccountingStorageRegistry()`
- `createMigrationSafetyPlan()`

Future accounting code should not read raw environment variables or branch on scattered `if production` checks. It should ask the configuration provider.

## 4. Deployment Model

Production remains the existing `agapay-site` Worker and existing production resources. A non-secret `AGAPAY_ENVIRONMENT = "production"` marker now exists in `wrangler.toml`.

Staging is documented but not bound to fake resource IDs. Before staging deployment is real, Cloudflare resources must be created deliberately and then wired with real IDs:

- `agapay-site-staging` Worker
- `agapay-staging` central D1
- future staging parish accounting D1 databases
- staging private accounting R2 bucket
- staging secrets
- staging Stripe test-mode configuration

No placeholder database IDs were added.

## 5. Storage Model

`src/accounting/storage.js` exposes a storage registry with:

- existing central D1 binding status
- existing operational R2/KV binding status
- future accounting D1 registry placeholder
- future accounting document and backup bucket placeholders
- future Queue and Workflow placeholders

This lets future accounting code depend on named abstractions instead of Cloudflare binding objects directly.

## 6. Migration Safety

`src/accounting/migration-safety.js` prepares reviewable migration plans and refuses production targeting unless `confirmProduction` is explicit. The companion script `scripts/accounting-migration-guard.mjs` prints the intended Wrangler command and never executes it.

This package does not replace the current production deploy workflow. It gives future accounting migration work a safer command-preparation path.

## 7. Future Expansion

Phase 1 can extend this architecture by:

- adding real staging bindings after resources exist
- implementing registry-backed accounting D1 resolution
- adding per-parish accounting database fixtures for staging
- extending migration safety to fan out across registry rows
- adding queue/workflow bindings once 0.75F/H/I decisions are complete
