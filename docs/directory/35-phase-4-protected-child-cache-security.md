# Phase 4 Protected, Child, Cache, And Security Behavior

## Protected People

Protected people are completely absent from the ordinary member directory. They do not appear in browse, search, alphabet counts, result counts, profile routes, household member lists, or placeholder rows.

## Children

Phase 4A keeps child records hidden from the ordinary member directory. Published child-name support remains deferred until there is an explicit child-publication policy beyond the current fail-closed defaults.

## Aliases

Profile routes resolve active Phase 3B merge aliases up to a bounded depth. Alias loops fail closed with safe not-found behavior.

## Cache

Member-directory API responses use:

- `Cache-Control: private`;
- `Vary: Authorization, Cookie, X-AGAPAY-User-Email`;
- `X-Robots-Tag: noindex, nofollow`.

The service computes projections on demand, so publication/profile/privacy changes are reflected without maintaining a stale member-search table.

## Security Review

Phase 4 addresses:

- unauthenticated denial;
- cross-parish IDOR denial;
- protected-person non-enumeration;
- child non-enumeration;
- search scraping throttling;
- private contact exclusion from search;
- secure-media delivery only;
- public indexing prevention;
- donor/accounting/Learn/Commerce separation;
- no social-network features.
