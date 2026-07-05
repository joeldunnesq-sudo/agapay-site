# AGAPAY Sales Tax & Merchant-of-Record — Phase 3D Report

Date: 2026-07-05. Corrects/completes Phase 3C. No production deploy. No live Stripe object touched. Donation tax treatment, bookstore direct-charge ownership, and parish Stripe Customer separation are unchanged.

## 1. Executive summary

Closed five of the six named production blockers with real, tested code: optimistic concurrency, Stewardship delayed-exemption wiring, manual "Mark expired," route-level HTTP tests, and the manifest-check fix. The sixth (preview QA) is **prepared, not executed** — this sandbox has no Cloudflare/Stripe test-mode access to actually run it, and I'm not claiming otherwise. `npm run check` is not fully green: the manifest issue named in this phase is fixed, but a separate, pre-existing, unrelated Learn-dashboard-shell assertion still fails (confirmed via `git stash` to predate this entire project) — documented below rather than glossed over or fixed by guessing at unrelated Learn architecture.

**Do not treat this as production-ready.** Per the assignment's own gate: concurrency is implemented and tested (✅), both Stewardship paths apply approved exemptions (✅), manual expiration is in the admin UI (✅), route-level tests pass (✅), but the standard validation command does not exit 0 (❌ — pre-existing unrelated failure), and preview QA has not been executed (❌). That's two of six gate conditions unmet, both explained precisely below rather than hidden.

## 2. Exact files changed

New: `scripts/require-node-22.mjs`, `scripts/tax-exemption-route-tests.mjs`, `docs/tax-exemption-preview-qa.md`.
Modified: `src/lib/tax-exemption.js` (concurrency helpers, `expireTaxExemptionManually`), `src/handlers/tax-exemption.js` (409 handling, new `/expire` route, version checks on every mutation route), `src/handlers/stewardship.js` (delayed-exemption wiring, both call sites), `src/worker.js` (route for `/expire`), `public/admin/app.js` (version tracking, stale-conflict UI, Mark Expired button), `scripts/check.mjs` (manifest path fix + Listen manifest check), `scripts/settlement-profiles-tests.mjs` + `scripts/tax-exemption-tests.mjs` (stale comment updates now that they're in `npm run check`), `package.json` (`engines` bumped to `>=22`, `check` script now runs both D1-backed suites and the new route-test suite).

## 3. Optimistic concurrency design

`tax_exemptions.updated_at` **is** the version — no new column needed, since every mutation path already bumps it via `transitionTaxExemption()`. New `StaleRecordError` class + `assertCurrentVersion(record, expectedVersion)` helper in `src/lib/tax-exemption.js`: if `expectedVersion` is supplied and doesn't match the record's current `updated_at`, it throws before any Stripe call or D1 write. All five existing mutation functions (`approveTaxExemption`, `approveTaxExemptionWithoutStripeSync`, `rejectTaxExemption`, `requestReplacementDocumentation`, `revokeTaxExemption`) plus the new `expireTaxExemptionManually` accept `expectedVersion` and check it immediately after loading the claim, before anything else. The two per-Customer routes (retry, reconcile) and retry-all check the exemption's version at the handler layer (not the lib layer, since they act on sync rows keyed by a different id) using the identical comparison. Not supplying `expectedVersion` skips the check (backward compatible — the scheduled expiration sweep and other system-initiated calls never pass one).

## 4. Routes changed

- `handleAdminTaxExemptionApprove/Reject/RequestReplacement/Revoke` — now read `expectedVersion` from the request body, pass it through, and catch `StaleRecordError` → 409.
- `handleAdminTaxExemptionRetrySync` (retry-all) — now parses a body and checks `expectedVersion` against the claim before running.
- `handleAdminTaxExemptionSyncRetry` / `handleAdminTaxExemptionSyncReconcile` — same version check added.
- New `handleAdminTaxExemptionExpire` → `POST /api/admin/tax-exemptions/:id/expire` — requires `reason`, requires `confirm: true`, optional `expectedVersion`, delegates to `expireTaxExemptionManually()`.
- `handleAdminTaxExemptionDetail` — now returns `claim.recordVersion` (`= updated_at`) for the frontend to echo back.

## 5. Request and response shapes

Every mutating request now accepts an optional `expectedVersion` string field alongside its existing fields (`reason`, `keepActiveDuringReplacement`, etc.). The manual expire route requires `{ reason, confirm: true, expectedVersion? }`. On success, responses are unchanged from Phase 3C. On a stale request:

```json
{
  "ok": false,
  "code": "STALE_RECORD",
  "message": "This exemption was updated by another administrator. The latest version has been loaded. Please review it before trying again.",
  "currentVersion": "2026-07-05T18:22:11.000Z",
  "currentStatus": "approved"
}
```

## 6. 409 behavior

Verified by test: a stale request never calls Stripe (`fetchCalled` asserted false) and never changes the D1 record (`claim.status` asserted unchanged) before the 409 is returned. The frontend's `texRunMutation()` wrapper catches `code === 'STALE_RECORD'`, shows the required copy, calls `openTexDetail()` to reload the latest record, and does **not** auto-retry — the admin must review and re-submit.

## 7. Stewardship delayed-exemption wiring

Both Customer-creation call sites in `src/handlers/stewardship.js` (the two independent Stewardship checkout routes, previously ~lines 1841 and 2109 in earlier reports — re-verified at their current locations before editing, confirmed still two separate, near-duplicate code blocks) now call the same `applyApprovedExemptionIfExists()` already proven in `src/lib/subscription-checkout.js` — no new helper, no duplicated logic, exactly the pattern requested. If a delayed sync fails, the route returns a 503 with a user-safe billing-configuration message instead of proceeding to a taxable Stewardship Checkout Session. `customerRole: "stewardship"` is passed explicitly, verified by test to land correctly in `tax_exemption_stripe_syncs.customer_role`. Stewardship pricing, trial days, Price IDs, and `automatic_tax` configuration are untouched — only the pre-checkout exemption-application step was added.

## 8. Manual expiration action

`expireTaxExemptionManually()` (`src/lib/tax-exemption.js`) mirrors `revokeTaxExemption()`'s ownership-aware Stripe path exactly (reuses the same `disableExemptionInStripe()` helper) — an externally-owned or externally-modified Stripe state is preserved and flagged `reconciliation_required`, never silently overwritten, verified by test. Only valid from `approved` status. The admin UI shows "Mark expired" only when `allowedActions.markExpired` is true (unchanged logic from Phase 3C — `status === 'approved'`), with a confirmation summary (parish, current status, expiration on file, and a note that externally-owned Stripe states are preserved) before submission.

## 9. Route-level tests

New `scripts/tax-exemption-route-tests.mjs` — 18 tests calling the actual exported route handlers with real `Request` objects (not just the underlying lib functions), using a real admin session issued via the existing `issueAdminSession()` helper against a `node:sqlite`-backed `app_settings` table (the real code path, not a mock of auth). Covers: unauthorized (401), missing exemption (404), cross-exemption sync-row ownership rejection (404), succeeded-row retry rejection (409), reconciliation-required-row retry rejection (409), successful retry with audit-entry verification and no-raw-Stripe-data assertion, stale-version rejection with no Stripe call, reconcile's invalid-action/missing-reason/force-without-confirm 422s, `accept_external` success with a safe-fields-only response shape assertion, reconcile stale-version 409, and the manual expiration route's full set (unauthorized, valid, invalid state, missing reason, stale version, external-exemption-preserved).

**Not covered** (see Known Limitations): a genuine concurrent-request race at the HTTP layer (the concurrency tests confirm the version check itself, not a true simultaneous-request scenario, which needs a real environment per the QA doc); `force_apply` success at the route level specifically (covered at the lib level in Phase 3B/3D's `tax-exemption-tests.mjs`, not independently re-asserted through the HTTP route in the new file).

## 10. Manifest/check fix

**Root cause:** `scripts/check.mjs` still read `public/manifest.webmanifest`, which was intentionally deleted (commit `c70e262`, pre-dating this project) when the "My AGAPAY" PWA manifest moved to `public/myagapay/manifest.webmanifest` (correctly referenced by every actual `public/myagapay/*.html` page). The check script simply wasn't updated when that migration happened — same class of bug as a stale test, not a real product break. **Fix:** repointed the read to `public/myagapay/manifest.webmanifest` (one line). Also added a previously-completely-unvalidated sanity check for `public/listen/manifest.webmanifest` (confirmed it exists, has its own scope/identity, and is correctly linked from `public/listen/index.html`) — per the instruction that "every required manifest is verified."

**A separate, pre-existing, unrelated failure remains**: `scripts/check-learn.mjs` asserts `learnDashboardHtml.includes("/learn/dashboard-shell.js")`, which is false — `public/learn/dashboard.html` currently loads `/myagapay-shell.js` and `/learn/mobile-gate.js`, not `/learn/dashboard-shell.js` (which exists on disk but isn't referenced anywhere). Confirmed via `git stash` that this fails identically on `main` before any of this project's changes — it is not something Phase 1 through 3D introduced. Per the assignment's own scope boundary ("do not expand scope beyond these items unless a directly related defect must be fixed to make them work safely"), I did not fix this — it's an unrelated AGAPAY Learn product question (was `dashboard-shell.js` deprecated, or is the reference simply missing?) that I'm not positioned to safely resolve without risking a real regression in a product I wasn't asked to touch. Documented here precisely rather than silently skipped or wrongly claimed fixed.

## 11. Standard validation command

```
npm run check
```
which now runs, in order: `scripts/require-node-22.mjs` (Node version guard) → `node --check src/worker.js` → `scripts/check.mjs` → `scripts/check-learn.mjs` → `scripts/worker-hardening-tests.mjs` → `scripts/settlement-profiles-tests.mjs` → `scripts/tax-exemption-tests.mjs` → `scripts/tax-exemption-route-tests.mjs`.

**Exit code: non-zero (fails at `scripts/check-learn.mjs`)**, for the pre-existing, unrelated reason in section 10. I am not reporting a green build, per the explicit instruction not to.

## 12. Full validation results

```
node scripts/require-node-22.mjs        → passes (Node 22.22.2 detected)
node --check src/worker.js              → passes
node scripts/check.mjs                  → "AGAPAY platform checks passed." (FIXED this phase)
node scripts/check-learn.mjs            → FAILS: "Learn dashboard should load the active
                                            dashboard shell." -- PRE-EXISTING, confirmed via
                                            git stash to fail identically on main; unrelated
                                            to this project; not fixed (see section 10)
node scripts/worker-hardening-tests.mjs → passes (unchanged)
node scripts/settlement-profiles-tests.mjs → 15/15 pass (unchanged)
node scripts/tax-exemption-tests.mjs    → 69/69 pass (6 new concurrency/expiration tests
                                            + 4 new Stewardship-wiring tests added this phase)
node scripts/tax-exemption-route-tests.mjs → 18/18 pass (new this phase)
```

Total tax-exemption-specific tests across both suites: **87 passing, 0 failing.**

## 13. Preview environment setup

Documented in full in `docs/tax-exemption-preview-qa.md` §1 — Wrangler `[env.preview]` block (not yet added to `wrangler.toml` itself, since I have no way to provision real preview D1/R2/Stripe resources from this sandbox to validate it against), preview D1 creation/migration commands, preview R2 bucket creation command, Stripe test-mode setup, test admin/parish/document setup, and both the forced-Stripe-failure and externally-modified-Stripe-state simulation approaches.

## 14. QA checklist location

`docs/tax-exemption-preview-qa.md` — contains all 8 required scenarios (A–H) as concrete step-by-step procedures.

## 15. QA execution status

**Prepared: yes. Configured: no. Executed: no. Passed: N/A.** Stated identically in the QA doc itself (§4) so this isn't just a claim buried in a report — anyone opening the QA doc sees the same status.

## 16. Feature-flag state

No production default changed. `TAX_EXEMPTION_WORKFLOW_ENABLED`/`_DOCUMENT_UPLOAD_ENABLED`/`_STRIPE_SYNC_ENABLED` remain `"true"` (kill switches, unused by default). `SUBSCRIPTION_TAX_CODES_ENABLED`, `LEARN_PERSISTED_CUSTOMER_ENFORCED`, and all three `PARISH_COMMERCE_READINESS_*` flags remain `"false"` (staged rollout, not yet activated). Note: the assignment's list includes `LEARN_PERSISTED_CUSTOMER_ENABLED` (singular "enabled") — only `LEARN_PERSISTED_CUSTOMER_ENFORCED` exists in this codebase (there was never a separate "enabled" toggle; the feature is always present in code, only enforcement is flagged). Flagging this naming discrepancy rather than silently adding a second, redundant flag.

## 17. Security impact

Version checks add no new attack surface (`expectedVersion` is just a string comparison against the record admins already have visibility into). The new `/expire` route follows the exact same `requireAdminContext`/rate-limit/audit pattern as every other mutation route. No new PII/secrets exposure.

## 18. Stripe impact

None to live/production Stripe objects. All new/modified Stripe-touching code paths (Stewardship delayed sync, manual expiration) reuse the existing tested `disableExemptionInStripe()`/`applyApprovedExemptionIfExists()` functions — no new Stripe call shapes introduced.

## 19. D1 impact

No schema change this phase (concurrency uses the existing `updated_at` column; manual expiration uses the existing `tax_exemptions`/`tax_exemption_stripe_syncs` tables). Purely additive application-code changes.

## 20. Backward compatibility

Every mutation route treats a missing `expectedVersion` as "skip the check" — existing callers (including the scheduled expiration sweep, which never sends one) are unaffected. The frontend now always sends the version it loaded, but the backend doesn't require it, so older/other API clients aren't broken.

## 21. Known limitations

- `npm run check` does not exit 0, for the pre-existing unrelated Learn-dashboard-shell reason documented in §10.
- Preview QA is prepared, not executed (no real environment available in this sandbox).
- A true concurrent-request race isn't tested at the HTTP layer, only the version-check logic itself.
- `force_apply`'s success path isn't independently re-tested through the new HTTP route file (only through the existing lib-level tests).
- The assignment's `LEARN_PERSISTED_CUSTOMER_ENABLED` flag name doesn't exist in this codebase (see §16).

## 22. Remaining legal or CPA decisions

Unchanged from Phase 1–3C: final Stripe product tax codes still require CPA/tax-adviser sign-off before `SUBSCRIPTION_TAX_CODES_ENABLED` is set to `true`; marketplace-facilitator classification remains flagged for attorney review in `docs/internal-legal-review.md`.

## 23. Production rollout recommendation

**Not ready for production rollout yet.** Before it is: (1) get `npm run check` fully green — either fix the unrelated Learn dashboard-shell issue (out of scope for this project, needs its own owner) or explicitly accept it as a known, separately-tracked failure and adjust the release gate accordingly; (2) actually provision and run the preview QA procedure in `docs/tax-exemption-preview-qa.md`, especially scenarios C (external reconciliation) and D (stale-state) which touch real money/tax correctness and haven't been exercised against a real Stripe test-mode account; (3) build the admin UI's remaining gaps flagged in the Phase 3C report (mark-expired button is now done, but exemption-type filter dropdown, date-range filters, and frontend/DOM tests are still open); (4) get explicit sign-off before touching `SUBSCRIPTION_TAX_CODES_ENABLED` or any commerce-readiness enforcement flag.
