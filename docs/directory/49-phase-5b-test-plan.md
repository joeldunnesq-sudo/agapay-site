# Phase 5B Test Plan

The dedicated test suite is `scripts/directory-phase5b-tests.mjs`.

It covers:

- Phase 5B migration tables and settings columns.
- Platform default skill catalog seeding.
- Adult self-service draft, activation, search visibility, and withdrawal.
- Child and protected-person exclusion.
- Staff-only setting suppression of ordinary member search.
- Parish custom skill creation.
- Staff hide and restore moderation.
- Skills roster export.
- Published adult export.
- Household verification completion.
- Maintenance dashboard summary.
- Member skills endpoint private no-store headers.

The suite is included in `npm run check` after the Phase 5A tests.
