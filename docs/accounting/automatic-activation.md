# Automatic Accounting activation

The parish dashboard starts the wizard after an in-page plan activation and whenever an entitled parish first opens Accounting without ready books. GET requests only inspect status. The administrator confirms the start date and fiscal-year start month before POST starts resource creation.

The flow prepares isolated books, secures a named Accounting administrator, and offers either the parish starter chart or a reviewed Aplos/QuickBooks chart-of-accounts CSV. Opening balances remain pending; the wizard neither posts transactions nor changes Stripe billing or bank connections. Imported account types are suggestions until the administrator confirms them. Balance columns are ignored explicitly. Subaccount names are preserved as names; the importer does not infer account hierarchy or replace system accounts. Review cash-flow classifications in Accounting Setup before recording activity.

## Production prerequisite

The private `agapay-accounting-provisioner` Worker needs the secret `ACCOUNTING_D1_API_TOKEN`, scoped to D1 write/edit on the AGAPAY Cloudflare account only. Do not copy the CI deployment token into this secret. Keep the token out of chat, source control, logs and the main application Worker. An operator can enter it through Cloudflare's Worker settings, or interactively:

```powershell
npx wrangler secret put ACCOUNTING_D1_API_TOKEN --config wrangler.accounting-provisioner.json
```

Deploy the private Worker before installing its secret. The release deployment identity must also be allowed to manage Workflows and Worker service bindings. No public route, workers.dev endpoint or preview URL is enabled on the provisioner. Its RPC entrypoint is bound only to the main application.

Without the secret, the welcome screen explains that automatic setup awaits platform configuration and disables resource creation. It does not reserve a partial Accounting entity. Existing statically bound books continue using native D1 access. Do not call a production activation complete merely because this disabled welcome screen renders.

## Resource lifecycle and release operation

- One deterministic Workflow and D1 name per parish/environment. Central entity, database registry and operation reservation are atomic. No submitted database UUID or environment is accepted.
- Each durable step rechecks parish verification, entitlement, closure and entity lifecycle. D1 creation records the provider ID before writing owner metadata. Existing unowned books require support review; they are not adopted, overwritten or deleted automatically.
- Apply every checksum-verified migration in `accounting-migrations/manifest.json`, including required chart seeding before migration 0006. Each migration and its migration records commit as a batch. An interrupted workflow reuses its database and migration journal.
- Fiscal periods follow the selected year-start month. Only the chosen starting period opens. Existing giving funds are copied into the isolated ledger without posting giving history. Integration posting remains off and review-required.
- Ownership, SQLite integrity, foreign keys, ledger foundation and migration checksums must pass before the central registry becomes ready. Staff bootstrap remains unavailable until then.
- The private service resolves managed databases through the registry and verifies stored owner/environment/operation metadata before executing server-owned SQL. The public API never exposes its credential or provider ID. Recurring and integrity schedulers use the same managed resolution path.
- The production release workflow migrates all ready, non-closed wizard-managed books before deploying the updated provisioner and application. A failed migration leaves that database unavailable. Run `node scripts/build-accounting-provisioning-schema.mjs` whenever a migration is added; CI rejects a stale generated bundle.
- No database deletion occurs on setup failure. Stop investigation on an ownership-review result; independently verify the physical resource and central operation before an operator repairs the association. Never clear identity checks just to make a retry proceed.

CSV import uses the existing migration-session and source-account mapping tables. The wizard's stricter chart import path re-parses the original CSV at commit time, validates duplicate references/numbers/names, conflicts, active posting accounts and category compatibility, and verifies the preview fingerprint. One transaction creates accounts, maps source references, and records the named import author. Retrying the same confirmed commit is idempotent. Up to 250 accounts and 1 MB per CSV; unsupported headers can be mapped manually. Neither raw CSVs nor PINs enter the central provisioning operation or Workflow payload. The raw CSV is held in browser memory for review, released after import, and must be reselected after a refresh. Completed chart imports are detected on resume.

## Verification

```powershell
node scripts/accounting-activation-tests.mjs
node scripts/accounting-activation-access-tests.mjs
node scripts/accounting-activation-workflow-tests.mjs
node scripts/parish-dashboard-runtime-tests.mjs
node scripts/run-tests.mjs all
npm run quality
node scripts/accounting-activation-preview.mjs
```

The local browser fixture runs at `http://127.0.0.1:8792`, uses in-memory SQLite and fake staff credentials, and never calls production. Its links cover welcome, interrupted progress, import, and a prepared CSV preview; the narrow-layout toggle tests a 390-pixel container. Actual provisioning tests execute the Workflow with fake Cloudflare transport and real SQLite migrations, including interruption, resume, and cross-parish refusal.

After configuring the private credential and deploying main, use **test-lubbock** for the production smoke test: confirm the proposed date/month, create its books once, verify refreshed status resumes, create a named administrator, preview a representative exported CSV, and review every link/category before importing. Verify zero posted journals and pending opening balances afterward. Do not run staging's mutating release suite against production, submit real transactions, or change Stripe billing as part of this smoke test. Live activation and a representative real Aplos/QuickBooks export remain separate checks from the local fixture tests.

### Implementation verification, 2026-08-31

After rebasing onto the dashboard recovery changes, all 159 local regression commands, the quality gate, and the dedicated dashboard browser suite passed. Both Workers passed Wrangler dry builds. The manual local browser walkthrough covered activation progress, staff creation, a CSV preview at desktop and 390-pixel widths, confirmation enforcement, an import that created two accounts and linked one, and completion without posted balances.

The private Worker and its Workflow were deployed successfully. A dedicated account-owned D1 Write token was installed as the encrypted `ACCOUNTING_D1_API_TOKEN` secret on the private provisioner only; its value was not stored in source, chat, or deployment logs. PR #103 merged as `dd1d4e20c7e931de4204952ea8801450e573afc2`, and the production pipeline and public health smoke passed. The public health endpoint reported that exact build.

The live **test-lubbock** activation completed in 17 seconds, using start date `2026-08-30` and a January fiscal year. Refreshing the wizard resumed the same operation and reached named staff setup. Read-only SQL verified 25 migrations, 34 starter accounts, 12 fiscal periods, zero journal entries, pending opening balances, and a successful SQLite quick check. No Stripe settings or charges were changed. Named staff setup and a real exported CSV walkthrough still require the administrator's PIN and chosen export; representative CSV imports were verified in the local fixture.

The wizard shares the dashboard's `--serif`, `--sans`, `--deep`, `--gold`, `--cream`, and `--paper` tokens. The local preview loads the same font families so visual verification does not silently fall back to Arial.
