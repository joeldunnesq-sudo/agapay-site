# Phase 4 Search Privacy Policy

Phase 4 search is private, parish-scoped, rate-limited, and based only on member-visible DTO fields.

## Searchable Fields

People may be found by:

- approved display name;
- approved suffix/title-like suffix value;
- approved household name;
- approved city.

Households may be found by:

- approved household display name;
- approved visible member names;
- approved city.

## Prohibited Fields

Search never uses:

- hidden canonical names;
- legal names;
- login emails;
- private emails;
- private phone numbers;
- street addresses;
- birth dates or ages;
- protected-status labels;
- internal notes;
- audit data;
- donor, accounting, Commerce, Learn, or Marketplace data.

## Protected And Child Records

Protected people and child records are removed before search indexes are generated. They do not affect result counts, alphabet letters, household member counts, or zero-result messages.

## Abuse Control

The API enforces a minimum query length of two characters and applies per-user, per-parish search throttling in the handler.
