# Accounting readiness review — October 23, 2026

## Decision

The starting checkout needed correctness and request-boundary fixes before a broader release. Its original 40-command accounting suite passed, but did not cover the interruption and concurrency defects found during this review.

The fixes below are implemented and covered by regression tests. Local automated validation supports proceeding to an authenticated staging release rehearsal. This is not a new production sign-off: these changes have not been deployed by this review, and fresh authenticated staging/production results remain required. Preserve the prior controlled-onboarding decision and its historical evidence in [the release record](accounting-release-gates-signoff.md).

## Findings corrected

| Finding                                                                                | Impact                                                                            | Correction                                                                                                                                   |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Journal header/lines/event were written separately, with line validation during writes | Invalid input or a failed write could leave a partial draft                       | Validate the complete draft first; commit header, lines and creation event in one atomic batch                                               |
| Draft updates/deletes and posting checked versions before the transaction              | Another request could win between validation and writes                           | Enforce a version/state comparison inside the write batch; failed comparisons abort the batch                                                |
| Posting checked period availability before the transaction                             | A newly closed or locked period could be posted into                              | Recheck the fiscal-year/period and lock barriers inside the atomic write batch                                                               |
| Date validation accepted strings such as February 30                                   | Impossible dates could enter journals or payable records                          | Validate actual ISO calendar dates for journal create/edit, bills and payment selection                                                      |
| Whole-cent line values did not imply safe aggregate arithmetic                         | Products and totals could exceed JavaScript's exact integer range                 | Reject unsafe journal, bill and payment totals; reject zero bill quantities                                                                  |
| A posting key could return another journal if its caller-supplied hash matched         | A request could receive a success result for the wrong journal                    | Bind idempotency replay to both request hash and journal ID                                                                                  |
| Bill/payment headers and children were written separately                              | A failed child insert could leave an incomplete payable record                    | Create each bill/payment and its children in one batch; reject repeated bill applications before writes                                      |
| Ledger posting and AP finalization were separate operations                            | A failure could post the ledger without updating the bill/payment or its balances | Include AP state changes, balances and links in the same ledger-posting transaction; reuse unfinished source drafts on retry                 |
| Reversal, original-entry state and payment-void changes were separate writes           | Failure could strand a reversal or leave AP balances inconsistent                 | Commit reversal/link/original state/payment void/bill balance changes together; preserve an unfinished void's reversal date on retry         |
| Submitted objects could overwrite server-owned actor, tier or URL-selected IDs         | Audit attribution and operation scope could be changed by submitted JSON          | Give authenticated context and URL IDs precedence; explicitly select posting fields so internal transaction statements cannot come from JSON |
| The database facade fell back to sequential execution when batching was unavailable    | An adapter could silently discard transaction guarantees                          | Refuse batch writes unless the provider implements atomic batching                                                                           |

The guard statements intentionally use the existing NOT NULL version constraint to abort the transaction on a stale comparison. Merely checking an UPDATE's affected-row count after a committed batch would not protect its other writes.

Payment validation and payment DTOs were moved into focused modules to keep the payables service within the repository's source-size limit. No schema migration is required for these changes.

## Evidence from this review

- `npm run check:accounting`: all 42 commands passed, including activation, authorization, staff access, ledger, reports, integrations, reconciliation, payables, budgets, close, protective states, recurring work, attachments, payment runs and treasurer UI contracts.
- `npm run check:release-gates`: all 11 local commands passed, including the native local Worker portability drill, volume boundaries, import safety and release wiring. This command includes static checks for authenticated gate wiring; it does not itself execute the live cross-tenant matrix or authenticated check-printing flow.
- `node scripts/accounting-release-gate-2-sw-lifecycle.mjs`: actual browser run passed network-only API/parish caching, interrupted-request draft preservation, reconnect and service-worker takeover behavior.
- `npm run typecheck`: strict Worker, Learn, browser and legacy action contracts passed; server/browser generated output checks passed.
- Targeted ESLint checks: no errors or warnings in the changed implementation and new regression-test files.
- Source-size budgets and architecture/handler/router boundary checks passed.
- Immutable migration manifest, migration-import, and release-health contract tests passed.

`scripts/accounting-transaction-safety-tests.mjs` uses SQLite with foreign-key enforcement for operations and injected write failures/interleaved competing changes. It verifies rollback, preserved winning data, no false posting completion receipt, source-draft reuse and exactly one reversal after retry. It also verifies that an adapter without batching performs no fallback writes.

`scripts/accounting-request-boundary-tests.mjs` executes the real HTTP dispatcher functions with isolated authentication/service I/O. It submits forged actor, tier, IDs and internal posting statements and verifies the service receives server-owned values. Both new regression commands are included in the accounting test group. The treasurer route-source assertions were updated to require the protected actor assignment order.

## Remaining release evidence

1. Deploy the reviewed changes to a non-production target and run authenticated Gates 1–3 through the existing protected workflow. This session had 0 of the 12 required `ACCOUNTING_GATE_*` settings; it could not produce fresh authenticated check-print artifacts or a fresh two-parish isolation matrix. The current static inventory contains 92 routes across 10 handlers.
2. Run the authenticated post-deployment production smoke for the deployed revision. Historical production success is retained in the release record; it is not evidence for this new revision.
3. Complete the existing physical check-stock verification rows for the actual printer and stock styles before describing printing as physically validated.

This review did not change production data, deploy code, or mark physical verification complete. The local tests establish the specific behavior they exercise; they are not a claim that every accounting screen was manually inspected or that every production workflow was freshly rehearsed.

## Staging follow-up

The subsequent staging deployment and protected acceptance work is recorded in [the staging release record](staging-release-2026-10-23.md). The remaining-evidence list above describes the state at the original local review, before that follow-up.
