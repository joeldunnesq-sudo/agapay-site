# Parish Directory Phase 1A - Security Review

## Verdict

Phase 1A is private-data-foundation only. It does not expose new public endpoints, member-facing pages, search, publication profiles, photos, contact data, imports, or exports.

## Authorization

Mutations require:

- an authenticated platform user ID;
- a parish scope;
- `directory.manage`;
- a matching actor parish and target parish.

The request helper uses the existing `requireCapability` framework. The legacy parish dashboard bearer token is not accepted by the directory service.

## Cross-Parish Isolation

The service denies mutations when the actor parish does not match the target parish. It also denies access to people that are not connected to the actor parish by creation provenance, household membership, or parish affiliation.

## Privacy

The Phase 1A schema deliberately excludes:

- addresses;
- phone numbers;
- email addresses;
- publication settings;
- public profiles;
- photos;
- giving data;
- pledge data;
- commerce data;
- Learn planning data;
- skills and ministry information.

No donor, Learn, public-directory, or platform-membership table is repurposed.

## Children and Vulnerable Persons

Children can exist as canonical people and household members, but Phase 1A has no publication surface and no contact/photo fields. Child visibility and protected-person rules belong to Phase 1B and later publication phases.

## Audit

Every mutation writes a central audit row. Domain writes and audit writes are batched together so a failed audit insert does not leave unaudited directory state behind.

## Duplicate Controls

Phase 1A prevents:

- duplicate household member rows for the same household/person;
- duplicate household admin rows for the same household/person;
- duplicate external identity links across people;
- duplicate person/parish/status affiliation rows.

It does not attempt uncertain matching or automatic merging.

## Residual Risks

- `directory.manage` is still broad. Later phases should split capabilities such as `directory.publish`, `directory.claims.manage`, `directory.export`, and `directory.media.manage`.
- Canonical people can become shared across parishes only through explicit future workflows. Phase 1A intentionally avoids automatic cross-parish matching.
- `created_by_parish_id` is an isolation/provenance field, not a final product answer for multi-parish canonical identity governance.
- `directory.manage` should be treated as powerful access until narrower capabilities are introduced.
