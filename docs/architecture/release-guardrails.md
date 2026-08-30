# Release guardrails

AGAPAY production changes land through a pull request to `main`. The repository's `main` protection requires the `Quality` and `Test` checks, blocks force pushes and deletion, and keeps production deployment restricted to the protected branch.

## CI checks

`Quality` runs `npm run quality`, which enforces:

- ESLint across handwritten Worker, browser, and test code, with the recommended correctness rules enabled for new frontend/route/test boundaries.
- A fixed maximum of 14 grandfathered large-file warnings so new warnings fail CI.
- Prettier checks for the actively maintained boundaries and release workflows.
- The immutable accounting migration manifest and production migration wiring.

`Test` runs the complete tagged test manifest. Production deployment requires both jobs.

## Accounting migrations

Production accounting bindings use `accounting-migrations/` and Wrangler's native `_agapay_d1_migrations` ledger. The separate `accounting_migrations` table remains AGAPAY's domain-level provisioning audit and is not reused by Wrangler.

The first protected production release baselines migrations 0001 through 0025 only after `scripts/bootstrap-accounting-migration-ledger.mjs` verifies final-schema tables, columns, and the 0025 chart account. Empty databases are never baselined; they apply every migration from 0001. Incomplete existing databases fail closed.

For each future migration:

1. Add the next zero-padded SQL file under `accounting-migrations/`.
2. Append its filename and SHA-256 digest to `accounting-migrations/manifest.json` without changing `baselineThrough`.
3. Run `npm run quality` and `npm run check:accounting`.
4. Merge through the protected `main` branch. Staging and production apply pending migrations in filename order.

Never edit an applied migration. The manifest checksum test will reject drift.
