# AGAPAY — D1 & KV Backup and Restore Runbook

Production D1 database: `agapay-production`
(`24f514a6-6904-425b-a4c8-b3584b23c0be`), binding `AGAPAY_DB`.
Production KV namespace: `AGAPAY_REGISTRATIONS`
(`c0c630d2699a4d42a72db927c6341707`).

This runbook is manual-first by design. Nothing here automates a restore
into production — see "Guardrails" below.

## 1. Exporting the production D1 database

```
npx wrangler d1 export agapay-production --remote --output=agapay-production-YYYYMMDD.sql
```

- `--remote` is required — without it you'll export an empty local dev DB.
- This produces a full SQL dump (schema + data) you can replay elsewhere.
- For a schema-only export (useful for diffing structure without hauling
  donor/financial data around), add `--no-data`.

For KV, there's no single "export" command; list and dump by prefix:

```
npx wrangler kv key list --namespace-id=c0c630d2699a4d42a72db927c6341707 --remote > kv-keys-YYYYMMDD.json
```

Then, if you need the values too, iterate the key list and `kv key get`
each one — KV is a fallback store behind D1 for most data at this point, so
a full KV export is lower priority than the D1 export, but the parish
registration index still lives there for some lookups; don't skip it
without checking current usage in `src/lib/core.js`.

## 2. Storing backups safely

- Do not commit database exports to the `agapay-site` GitHub repo — they
  contain donor emails, parish financial data, and other PII.
- Store exports in a private location Joel already controls outside of
  GitHub (e.g. a private cloud drive folder, or an R2 bucket dedicated to
  backups — **not** `CAMPAIGN_ASSETS`, which is public-read).
- If using an R2 bucket for backups, make sure it's a *new*, non-public
  bucket (unlike `CAMPAIGN_ASSETS`) — same posture as
  `TAX_EXEMPTION_DOCS`, which is intentionally never given a public r2.dev
  URL.
- Name files with a UTC date stamp (`agapay-production-20260705.sql`) so
  retention and restore drills aren't ambiguous.

## 3. How often to back up

- **Minimum for soft launch**: a manual export before and after any
  migration you run, plus once daily during the first month of real parish
  onboarding.
- Cloudflare D1 does have built-in **time travel** (point-in-time restore
  within a retention window, typically 30 days on paid plans) as a safety
  net independent of manual exports — check your current D1 plan's
  retention window in the Cloudflare dashboard (D1 → `agapay-production` →
  Settings). Manual exports are for retention *beyond* that window and for
  taking a copy out of Cloudflare entirely.

## 4. Restoring into a temporary test database

Never restore directly into `agapay-production`. Create a scratch database:

```
npx wrangler d1 create agapay-restore-test
npx wrangler d1 execute agapay-restore-test --remote --file=agapay-production-YYYYMMDD.sql
```

This gives you a completely separate D1 database (its own database ID) to
validate against, with zero risk to production data.

## 5. Validating the restore

Run the read-only validator against the restored copy:

```
node scripts/validate-restore.mjs agapay-restore-test
```

This checks (see the script for the exact queries):

- expected tables exist
- migration status is current (`wrangler d1 migrations list`)
- primary identifiers (`registrations.reference`, `donors.email`) aren't null
- `stripe_subscription_id` / `stripe_account_id` are unique where non-null
- no duplicate `stripe_events` rows
- every `learn_children.household_id` resolves to a real `learn_households` row
- `commerce_orders.parish_id` and `settlement_profiles.parish_id` are never null
- `tax_exemptions.registration_reference` resolves to a real `registrations` row

**Update (2026-07-07, first real restore drill)**: run against a real
production export for the first time. The restore itself worked cleanly
(512 queries, 1805 rows written, no errors). `validate-restore.mjs` failed
all 10 checks — but with `spawnSync npx ENOENT` on every single one, not a
data or schema problem. Root cause: `execFileSync("npx", ...)` doesn't go
through a shell by default, and on Windows `npx` resolves to `npx.cmd` (a
batch file) — Node can't launch that directly without `shell: true`, even
though typing `npx` yourself in the same terminal works fine. Fixed in
both call sites in the script (`shell: process.platform === "win32"`,
harmless no-op on macOS/Linux where `npx` is a real executable). This
exact scenario is what the original caveat below warned about — an ENOENT
on every check, not a plausible data failure, was the tell that it was the
script and not the restore. **Still needs**: a re-run with the fix to
confirm all 10 checks actually pass against real data — this fix has only
been verified by code inspection (no cmd.exe-hostile characters in any of
the SQL strings passed through), not by re-running it.

**Original caveat**: this script was written against the current
`migrations/*.sql` schema but had not yet been run against a real restore —
there's no restore drill scheduled yet to test it end to end. Treat the
first real run as the actual validation of the script itself, not just the
data. If a query fails with a syntax or column-name error rather than a
genuine data problem, that's the script needing a fix, not a broken
restore — check the error text.

## 6. Comparing record counts

Quick sanity check against the live production count for key tables before
trusting a restore:

```
npx wrangler d1 execute agapay-production --remote --command "SELECT 'registrations' t, COUNT(*) n FROM registrations UNION ALL SELECT 'donors', COUNT(*) FROM donors UNION ALL SELECT 'donor_offerings', COUNT(*) FROM donor_offerings UNION ALL SELECT 'commerce_orders', COUNT(*) FROM commerce_orders"
```

Run the same query against `agapay-restore-test` and compare. Counts
should match exactly for a restore taken at the same point in time as the
export; if production has since accepted new writes, the restore should
be a subset, never more.

## 7. Verifying critical relationships

Beyond what `validate-restore.mjs` checks automatically, spot-check by
hand after a real incident (not needed for a routine drill):

- Pick 2–3 real parish `reference` values and confirm their
  `settlement_profiles`, `tax_exemptions`, and `commerce_orders` rows are
  all present and consistent with what you remember from the dashboard.
- Pick a Learn household and confirm its children, lesson blocks, and any
  transcripts survived the restore.

## 8. Per-domain checklist

| Domain | Table(s) | What "intact" means |
|---|---|---|
| Donor | `donors`, `donor_offerings` | email is PK, no orphaned offerings |
| Parish | `registrations` | one row per parish, `stripe_account_id` set for onboarded parishes |
| Donation | `donor_offerings`, `commemorations` | linked to a real donor/parish |
| Subscription | `registrations.stripe_subscription_id` | unique, matches Stripe dashboard for a sample of parishes |
| Learn | `learn_households`, `learn_children`, `learn_school_years`, etc. | household → children FK intact |
| Student | `learn_children`, `learn_transcripts`, `learn_report_cards` | transcripts reference a real child |
| Settlement | `settlement_profiles`, `settlement_profile_modules` | `parish_id` populated |
| Tax | `tax_exemptions`, `tax_exemption_documents` | `registration_reference` resolves |
| Bookstore/commerce | `commerce_orders`, `commerce_order_items`, `commerce_products` | `parish_id` populated, order totals internally consistent |

## 9. If a migration fails

1. **Stop.** Do not run further migrations against production.
2. Check `wrangler d1 migrations list agapay-production --remote` to see
   exactly which migration is marked applied vs. pending.
3. If the failure was a syntax/logic error in the migration file itself and
   no partial data change happened (common for `CREATE TABLE IF NOT
   EXISTS` — it's idempotent), fix the `.sql` file and re-run.
4. If the migration partially applied (e.g. it created a table but a
   later `ALTER` in the same file failed), do **not** attempt to
   auto-rollback D1 — Cloudflare D1 does not support transactional DDL
   rollback the way Postgres does for some operations. Instead:
   - Export current state (`wrangler d1 export`) before touching anything
     further, so you have a snapshot of the partially-migrated state.
   - Write a small forward-fixing migration (see "Forward repair" below)
     rather than trying to undo the partial change.
5. Only after production is stable again, restore the earlier backup into
   `agapay-restore-test` and diff schemas to understand exactly what the
   failed migration was supposed to do vs. what actually landed.

## 10. Forward repair when rollback is unsafe

D1 migrations in this repo are additive (`CREATE TABLE IF NOT EXISTS`,
`ALTER TABLE ... ADD COLUMN`) by convention — see any file under
`migrations/`. That convention is what makes forward repair the right
default instead of rollback:

- Write a new migration file (next number in sequence, e.g. `0014_*.sql`)
  that finishes or corrects what the failed one started — add the missing
  column, backfill it, whatever's needed.
- Never edit an already-applied migration file in place; D1's migration
  tracking is based on the file having already run. Editing history without
  a corresponding forward migration will desync `wrangler d1 migrations
  list` from reality.
- If data was corrupted (not just schema), consider a targeted read from
  the last good backup to backfill just the affected rows, rather than a
  full restore.

## Guardrails (why this runbook doesn't automate restores)

- `scripts/validate-restore.mjs` refuses to run against
  `agapay-production` by name or database ID — no override flag exists.
- Nothing in this repo issues a destructive restore command automatically.
  Every restore step above is a command Joel runs by hand, deliberately.
