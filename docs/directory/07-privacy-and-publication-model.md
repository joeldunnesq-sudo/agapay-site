# Parish Directory Phase 1B - Privacy and Publication Model

## Visibility Catalog

The visibility catalog is centralized in `src/directory/shared.js`:

- `private`
- `household`
- `clergy`
- `staff`
- `leadership`
- `directory_members`

No public internet visibility level exists for Parish Directory.

## Privacy Defaults

Defaults are centralized in `src/directory/privacy.js`.

Key defaults:

- household display name: `directory_members`, once publication is approved;
- adult preferred name: `directory_members`, once publication is approved;
- adult legal name: `staff`, not publication eligible;
- adult email: `private` until intentionally enabled;
- adult phone: `private` until intentionally enabled;
- street address: `staff`;
- city/state: `directory_members`, once publication is approved;
- household address: `staff`;
- child name, birth date, and age: `private`, not publication eligible;
- household relationship: `household`;
- person and household notes: `private`;
- parish affiliation: `leadership`;
- giving information: never publication eligible.

## Safety Overrides

Safety rules fail closed:

- children force private visibility;
- protected persons force private visibility;
- protected addresses cannot be shown to ordinary directory members;
- parish address maximum visibility cannot exceed `staff` in Phase 1B;
- giving information remains ineligible regardless of preference.

The most restrictive applicable rule wins.

## Parish Settings

`directory_parish_settings` stores safe parish defaults:

- directory enabled;
- publication approval required;
- child names/photos allowed flags, forced false in Phase 1B;
- address maximum visibility;
- contact maximum visibility;
- ordinary member access enabled;
- reconfirmation interval;
- default household publication status.

A parish can make settings stricter. It cannot weaken mandatory safety rules.

## Publication Lifecycle

Publication profiles are separate from canonical records in `directory_publication_profiles`.

Supported statuses:

- `not_configured`
- `draft`
- `pending_approval`
- `approved`
- `paused`
- `archived`

New records are not automatically approved. Approval requires `directory.publication.review` or `directory.manage`.

## Publication Principle

Publication profiles control whether a sanitized projection may be produced. They do not duplicate canonical values into a second source of truth.
