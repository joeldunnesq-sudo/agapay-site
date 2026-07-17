# Phase 4 Directory Access Policy

Private directory access requires an authenticated platform-user session and a server-derived eligible parish context.

## Eligible Viewers

An ordinary viewer may access the private member directory when the user is linked to an active directory person and that person has at least one eligible relationship to the parish:

- active parish affiliation other than `former_member`;
- active household membership in an active parish household.

Authorized staff may also access when they have an active parish membership with `directory.view`, `directory.manage`, or `directory.publication.review`.

## Ineligible Viewers

Access is denied for:

- anonymous users;
- AGAPAY users with no eligible parish directory relationship;
- donor-only users;
- Learn-only users;
- former members;
- suspended or revoked platform parish memberships;
- users linked only to another parish;
- callers using legacy parish bearer auth;
- requests for a forged parish ID.

## Directory Settings

The parish directory must have both:

- `directoryEnabled`;
- `ordinaryMemberAccessEnabled`.

Mission-tier behavior includes the full core directory experience. Parish-tier enhancements can be added later without weakening privacy.

## Error Behavior

Unauthorized sessions return unauthorized. Hidden, cross-parish, disabled, protected, or unpublished records use safe not-found behavior to avoid enumeration.
