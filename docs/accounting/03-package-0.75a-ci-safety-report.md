# AGAPAY Accounting Package 0.75A — CI Safety Report

## 1. Executive Summary

**Before this package:** the only workflow GitHub Actions actually executes, `.github/workflows/deploy.yml`, ran on every push to `main` and unconditionally applied D1 migrations to the production database, then deployed the Worker — with no test step anywhere in that workflow. A separate workflow (`.github/workflows/smoke-check.yml`) did run the full `npm run check` suite, but only on manual `workflow_dispatch`, never automatically, and never as a gate on deploy. A failing test, a broken migration, or a bad commit could reach production with nothing in the pipeline to stop it.

**Now enforced:** production migrations and deployment are a separate GitHub Actions job (`deploy`) that explicitly `needs: test`. GitHub Actions' own default behavior means `deploy` is skipped — not attempted, not partially run — whenever `test` fails, is cancelled, or does not complete successfully. `test` runs `npm ci` (deterministic install, now that a committed lockfile exists) and the full `npm run check` suite, which now also includes a new, additive migration-integrity check (`scripts/migration-integrity.mjs`). **Yes, tests now block both migrations and deployment**, verified locally by inspection of the job-dependency semantics (GitHub Actions' `needs:` skip behavior is a platform guarantee, not something this workflow file has to implement itself) and by running every check this workflow depends on, successfully, in this session.

**Remaining manual GitHub settings:** several recommended repository settings (branch protection, required status checks) cannot be enforced through files in this repository and require Joel's action in the GitHub UI or API — listed in full in Section 12. None of them are strictly required for the workflow-level fail-closed guarantee above to hold (that guarantee is enforced by the workflow file itself, not by branch protection), but they close a different gap: preventing someone from merging a PR whose checks failed, or pushing directly to `main` bypassing PR review entirely.

## 2. Previous Workflow

`.github/workflows/deploy.yml` (the file GitHub Actions actually reads — a second, non-functional copy exists at `workflows/deploy.yml` at the repository root, outside `.github/`, which GitHub Actions never executes; this stray file was the source of the Phase 0 architecture audit's less urgent framing of this issue, since Phase 0 examined that file instead of the real one):

```yaml
on:
  push:
    branches: [main]
jobs:
  deploy:
    steps:
      - checkout
      - setup node
      - apply D1 migrations (wrangler, --remote, unconditional)
      - deploy Worker (wrangler)
```

**Risks:** no test execution of any kind; a single job with no internal gate between migration and deploy; migrations and deploy both ran on every push regardless of code correctness; no concurrency protection (two rapid pushes could, in principle, race); no explicit `permissions:` block (GitHub Actions' default token permissions applied, which are broader than this workflow needs); no distinction between a PR's checks and a push's production actions, because PRs triggered nothing at all.

## 3. Implemented Changes

1. **`.github/workflows/deploy.yml` rewritten** to add a `test` job, make `deploy` depend on it via `needs: test`, restrict `deploy` to actual pushes to `main` (`if: github.event_name == 'push' && github.ref == 'refs/heads/main'`), add a least-privilege top-level `permissions: contents: read` block, add a `deploy`-job-scoped `concurrency` group preventing overlapping production runs, and add a `whoami` Cloudflare-authentication check as the first production step (fails fast and clearly if the token is bad, before attempting a migration).
2. **`scripts/migration-integrity.mjs` created** — a new, non-destructive, non-brittle check (never opens a real database, never applies a migration) verifying every migration file is present/readable/non-empty, that the deploy workflow's migration target matches `wrangler.toml`'s configured database name, and reporting (as a non-blocking warning) the pre-existing duplicate numeric-prefix migration filenames already in production history.
3. **`package.json`'s `check` script updated** to include the new migration-integrity script in the standard gate, so it runs both locally (`npm run check`) and in CI identically — one gate, not two.
4. **`package-lock.json` generated and un-ignored** — previously `.gitignore` excluded it (confirmed: it was listed twice in `.gitignore`), which made `npm ci` (a deterministic-install command Requirement 6 explicitly calls for) impossible, since `npm ci` requires a committed lockfile. `.gitignore` updated with a comment explaining why the lockfile is now tracked.

## 4. Final CI/CD Sequence

```
Push to main                          Pull request to main
      │                                        │
      ▼                                        ▼
 ┌─────────┐                            ┌─────────┐
 │  test   │  (npm ci, npm run check)   │  test   │  (same job, same steps)
 └────┬────┘                            └─────────┘
      │ needs: test (must succeed)             │
      ▼                                          ▼
 ┌───────────────────────────┐          (workflow ends here --
 │ deploy                     │           no deploy job runs for
 │  - only if push to main    │           a pull_request event)
 │  - concurrency-limited     │
 │  - wrangler whoami         │
 │  - apply D1 migrations     │
 │  - deploy Worker           │
 └───────────────────────────┘
```

If `test` fails, is cancelled, or does not complete: `deploy` does not run — this is GitHub Actions' default `needs:` behavior, not custom logic in this file, so it cannot be silently bypassed by a future edit that forgets to re-implement it.

## 5. Test Gate

**Exact commands run in the `test` job:**
- `npm ci` — deterministic install from the now-committed `package-lock.json`.
- `npm run check`, which runs, in order: `scripts/require-node-22.mjs` (Node-version guard) → `node --check src/worker.js` (syntax check) → `scripts/route-map-integrity.mjs` (verifies every static-file route target actually exists under `public/`) → **`scripts/migration-integrity.mjs` (new)** → `scripts/check.mjs` (the main assertion suite, source-scanning and behavioral checks) → `scripts/check-learn.mjs` → `scripts/worker-hardening-tests.mjs` (exercises `src/worker.js`'s `fetch()` handler directly against constructed `Request` objects with fake `env` values) → `scripts/settlement-profiles-tests.mjs` and `scripts/tax-exemption-tests.mjs` (both use Node's built-in `node:sqlite` to run real migration SQL against a real, throwaway, in-process SQLite database — this is genuine behavioral validation, not merely text-pattern assertions) → `scripts/tax-exemption-route-tests.mjs` → `scripts/tax-readiness-tests.mjs`.

**Why these are required, and why they're safe without production credentials:** every script above was inspected for `fetch()`/network calls, `process.env` usage, and any reference to Cloudflare or live Stripe credentials. Confirmed: Stripe calls in these scripts are always mocked (`env.STRIPE_SECRET_KEY = "sk_test_123"` or equivalent fake values, with `fetch` itself intercepted/mocked in the relevant test files, e.g. `scripts/tax-exemption-tests.mjs`'s documented "fetch() mock for Stripe calls"); D1-backed modules are tested against real SQLite via `node:sqlite`, not a real Cloudflare D1 database; no script reads `CLOUDFLARE_API_TOKEN` or any production secret. **The `test` job's workflow definition does not pass any secret to it at all** — there is nothing to leak even if a future script accidentally tried to read one, since GitHub Actions secrets are only available to a job if explicitly referenced in that job's steps, and none are.

## 6. Migration Safety

**Validation performed before production migration:** the new `scripts/migration-integrity.mjs`, running as part of `npm run check` in the `test` job (so it must pass before `deploy` even becomes eligible to run) — confirms every `.sql` file under `migrations/` is present, UTF-8 readable, and non-empty; confirms the deploy workflow's `d1 migrations apply agapay-production` command target matches `wrangler.toml`'s configured `database_name`, catching a copy-paste/typo mismatch before it could silently target the wrong database; and reports (non-fatally) pre-existing duplicate numeric-prefix migration filenames already applied in production history, so a human notices without CI failing over already-shipped history.

**Migration ordering:** unchanged from the existing workflow — migrations apply, then the Worker deploys. This matches the safe, intended order (schema changes land before the code that depends on them starts serving traffic) and did not need to be reversed; the previous workflow already had this ordering correct, which this package explicitly confirms rather than silently assuming.

**Behavior if the production migration command fails:** the `deploy` job's steps run sequentially within one job; a failed "Apply D1 migrations" step stops that job immediately (GitHub Actions' default `continue-on-error: false`), so the subsequent "Deploy with Wrangler" step never runs. The workflow run is marked failed, visible in the Actions tab, with the failing step's own log output (Cloudflare/Wrangler's own error message) — no custom error-swallowing was added.

**No automatic database rollback exists, and none was added.** If a migration step fails partway (e.g., a multi-statement migration file where an early statement succeeds and a later one fails), whatever portion of that migration Cloudflare D1 already applied remains applied — this package does not add, and explicitly was not asked to add, any automatic rollback mechanism. The existing `docs/BACKUP_RESTORE_RUNBOOK.md` process (pre-existing, not modified by this package) remains the correct manual path for diagnosing and recovering from a partially-applied migration.

## 7. Secret and Permission Safety

- **Top-level `permissions: contents: read`** — the least-privilege default for this repository's workflow, since nothing in either job needs to write to the repository, comment on PRs, or publish packages.
- **`test` job receives no secrets** — no `CLOUDFLARE_API_TOKEN`, no Cloudflare account ID, no production database identifiers, no deployment credentials are referenced anywhere in the `test` job's step definitions.
- **`deploy` job's Cloudflare secret usage is unchanged from before** (`secrets.CLOUDFLARE_API_TOKEN`, referenced only in the three `wrangler-action` steps that need it) — this package did not widen or narrow that job's existing secret access, only added a gate in front of it.
- **No secret values appear in any new log output** — the new `scripts/migration-integrity.mjs` script never reads or prints any secret; its only inputs are filenames and file contents from the `migrations/` directory and `wrangler.toml`, none of which contain secrets (confirmed in the prior Phase 0 audit and reconfirmed here — `wrangler.toml` holds only non-secret `[vars]`).
- **Pull requests from forked repositories** cannot access repository secrets under GitHub's own default behavior for the plain `pull_request` trigger (as opposed to `pull_request_target`, which this workflow does not use) — this is a platform guarantee this workflow relies on rather than reimplements, and is further reinforced here by the fact that the `test` job (the only job a `pull_request` event can trigger) references no secrets at all regardless.

## 8. Concurrency Behavior

Only the `deploy` job is concurrency-restricted, under the group name `agapay-production`, with `cancel-in-progress: false`. This means: at most one production migration-and-deploy sequence runs at a time; if a second push to `main` arrives while a `deploy` run is already in progress, the second run's `deploy` job **waits** for the first to finish rather than being cancelled mid-migration. This was a deliberate choice over cancellation, documented inline in the workflow file itself: cancelling a GitHub Actions job partway through a `wrangler d1 migrations apply` call could leave production in an ambiguous state (migration partially applied, no clear record of exactly where it stopped), which is a worse outcome than a short queueing delay for the second push. The `test` job is intentionally left unrestricted — it is non-destructive, so any number of pushes or pull requests can run their test jobs fully in parallel without risk.

## 9. Pull Request Behavior

Pull requests targeting `main` now trigger the `test` job (previously, pull requests triggered nothing in this workflow at all). The `deploy` job's `if: github.event_name == 'push' && github.ref == 'refs/heads/main'` condition means it is structurally unreachable from a `pull_request` event — not merely unlikely, but impossible for this workflow to deploy or migrate anything in response to a pull request, regardless of the PR's source branch or fork status. As covered in Section 7, no production secret is exposed to the `test` job a pull request triggers, closing the "untrusted fork" concern by simply never handing that job anything sensitive in the first place.

## 10. Validation Performed

| Check | Result |
|---|---|
| Full `npm run check` suite, run locally in this session | **PASS** — 125 `PASS` assertions, 0 failures, exit code 0 |
| `npm run check` re-run after all changes (package.json, new script, lockfile) | **PASS** — exit code 0, same result |
| Fresh `npm ci` from a clean `node_modules` state | **PASS** — exit code 0, 0 vulnerabilities reported |
| New `scripts/migration-integrity.mjs` run standalone | **PASS** — confirms 27 migration files, confirms workflow/wrangler.toml database-name match, reports 4 pre-existing duplicate-prefix warnings (non-fatal, expected) |
| YAML syntax validation of the new `.github/workflows/deploy.yml` | **PASS** — parsed successfully with Python's `pyyaml`; confirmed job structure, `needs`, `if`, and `permissions` fields parse as intended |
| `actionlint` (GitHub Actions-specific linter) | **Not available in this environment and not installed**, per the instruction to avoid installing unnecessary tooling solely for linting; YAML-syntax validation via `pyyaml` was used as the available substitute. Recommend running `actionlint` (or GitHub's own workflow validation, which runs automatically on the next push) as a follow-up confirmation once this change is pushed. |
| Every command referenced in the workflow exists | `npm ci` and `npm run check` — confirmed by direct local execution. `wrangler whoami` and `wrangler d1 migrations apply <db> --remote` — confirmed as valid Wrangler v4 CLI syntax by inspection (consistent with the pre-existing migration-apply command already in production use); **not executed live against Cloudflare in this session**, since doing so would require production credentials this package should not use, per explicit scope constraints. |
| No production resource modified | Confirmed — no `wrangler` command targeting Cloudflare was executed in this session; no `git commit` or `git push` was performed. |

## 11. Failure-Path Results

- **Scenario A — a test fails:** `test` job fails → `deploy` job is skipped (GitHub Actions default `needs:` behavior) → no migration, no deployment. **Confirmed by design**, not independently simulated against a live GitHub Actions run in this session (no GitHub Actions execution was performed at all, per scope), but this is the platform's own documented, unconditional behavior for a job with an unmet `needs:` dependency.
- **Scenario B — migration validation fails:** the new `scripts/migration-integrity.mjs` runs inside `npm run check`, inside the `test` job — a failure there is indistinguishable, from the pipeline's perspective, from any other test failure in Scenario A, and produces the same fail-closed result.
- **Scenario C — the production migration command itself fails:** the `deploy` job's "Apply D1 migrations" step fails → the job stops there (default step failure behavior) → "Deploy with Wrangler" never runs → the workflow run shows as failed, with Wrangler's own error output visible in that step's log (no secret values are echoed by `wrangler-action`, consistent with its documented behavior).
- **Scenario D — deployment fails after migrations succeed:** the workflow run shows as failed at the "Deploy with Wrangler" step; **this package does not, and was explicitly told not to, add any automatic rollback** — the correct response is exactly what Section 6 states: treat the migration as already applied, and use the existing `docs/BACKUP_RESTORE_RUNBOOK.md` process to assess and recover if needed. This report does not overstate what the pipeline does here; it does not pretend a rollback happened.
- **Scenario E — two pushes to `main` close together:** the second `deploy` job waits behind the first (Section 8) — no overlapping production migration or deploy is possible under this configuration.
- **Scenario F — a pull request from an untrusted fork:** only `test` runs; no secret is available to it; `deploy` is structurally unreachable from a `pull_request` event regardless of the PR's origin.

## 12. Manual Repository Settings

**None of the following are configured by this package** — GitHub repository settings (branch protection, required status checks, environment approval rules) live outside this repository's files and were not modified, per the explicit instruction not to create GitHub repository settings through the API unless separately authorized, and because this environment has no authenticated GitHub access to even query the current state (confirmed: `gh` CLI is not available/authenticated here). The following are recommended, not claimed to already be in effect:

- **Require the `test` status check to pass before merging to `main`.** GitHub setting: *Settings → Branches → Branch protection rules → `main` → Require status checks to pass before merging*, selecting the `Test` job from this workflow. This is the setting that actually prevents a human from merging a PR whose tests failed — the workflow-level `needs:` gate (already in place) only stops an *automatic deploy*, it does not stop someone from merging bad code to `main` in the first place if branch protection isn't also configured.
- **Require a pull request before merging (restrict direct pushes to `main`).** Same location. For a one-developer repository, this is a real tradeoff: it adds a small amount of process overhead (opening a PR instead of pushing directly) in exchange for guaranteeing the `test` job runs and is visible before anything reaches `main`. Given this program's stated goal (fail-closed production safety for a system that will hold financial data), the recommendation is to enable this — but it is explicitly optional and Joel's call, not a requirement of this package.
- **Pull request review requirement:** **not recommended to require** for a one-developer repository specifically — requiring a second approver with no second developer would either block all merges or force a meaningless self-approval workflow. If AGAPAY gains a second contributor, this should be revisited.
- **Environment protection rules (GitHub Environments with required reviewers/wait timers) for production deploys:** not configured by this package (would require creating a GitHub "Environment" named e.g. `production` and referencing it from the `deploy` job, which is a repository-settings change plus a workflow change beyond this package's scope). Flagged as a reasonable future enhancement if Joel wants a manual approval step in addition to the automated test gate — noted as an open decision in `docs/accounting/02-phase-0.75-foundational-readiness.md` Section 5, not resolved here.
- **Confirm `CLOUDFLARE_API_TOKEN` secret scope** in the repository's Actions secrets settings — this package did not and cannot inspect the token's actual Cloudflare-side permissions from this environment; recommended as a manual verification step (flagged as an open item in the Phase 0.75 threat model, `02b`, threat #9).

## 13. Changed Files

| File | Why it changed |
|---|---|
| `.github/workflows/deploy.yml` | Rewritten to add the `test` job, the `needs: test` dependency, PR triggering, least-privilege `permissions`, deploy-job concurrency control, and a pre-migration Cloudflare auth check — this is the core deliverable of this package. |
| `package.json` | Added `scripts/migration-integrity.mjs` to the `check` script, so the new migration-integrity check runs identically in local development and in CI. |
| `.gitignore` | Un-ignored `package-lock.json` (previously listed twice) so `npm ci` can be used for deterministic installs, with an explanatory comment. |
| `package-lock.json` (new) | Generated by `npm install` in this session; now tracked so `npm ci` has a lockfile to install from. |
| `scripts/migration-integrity.mjs` (new) | New, non-destructive migration-integrity check (Section 6) — the only genuinely new application-adjacent code in this package. |
| `docs/accounting/03-package-0.75a-ci-safety-report.md` (new) | This report. |

No other file was modified. No accounting table, accounting route, identity system, R2 bucket, Queue, Workflow, or second Worker was created, consistent with this package's explicit exclusions.

## 14. Deferred Items

- **Full local D1 migration validation** — actually applying every migration file, in sequence, against a throwaway local D1/SQLite database as part of CI, rather than the lighter-weight structural checks this package adds — is deferred to **Package 0.75G (Staging and Local Development)**, per the Package 0.75A brief's own instruction to document this limitation and defer it there. The existing `node:sqlite`-based tests in `scripts/settlement-profiles-tests.mjs` and `scripts/tax-exemption-tests.mjs` already validate a meaningful subset of migrations behaviorally; extending that coverage to every migration file, in applied order, is real additional work belonging to 0.75G's local/staging environment design.
- **Resolving the pre-existing duplicate numeric-prefix migration filenames** (e.g., two different `0003_*.sql` files) — not fixed here, since renaming already-applied production migration files is a nontrivial, separate risk this package's scope explicitly excludes ("do not invent brittle validation," "do not apply any migration"). The new integrity script surfaces these as warnings so they're visible without forcing a fix.
- **GitHub Environment-based deployment approval** — noted as a possible future enhancement in Section 12, not implemented.
- **Deleting the stray, non-functional `workflows/deploy.yml`** at the repository root (outside `.github/`) — this file is never executed by GitHub Actions and was the source of the Phase 0 audit's confusion about which workflow was real. Removing it would reduce future confusion, but doing so is a small, separate cleanup this package did not treat as in-scope (it's not part of the CI safety mechanism itself); recommended as a quick, low-risk follow-up whenever convenient.
- **`actionlint` verification** — not run in this session (unavailable, and not installed per instruction); recommend confirming via GitHub's own workflow-syntax validation on the next actual push, or by installing `actionlint` locally at Joel's convenience.

## 15. Acceptance Criteria

- Full test suite runs before production work. **PASS**
- Failed tests prevent production migrations. **PASS**
- Failed tests prevent deployment. **PASS**
- Migration validation occurs before production application where practical. **PASS**
- Failed production migration prevents deployment. **PASS**
- Production deployments cannot overlap. **PASS**
- Pull requests cannot deploy. **PASS**
- Pull requests cannot access production secrets. **PASS**
- Workflow YAML is valid. **PASS**
- Existing tests pass. **PASS**
- No production resource was modified during implementation. **PASS**
- No accounting functionality was added. **PASS**

## 16. Final Verdict

**Package 0.75A complete with manual settings required.**

The workflow-level fail-closed guarantee (no migration or deployment without a passing test job) is fully implemented, locally validated, and does not depend on any GitHub repository setting to hold — it is enforced by the workflow file's own `needs:` dependency, which is a GitHub Actions platform guarantee. What remains outside this package's reach is repository-level policy (branch protection, required-status-check enforcement on merges, PR-only pushes to `main`) — these close a different gap (stopping a human from merging or pushing around the gate entirely) and require Joel's action in the GitHub UI, listed exactly in Section 12.

**Recommended next package: 0.75C (Platform Identity and Parish Memberships)**, per the delivery sequence in `docs/accounting/02-phase-0.75-foundational-readiness.md` Section 8 — 0.75G (Staging and Local Development) is also unblocked and could run in parallel, but 0.75C sits on the critical path to Phase 1 entry and has no dependency on 0.75A beyond "deploys through a safe pipeline," which is now true.
