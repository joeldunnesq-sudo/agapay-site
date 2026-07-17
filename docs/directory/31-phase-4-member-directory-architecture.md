# Phase 4 Member Directory Architecture

Phase 4 adds the first private parishioner-facing directory experience inside My AGAPAY.

## Server Boundary

All member-directory data is produced by `src/directory/member-directory.js`. The browser calls `src/handlers/directory-member.js`, which resolves the authenticated viewer, parish scope, entitlement, and member-visible DTOs before returning JSON.

The browser never receives canonical private rows and never recalculates privacy.

## Viewer Context

The server derives:

- platform user from the platform-user session;
- linked directory person from `directory_person_links`;
- eligible parish IDs from active parish affiliation, active household membership, or active staff membership with directory capability;
- viewer class as `parish_member` or `parish_staff`;
- directory settings and entitlement.

## Browse And Search

Browse is paginated and read-only:

- `GET /api/directory/member`
- `GET /api/directory/member/households`
- `GET /api/directory/member/people`
- `GET /api/directory/member/search`
- `GET /api/directory/member/households/:id`
- `GET /api/directory/member/people/:id`
- `GET /api/directory/member/media/:assetId/variants/:variantType`

Search operates over generated member-visible DTO fields only.

## Projection Source

Phase 4 consumes approved publication profiles and directory privacy state. It does not create a separate publication engine or a separate duplicate/merge system.

Visible entities must have:

- active canonical record;
- approved active publication profile;
- parish scope;
- non-protected person state;
- non-child person state for Phase 4A.

## Media

Published photos use a member-directory media route. It serves only approved, active, directory-member-visible, publication-eligible assets with secure transformed variants.

Original uploads and unverified derivatives are never exposed.

## Caching

Responses are private, noindex, authorization-varying JSON responses. Cache keys are naturally isolated by request authorization, parish ID, and viewer class. The implementation currently computes DTOs on demand rather than persisting a search projection table.
