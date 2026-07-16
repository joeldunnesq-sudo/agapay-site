# Parish Directory Phase 1A - Canonical Model

Phase 1A creates the private canonical people-and-household foundation for AGAPAY Parish Directory. It does not create a member-facing directory, search UI, contact model, publication model, photo model, skills model, import/export workflow, or household claim flow.

## Core Separation

The directory model is separate from existing AGAPAY identities and products:

- Platform users are login identities, not directory people.
- Donors are giving/receipt identities, not directory people.
- Learn students are education records, not directory people.
- Parish memberships are software authorization records, not pastoral affiliations.
- The public AGAPAY Directory remains an organization intake and public listing surface, not a private member directory.

## Canonical Entities

### Directory People

`directory_people` is the canonical private person table. It stores only Phase 1A person facts:

- preferred name;
- optional legal name;
- optional middle name;
- optional suffix;
- nullable date of birth;
- biological sex;
- deceased flag;
- active flag;
- private notes;
- created/updated timestamps.

It intentionally does not store address, phone, email, communication preferences, photos, skills, ministry data, public profile settings, or publication consent.

`created_by_parish_id` is provenance and isolation metadata. It is not pastoral membership.

### Directory Households

`directory_households` is parish-owned in Phase 1A. It stores:

- household display name;
- owning parish;
- active flag;
- created/updated timestamps.

It intentionally does not store address, mailing preferences, phone, email, or publication settings.

### Household Members

`directory_household_members` links people to households with:

- relationship: `head`, `spouse`, `child`, `grandparent`, or `other`;
- start date;
- end date;
- active flag.

The model does not assume a single head of household.

### Household Administrators

`directory_household_admins` records adults who may later become household managers in My AGAPAY. Phase 1A stores canonical admin relationships only; it does not build claiming or self-service editing.

Multiple household administrators are supported.

### Person Links

`directory_person_links` connects a directory person to external AGAPAY identities without embedding foreign keys in the person record. Initial supported link types are:

- `platform_user`;
- `donor`;
- `learn_student`.

The table is intentionally generic enough for future systems.

### Parish Affiliations

`directory_parish_affiliations` records pastoral parish affiliation, not software authorization. Supported statuses:

- `member`;
- `catechumen`;
- `visitor`;
- `clergy`;
- `monastic`;
- `former_member`.

Affiliations support joined/left dates and active/inactive state.

## Privacy Boundary

Phase 1A records are private canonical records only. Publication profiles, field visibility, household confirmation, contact data, and child visibility rules begin in later phases. Nothing in Phase 1A is member-directory-visible.

## Ready For

This model is ready to support Phase 1B: contact information, privacy model, and publication foundation.
