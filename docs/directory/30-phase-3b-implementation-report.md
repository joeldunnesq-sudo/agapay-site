# AGAPAY Parish Directory Phase 3B Implementation Report

Phase 3B adds duplicate detection, comparison, and controlled merge review to the parish directory without creating a separate administrative queue. Duplicate candidates are now first-class review items in the Phase 3A queue, but merge execution remains a separate, explicit workflow.

## Scope Delivered

- Person duplicate detection based on normalized names, shared contact methods, shared addresses, and shared households.
- Household duplicate detection based on normalized display names and overlapping membership.
- Explainable duplicate candidates with stored signal summaries, score, confidence band, and detection source.
- Queue integration through `directory_review_metadata` using duplicate candidate source rows.
- Candidate decisions for `not_duplicate`, `deferred`, and `confirmed_duplicate`.
- Controlled merge planning that requires a chosen survivor and records blockers before execution.
- Merge execution that deactivates the retired person or household, creates alias rows, writes merge history, and moves directory-owned references.
- Separate duplicate-review and duplicate-merge capabilities.
- Audit and history records for detection, decision, planning, and merge execution.

## Guardrails

- No duplicate candidate is merged automatically.
- Generic review approval is rejected for duplicate candidates; administrators must use the duplicate decision, plan, and merge workflow.
- Cross-parish merge attempts are blocked by parish-scoped candidate generation and lookup.
- Person merges fail closed for child/adult conflicts, protected authority conflicts, active platform identity conflicts, inactive records, and previously merged records.
- Household merges fail closed for inactive households, protected address authority conflicts, and previously merged households.
- Donor, accounting, payment, and Learn data are not merged by this phase.

## Database Changes

Migration `0029_directory_duplicates_phase3b.sql` adds:

- `directory_duplicate_candidates`
- `directory_merge_aliases`
- `directory_merge_events`

The migration also rebuilds `directory_review_metadata` so `duplicate_candidate` can participate in the existing Phase 3A review queue.

## Service Surface

The duplicate service is implemented in `src/directory/duplicates.js` and exported through the directory module. Admin-facing helpers are exposed through `src/directory/admin.js`:

- `runDirectoryDuplicateScan`
- `listDirectoryDuplicateCandidates`
- `getDirectoryDuplicateCandidate`
- `decideDirectoryDuplicateCandidate`
- `planDirectoryDuplicateMerge`
- `executeDirectoryDuplicateMerge`

HTTP routes are available under the parish directory admin endpoint:

- `POST /duplicates/scan`
- `GET /duplicates`
- `GET /duplicates/:candidateId`
- `POST /duplicates/:candidateId/decision`
- `POST /duplicates/:candidateId/plan`
- `POST /duplicates/:candidateId/merge`

## Verification

Phase 3B is covered by `scripts/directory-phase3b-tests.mjs`, which verifies:

- Migration table creation.
- Deterministic, explainable person duplicate scanning.
- Review queue integration.
- Not-duplicate suppression until evidence changes.
- Identity-link conflict blocking.
- Controlled person merge alias/history behavior.
- Household duplicate scan and merge behavior.

The root `npm run check` command now includes the Phase 3B test suite.
