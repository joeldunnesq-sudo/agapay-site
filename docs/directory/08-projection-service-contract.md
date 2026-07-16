# Parish Directory Phase 1B - Projection Service Contract

Service: `projectDirectoryRecord` in `src/directory/projections.js`

## Inputs

The projection service accepts:

- authenticated actor context;
- parish ID;
- target type: `person` or `household`;
- target ID;
- projection type;
- optional correlation ID.

## Projection Types

Supported service-level projection types:

- `household_summary`
- `household_detail`
- `person_summary`
- `person_detail`
- `parish_staff_detail`
- `household_self_management_detail`

No public route exposes these projections in Phase 1B.

## Authorization

Ordinary member projections require:

- platform-user actor context;
- matching parish scope;
- `directory.view` or `directory.manage`;
- enabled parish directory settings;
- ordinary member access enabled;
- approved publication profile.

Staff detail requires:

- `directory.private_contact.view` or `directory.manage`.

Self-management household detail requires:

- `directory.self.manage`;
- active household administrator status, unless the actor has parish management capability.

Legacy parish bearer tokens cannot authorize projections.

## Sanitization

The projection service never returns raw database rows. It excludes:

- donor/giving data;
- external identity links;
- platform session data;
- internal source identifiers;
- notes;
- raw protected-address detail for ordinary members;
- hidden child data for ordinary members.

## Privacy Evaluation

Projection flow:

1. Load canonical record only after parish isolation succeeds.
2. Check publication eligibility.
3. Evaluate field-level privacy.
4. Apply parish settings.
5. Apply child/protected-person/protected-address overrides.
6. Return sanitized output for the viewer audience.

## Staff and Self Views

Staff and self-management projections may include more contact detail than ordinary member views, but they still return shaped domain objects rather than raw rows.
