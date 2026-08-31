# Release guardrails

AGAPAY production changes land through a pull request to `main`. The repository's `main` protection requires the `Quality` and `Test` checks, blocks force pushes and deletion, and keeps production deployment restricted to the protected branch.

## CI checks

`Quality` runs `npm run quality`, which enforces:

- ESLint across handwritten Worker, browser, and test code, with the recommended correctness rules enabled for new frontend/route/test boundaries.
- An explicit file/rule warning baseline, so new warnings cannot replace resolved warnings elsewhere.
- Prettier checks for the actively maintained boundaries and release workflows.
- The immutable accounting migration manifest and production migration wiring.

`Test` runs the complete tagged test manifest. Production deployment requires both jobs.

`npm run lint` uses `scripts/lint.mjs` to check all handwritten JavaScript under
`src`, `public`, and `scripts`, plus `server.mjs`. The ESLint configuration still
excludes `public/vendor`. Every diagnostic remains visible. Errors always fail;
warnings must exactly match the file/rule counts in
`config/lint-warning-baseline.json`. The baseline records existing `max-lines`
warnings, including the six previously uncovered Admin, Donor, Learn, and Listen
warnings. It does not disable rules or permit source growth.

When cleanup resolves a warning, remove or reduce its baseline entry in the same
change; stale allowances fail lint. Do not regenerate the baseline automatically
to make CI pass. Any new allowance needs explicit review. Physical source-size
ceilings remain enforced separately by `config/source-size-budgets.json` and
should decrease when legacy code is removed. Use `npm run lint -- --no-cache` for
an uncached run; `npm run quality` always does this.

## Accounting migrations

Production accounting bindings use `accounting-migrations/` and Wrangler's native `_agapay_d1_migrations` ledger. The separate `accounting_migrations` table remains AGAPAY's domain-level provisioning audit and is not reused by Wrangler.

The first protected production release baselines migrations 0001 through 0025 only after `scripts/bootstrap-accounting-migration-ledger.mjs` verifies final-schema tables, columns, and the 0025 chart account. The historical Phase G canary is the sole narrower exception: its documented migration-0014 foundation plus the exact later selectively applied schema markers are fingerprinted before those known migrations are recorded and Wrangler applies only the missing files. Empty databases are never baselined; they apply every migration from 0001. Any unrecognized incomplete database fails closed and emits non-sensitive schema evidence for diagnosis.

For each future migration:

1. Add the next zero-padded SQL file under `accounting-migrations/`.
2. Append its filename and SHA-256 digest to `accounting-migrations/manifest.json` without changing `baselineThrough`.
3. Run `npm run quality` and `npm run check:accounting`.
4. Merge through the protected `main` branch. Staging and production apply pending migrations in filename order.

Never edit an applied migration. The manifest checksum test will reject drift.
