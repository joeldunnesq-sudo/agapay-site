# Parish Directory Phase 1A - Implementation Report

## Files Added

- `migrations/0022_directory_canonical_foundation.sql`
- `src/directory/foundation.js`
- `src/directory/index.js`
- `scripts/directory-foundation-tests.mjs`
- `docs/directory/01-canonical-model.md`
- `docs/directory/02-schema-report.md`
- `docs/directory/03-service-architecture.md`
- `docs/directory/04-security-review.md`
- `docs/directory/05-implementation-report.md`

## Files Modified

- `package.json` now includes `scripts/directory-foundation-tests.mjs` in `npm run check`.

## Migration Summary

The migration adds six normalized Phase 1A tables:

- `directory_people`;
- `directory_households`;
- `directory_household_members`;
- `directory_household_admins`;
- `directory_person_links`;
- `directory_parish_affiliations`.

No existing tables are modified. No donor, Learn, public directory, or platform membership tables are repurposed.

## Services Added

The new service layer supports:

- person create/update/deactivate;
- household creation;
- household member add/remove;
- household administrator add/remove;
- external identity linking;
- parish affiliation add/remove;
- parish-scoped people listing for service use.

## Tests Added

`scripts/directory-foundation-tests.mjs` covers:

- schema creation and forbidden table/column exclusions;
- person lifecycle;
- household lifecycle;
- household member duplicate prevention;
- multiple household administrators;
- multiple parish affiliations;
- external identity links;
- duplicate external identity prevention;
- audit generation;
- transaction rollback when audit insert fails;
- cross-parish isolation;
- authorization enforcement;
- reuse of the platform capability framework.

## Known Technical Debt

- Phase 1A uses broad `directory.manage`; later phases should split capabilities.
- Multi-parish canonical identity governance is intentionally conservative until claims, matching, and duplicate review exist.
- There is no staff/admin UI yet; all behavior is service-layer only.

## Readiness Assessment For Phase 1B

Ready.

Phase 1B can now add contact information, privacy settings, and publication foundations on top of canonical people and households without borrowing donor, Learn, public directory, or platform authorization tables as person records.
