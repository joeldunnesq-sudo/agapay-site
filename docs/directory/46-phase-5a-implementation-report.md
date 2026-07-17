# Phase 5A Implementation Report

## Verdict

Phase 5A is implemented as a directory-domain foundation for ministries, service groups, leadership display, adult participation, member interest requests, review, and private directory projection.

## Files

Added:

- `migrations/0031_directory_ministries_phase5a.sql`
- `src/directory/ministries.js`
- `scripts/directory-phase5a-tests.mjs`
- Phase 5A documentation files `41` through `46`

Modified:

- `package.json`
- `src/directory/admin.js`
- `src/directory/index.js`
- `src/directory/member-directory.js`
- `src/directory/shared.js`
- `src/handlers/directory-admin.js`
- `src/handlers/directory-member.js`
- `src/handlers/directory-self-service.js`
- `src/lib/authorization.js`

## Domain Model

Ministries have controlled category, lifecycle, visibility, interest policy, participant publication policy, leader publication policy, child exclusion policy, ordering, and archive metadata.

Leadership and participation are separate. Neither grants capabilities.

## Member Behavior

Members can browse visible active ministries, open ministry profiles, submit interest when policy permits, withdraw pending interest, and view their own ministry participation/request status.

## Review Behavior

Interest requests enter the Phase 3A queue as `ministry_interest`. Reviewers need exact ministry-interest review capability or an existing broader directory review/manage capability. Approval creates participation transactionally and leaves publication hidden by default.

## Publication

Adult ministry affiliations can appear on private person profiles only after separate publication approval. Hidden, ended, rejected, pending, protected, and child records are absent.

## Tests

`scripts/directory-phase5a-tests.mjs` covers migration, creation, validation, authorization, visibility, interest requests, review/self-approval, child/protected safeguards, publication separation, display-role separation, alias resolution, and directory profile filtering.

## Deferred Scope

Phase 5B should focus on member-facing UI polish and staff dashboard ergonomics for ministries: richer browse controls, inline profile panels, bulk review convenience, and accessibility screenshot validation. It should not add scheduling, attendance, messaging, skills matching, exports, imports, maps, public pages, or child-ministry workflows without a separate safety design.
