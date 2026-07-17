# Phase 4 Implementation Report

## Executive Summary

Phase 4 adds a private member-facing parish directory inside My AGAPAY. Authenticated eligible parish members can browse households and people, search published member-visible fields, open person and household profiles, and view approved secure photos.

## Completion Verdict

Phase 4A is complete for the core read-only private directory experience.

## Dependency Verification

Verified prerequisites:

- canonical people and households exist;
- privacy settings and protected-person flags exist;
- publication profiles exist;
- self-service identity links exist;
- secure media transformation and approval gates exist;
- Phase 3A review and Phase 3B aliases exist.

## Migration Summary

No migration was required. Phase 4 computes projections from approved publication profiles and privacy state.

## Routes Added

- `GET /api/directory/member`
- `GET /api/directory/member/households`
- `GET /api/directory/member/people`
- `GET /api/directory/member/search`
- `GET /api/directory/member/households/:id`
- `GET /api/directory/member/people/:id`
- `GET /api/directory/member/media/:assetId/variants/:variantType`

## Files Added

- `src/directory/member-directory.js`
- `src/handlers/directory-member.js`
- `scripts/directory-phase4-tests.mjs`
- Phase 4 docs `31` through `36`

## Files Modified

- `src/worker.js`
- `src/directory/index.js`
- `public/myagapay/directory.html`
- `package.json`

## Access Policy

Access requires an authenticated platform-user session, eligible parish scope, enabled directory settings, and active relationship through affiliation, household membership, or directory staff capability.

## Projection Architecture

DTOs are generated server-side from approved publication profiles and member-visible contact/address/media rows. Hidden fields are not serialized.

## Browse And Search

Household and person browse are alphabetized, paginated, and parish-scoped. Search uses only published DTO text and enforces a two-character minimum plus rate limiting.

## Profiles

Person and household profiles display approved names, visible household relationships, approved contacts, and approved secure photos. Full addresses, private contact values, legal names, notes, and external product data are omitted.

## Protected And Child Behavior

Protected people and children are absent from Phase 4A browse, search, counts, alphabet navigation, household member lists, media delivery, and direct profile routes.

## Media

The member media route serves only approved `directory_members` assets with securely transformed variants. Original uploads and legacy/unverified derivatives are not served.

## Alias Resolution

Person and household profile routes resolve Phase 3B aliases to survivor records and fail closed on loops or invisible survivors.

## Entitlement

Mission receives the full core directory experience. No privacy or security behavior is tier-gated.

## Audit And Observability

Phase 4 is read-only except for existing self-service actions. Search is rate-limited through the existing request throttling utility.

## Tests Added

`scripts/directory-phase4-tests.mjs` covers:

- eligible member access;
- unaffiliated user denial;
- published-only browse;
- hidden private fields;
- protected and child absence;
- private-contact search exclusion;
- private noindex API headers.

## Known Limitations

- Child publication remains fully hidden in Phase 4A.
- No persisted search projection table was added.
- Advanced role filters, saved filters, print views, and recently updated views are deferred.

## Recommended Next Scope

Phase 4B should add parish-approved role labels, stronger persisted search projections if needed for scale, accessibility screenshot checks, and optional parish-tier presentation enhancements.
