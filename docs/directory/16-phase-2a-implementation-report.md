# Parish Directory Phase 2A -- Implementation Report

## Executive Summary

Phase 2A implements the first household self-service foundation for linked My AGAPAY platform users. It adds server-side context resolution, safe person and household projections, controlled profile edits, normalized contact and address management, privacy preferences, publication submission/pause, adult household invitations, change requests, notification events, a minimal UI, and focused regression tests.

## Completion Verdict

Complete for Phase 2A's narrow foundation. Phase 2B media/photos were not started.

## Migration

- `migrations/0025_directory_self_service_phase2a.sql`

Adds:

- `directory_change_requests`
- `directory_notification_events`

## Services Added

- `src/directory/self-service.js`
- `src/handlers/directory-self-service.js`

## Routes Added

- `GET /api/directory/self/context`
- `GET /api/directory/self/profile`
- `PATCH /api/directory/self/profile`
- `POST /api/directory/self/contacts`
- `PATCH /api/directory/self/contacts/:id`
- `DELETE /api/directory/self/contacts/:id`
- `GET /api/directory/households/:id/self`
- `PATCH /api/directory/households/:id/self`
- `POST /api/directory/households/:id/self/contacts`
- `POST /api/directory/households/:id/self/addresses`
- `POST /api/directory/households/:id/self/invitations`
- `POST /api/directory/households/:id/self/invitations/:id/resend`
- `POST /api/directory/households/:id/self/invitations/:id/revoke`
- `POST /api/directory/privacy/preferences`
- `POST /api/directory/publication/transition`
- `POST /api/directory/change-requests`
- `POST /api/directory/change-requests/:id/cancel`

## UI Added

- `public/myagapay/directory.html`

The My AGAPAY dashboard now links to `/myagapay/directory`.

## Editable Fields

Person direct-edit fields:

- `preferredName`
- `middleName`
- `suffix`
- `dateOfBirth`

Household direct-edit fields:

- `displayName`

Review/request fields:

- legal/canonical person changes;
- biological sex;
- deceased/active status;
- internal notes;
- household membership;
- relationship correction;
- move/merge requests.

## Contact and Address Behavior

Person and household contacts reuse Phase 1B normalized services. Platform login email is not mutated when a directory contact changes. Self-entered contacts are not falsely marked verified.

Household addresses reuse Phase 1B address policy. Protected addresses fail closed and are sanitized in DTOs.

## Privacy and Publication

Privacy preferences reuse Phase 1B policy evaluation. Children and protected persons remain constrained. Publication lifecycle remains separate from privacy preference and approval. Self-service users may submit or pause, but cannot approve.

## Adult Invitations

Adult household-admin invitations reuse Phase 1C `createDirectoryInvitation`, resend, revoke, token hashing, and audit behavior. Children cannot be invited.

## Concurrency

Person and household profile updates require `expectedVersion` matching the current `updated_at`.

## Capabilities

No new capability strings were added. The self-service domain derives ordinary authority from platform-user identity, active person link, active affiliation, active household membership, and active household administrator rows.

## Audit Events

Added or reused:

- `directory.self_service.person_profile_updated`
- `directory.self_service.household_profile_updated`
- `directory.change_request.created`
- `directory.change_request.cancelled`
- Phase 1B contact/privacy/publication audit events
- Phase 1C invitation audit events

## Tests

Added:

- `scripts/directory-phase2a-tests.mjs`

Focused assertions cover migration, linked context, unclaimed state, person edits, stale protection, protected fields, contacts, platform-email separation, household profile edits, address safety, privacy denial, publication self-approval denial, change requests, adult invitations, child invitation denial, and legacy bearer denial.

## Known Limitations

- Directory contact verification remains non-operational.
- Parish review queues and decision routes are deferred.
- Notification delivery is represented as safe domain events, not a full notification center.
- The UI is intentionally minimal.

## Deferred Phase 2B Scope

Phase 2B should cover photos and media infrastructure only: person/household photos, upload policy, R2 storage, image processing, moderation, thumbnail generation, replacement/removal workflows, media audit, and media security review. It should not start browsing/search unless separately scoped.
