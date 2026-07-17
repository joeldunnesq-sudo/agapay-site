# Phase 5A Ministry Authorization Policy

Phase 5A keeps display roles separate from platform capabilities.

## Capabilities

- `directory.ministries.manage`: create and manage ministries, leadership, and participation.
- `directory.ministry_interest.review`: review member interest requests.
- Existing broad fallbacks remain: `directory.manage`, and where applicable `directory.requests.review` for review queue access.

## Display Role Separation

Ministry leadership assignments never grant platform permissions. A displayed coordinator, clergy liaison, treasurer, bookstore coordinator, church-school coordinator, or parish-council-style assignment is only a directory display fact.

System permissions must be granted through `parish_memberships` and `membership_capabilities`.

## Protected People And Children

Children cannot submit ministry interest, hold leadership, or be published through Phase 5A.

Protected people are denied ordinary ministry interest and participation workflows and are filtered out of member-visible ministry projections and counts.

## Self-Approval

A reviewer cannot approve their own ministry interest request. Approval also re-checks that the ministry is active, accepts interest requests, the person is still eligible, and duplicate active participation does not exist.
