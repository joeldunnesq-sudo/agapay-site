# Parish Directory Phase 3A Implementation Report

Date: 2026-07-16

Phase 3A adds the parish-facing directory administration foundation. It keeps source-of-truth data in the existing Phase 1A through Phase 2B tables and adds only the metadata needed for review assignment, priority, lifecycle state, and internal operational notes.

## Implemented

- Centralized admin context resolver using platform-user sessions and membership capabilities.
- New granular capability catalog entries for people, request review, membership review, protected records, notes, assignments, and audit access.
- Hybrid review queue: dynamic aggregation over change requests, publication profiles, and media candidates, with normalized metadata in `directory_review_metadata`.
- Controlled review actions: assign, unassign, begin, priority change, approve, deny, return, and cancel.
- Self-approval and stale-version protection for decisions.
- Transactional approval for supported Phase 2A person correction requests, publication approval, media approval, and basic membership add/remove requests.
- Safe non-executing behavior for merge/move/split-style work that belongs to later phases or manual review.
- Internal parish notes in `directory_internal_notes`, with protected-note gating.
- Parish-scoped people and household operations views.
- Narrow direct corrections for low-risk person display fields and household display name.
- Sanitized directory audit timeline from the existing central `audit_log`.
- Parish Dashboard Directory Operations shell with overview metrics, queue summary, people, and households panels.
- Focused Phase 3A regression tests added to `npm run check`.

## Intentionally Not Implemented

- Duplicate detection, comparison, scoring, and merge execution remain Phase 3B.
- Household merge execution is not performed in Phase 3A.
- Household split and cross-household move execution remain non-automatic unless later services model them safely.
- The dashboard UI does not expose raw database editing, unrestricted JSON editing, donor data, accounting data, or Learn records.
- The legacy parish dashboard password token is not accepted by directory admin APIs. Staff must use a platform-user session with directory capabilities.

## Security Notes

- All admin routes live under `/api/parish/dashboard/:parishId/directory/admin/*`, but authorization is platform-session based.
- Legacy bearer-only requests are denied.
- Queue list rows avoid raw payloads and private contact/address values.
- Note access is separated from note management.
- Protected notes require protected-record authority.
- Audit responses are timeline summaries and do not expose raw audit JSON payloads.

## Tests

- `node scripts/directory-phase3a-tests.mjs`
- Existing directory suites continue to cover Phase 1A, 1B, 1C, 2A, and 2B regression behavior.
