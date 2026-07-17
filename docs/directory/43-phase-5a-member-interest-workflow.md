# Phase 5A Member Interest Workflow

Eligible adult parish members may express interest in active ministries whose request policy is `request_interest`.

## Eligibility

The requester must be authenticated, linked to an active adult canonical person, scoped to the parish through directory affiliation or household membership, and not protected. Children are denied.

## Submission

The member submits an interest type from the controlled participation set plus an optional short operational note. The note is capped and should not include pastoral, medical, financial, family, or background-check information.

## Review

Submitted requests appear in the existing Phase 3A review queue as `ministry_interest`. Reviewers need `directory.ministry_interest.review`, `directory.requests.review`, or `directory.manage`.

Approval transactionally creates an active participant row with publication hidden by default. Return, rejection, cancellation, and withdrawal preserve request history.

## Duplicate Prevention

Only one unresolved interest request per parish, ministry, and person is allowed. Only one active/paused participant assignment per parish, ministry, and person is allowed.
