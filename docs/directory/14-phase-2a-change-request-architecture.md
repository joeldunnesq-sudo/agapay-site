# Parish Directory Phase 2A -- Change Request Architecture

Phase 2A adds `directory_change_requests` for household and person changes that should not directly mutate canonical directory structure.

## Request Types

Supported request types are:

- `person_profile_review`
- `household_membership_add`
- `household_membership_remove`
- `household_relationship_change`
- `household_move_request`
- `household_merge_review`

Merge and move requests are review records only. Phase 2A does not execute automatic person merges, household merges, household splits, or household transfers.

## Lifecycle

Requests use:

- `pending`
- `approved`
- `denied`
- `cancelled`
- `completed`

The self-service requester can create a pending request and cancel their own pending request. Approval and denial are parish-review boundaries for later administrative workflow.

## Duplicate Handling

The migration adds a partial unique index preventing duplicate pending requests for the same requester, target, request type, and summary.

## Audit and Notifications

Creation and cancellation are audited. A safe notification event is also recorded on request creation. Notification messages avoid protected addresses, child details, donor data, raw tokens, internal review notes, and conflict details.
