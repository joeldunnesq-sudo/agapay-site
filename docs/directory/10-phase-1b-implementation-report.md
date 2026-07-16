# Parish Directory Phase 1B - Implementation Report

## 1. Executive Summary

Phase 1B adds normalized contact information, centralized privacy policy, publication profiles, parish settings, and sanitized server-side projections. No member-facing directory UI, search, claiming, imports, exports, photos, or skills were added.

## 2. Schema Changes

Migration: `migrations/0023_directory_contact_privacy_publication.sql`

Tables added:

- `directory_contact_methods`
- `directory_addresses`
- `directory_field_privacy_preferences`
- `directory_person_privacy_flags`
- `directory_publication_profiles`
- `directory_parish_settings`

## 3. Service Architecture

New service modules:

- `src/directory/shared.js`
- `src/directory/settings.js`
- `src/directory/privacy.js`
- `src/directory/contacts.js`
- `src/directory/publication.js`
- `src/directory/projections.js`

Existing export barrel `src/directory/index.js` now exports the Phase 1B modules.

## 4. Contact Ownership Model

Contacts are owned by either a person or household. Household admins may manage household-owned contact data when active and authorized. One adult cannot manage another adult's person-owned contact without parish authorization.

## 5. Privacy Defaults

Defaults are centralized in `FIELD_DEFAULTS`. Children and protected persons force private visibility. Protected addresses cannot be shown to ordinary members.

## 6. Publication Lifecycle

Publication profiles support:

- `not_configured`
- `draft`
- `pending_approval`
- `approved`
- `paused`
- `archived`

New profiles cannot auto-approve.

## 7. Projection Behavior

`projectDirectoryRecord` returns viewer-specific sanitized projections for household/person summary/detail, staff detail, and household self-management detail.

## 8. Capabilities Added

Added to the catalog:

- `directory.view`
- `directory.self.manage`
- `directory.households.manage`
- `directory.publication.review`
- `directory.settings.manage`
- `directory.private_contact.view`
- `directory.audit.view`

Existing `directory.manage` remains supported.

## 9. Audit Integration

Audited events include contact creation/update/deactivation, primary contact changes, protected addresses, visibility preferences, publication lifecycle, parish settings, and protected-person flags.

## 10. Routes Added

None.

## 11. Changed Files

- `migrations/0023_directory_contact_privacy_publication.sql`
- `src/directory/shared.js`
- `src/directory/settings.js`
- `src/directory/privacy.js`
- `src/directory/contacts.js`
- `src/directory/publication.js`
- `src/directory/projections.js`
- `src/directory/index.js`
- `src/lib/authorization.js`
- `scripts/directory-phase1b-tests.mjs`
- `package.json`
- Phase 1B docs in `docs/directory/`

## 12. Tests and Results

Focused tests:

- `node scripts/directory-phase1b-tests.mjs`
- `node scripts/directory-foundation-tests.mjs`

Full suite:

- `npm run check`

## 13. Known Limitations

- No route or UI exists yet.
- No household claiming or invitation flow exists yet.
- Publication approval is service-only.
- Contact verification status is stored but no verification workflow exists.

## 14. Deferred Features

Claiming, invitations, browse UI, search, photos, skills, imports, exports, printable directories, reconfirmation reminders, and automatic sync remain out of scope.

## 15. Acceptance Criteria

Met in service and tests: normalized contacts, ownership distinction, centralized privacy, safe defaults, child/protected-person fail-closed behavior, distinct publication records, sanitized projections, giving-data exclusion, legacy bearer denial, mutation audit events, and no out-of-scope feature additions.

## 16. Final Verdict

Phase 1B is implemented as a backend service foundation.

## 17. Readiness For Phase 1C

Ready for Phase 1C: Household Claiming and Invitations.
