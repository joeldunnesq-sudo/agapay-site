# Phase 4 Profile Projection Policy

Phase 4 profile pages use allowlisted DTOs generated server-side.

## Person Cards

Person cards may include:

- approved display name;
- approved household name;
- approved city;
- approved secure photo.

They do not include email, phone, full address, age, birth date, legal name, claim state, identity-link state, notes, donor status, Learn status, or accounting data.

## Household Cards

Household cards may include:

- approved household display name;
- approved secure photo;
- approved visible member names;
- approved city;
- count of visible published members only.

They do not include full street address or hidden-member counts.

## Person Profiles

Person profiles may include approved member-visible contacts and household link. Contact values come only from contact rows whose visibility is `directory_members`.

## Household Profiles

Household profiles may include approved household contacts and visible published members only.

## Empty Sections

Unavailable sections are omitted or shown with neutral empty states. The UI does not render placeholders for protected or unpublished records.
