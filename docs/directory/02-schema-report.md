# Parish Directory Phase 1A - Schema Report

Migration: `migrations/0022_directory_canonical_foundation.sql`

## Tables Added

### `directory_people`

Canonical private person records. Includes names, nullable birth date, biological sex, deceased flag, active flag, notes, integer timestamps, and `created_by_parish_id` provenance.

Not included: address, phone, email, publication settings, photos, skills, ministry information, donor fields, Learn fields, or JSON blobs.

### `directory_households`

Canonical household records owned by a parish. Includes display name, parish ID, active flag, and integer timestamps.

Not included: address, mailing preferences, phones, emails, publication settings, or JSON blobs.

### `directory_household_members`

Relational join table between households and people. Includes relationship, start/end dates, active flag, and timestamps. A household/person pair is unique to prevent accidental duplicate membership rows.

### `directory_household_admins`

Relational join table for multiple household administrators. A household/person pair is unique to prevent duplicate active administrator records.

### `directory_person_links`

Normalized external identity link table. The unique `(link_type, external_id)` constraint prevents the same external AGAPAY identity from being linked to two directory people.

### `directory_parish_affiliations`

Pastoral affiliation table. A person may have multiple statuses in a parish, and the same status cannot be duplicated for the same person/parish.

## Indexes

The migration adds lookup indexes for:

- people by `created_by_parish_id`;
- active people;
- households by parish;
- household members by household/person;
- household admins by household/person;
- person links by person and by external identity;
- affiliations by person and by parish/status.

## Constraints

The schema uses relational constraints and check constraints for:

- boolean integer fields;
- biological sex values;
- household relationship values;
- parish affiliation status values;
- duplicate household member/admin rows;
- duplicate external identity links;
- duplicate person/parish/status affiliations.

## Timestamp Convention

Directory domain tables use integer millisecond timestamps for `created_at` and `updated_at`, per the Phase 1A brief. Central `audit_log` retains its existing `datetime('now')` text timestamp convention.

## Exclusions

This migration intentionally does not add:

- search tables;
- publication profiles;
- field visibility;
- contact information;
- addresses;
- phones;
- emails;
- photos;
- skills;
- imports;
- exports;
- duplicate merge tables;
- household claim tables;
- public or member-facing directory state.
