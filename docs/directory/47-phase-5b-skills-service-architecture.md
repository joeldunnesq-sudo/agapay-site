# Phase 5B Skills & Service Architecture

Phase 5B adds a private parish Skills & Service Directory to the existing parish directory domain. It is not a public marketplace, scheduling system, messaging system, background-check system, or licensing registry.

## Domain Boundary

The Skills & Service feature stays inside the directory boundary:

- Listings belong to a parish, a canonical adult person, and a skill catalog item.
- Published discovery is limited to authenticated parish directory members.
- Staff review, moderation, export, and print tools use parish dashboard directory capabilities.
- Children and protected people are excluded from member-visible skill publication.
- Giving, accounting, Learn, Commerce, events, scheduling, attendance, and messaging data are not read or serialized by the skills service.

## Catalog

`directory_skill_catalog` stores platform defaults plus optional parish-scoped skill labels. Platform defaults can be used by all parishes. Parish records are editable only by staff with skills catalog capability.

## Listings

`directory_person_skill_listings` stores self-reported skill availability. Member activation records explicit consent with a policy version. Withdrawal records a withdrawal timestamp and removes the listing from ordinary member search.

Supported statuses:

- `draft`
- `active`
- `paused`
- `hidden_by_parish`
- `withdrawn`
- `archived`

Only `active` listings with `directory_members` visibility are searchable by ordinary members.

## Verification

`directory_household_verifications` records household confirmation, next due date, verifier user, and policy version. It gives staff a maintenance view without turning household verification into a separate workflow engine.

## Private Output

Private exports and print payloads are generated through authenticated parish dashboard APIs, audited, and returned with `private, no-store` cache headers.
