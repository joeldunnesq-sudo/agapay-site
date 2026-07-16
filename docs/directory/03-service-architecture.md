# Parish Directory Phase 1A - Service Architecture

Service module: `src/directory/foundation.js`

Public barrel: `src/directory/index.js`

## Boundary

All Phase 1A mutations go through the directory service layer. No handlers, public endpoints, UI screens, or routes were added.

The service layer owns:

- validation;
- authorization context checks;
- cross-parish isolation;
- duplicate prevention;
- database writes;
- central audit rows.

## Authorization Context

Mutating service calls require an actor shaped like:

```js
{
  userId: "platform_user_id",
  parishId: "parish_id",
  capabilities: ["directory.manage"]
}
```

The helper `directoryActorFromRequest(request, env, parishId)` reuses the existing platform authorization framework through `requireCapability`.

## Services

Implemented services:

- `createPerson`;
- `updatePerson`;
- `deactivatePerson`;
- `createHousehold`;
- `addHouseholdMember`;
- `removeHouseholdMember`;
- `addHouseholdAdmin`;
- `removeHouseholdAdmin`;
- `linkExternalIdentity`;
- `addParishAffiliation`;
- `removeParishAffiliation`;
- `listPeopleForParish`.

## Cross-Parish Isolation

Every mutation checks that the actor is scoped to the target parish. Person access is allowed only when the person is visible to that parish through one of these Phase 1A relationships:

- the person was created by the parish;
- the person belongs to a household owned by the parish;
- the person has a parish affiliation for the parish.

## Audit Strategy

Every mutation writes to central `audit_log` in the same D1 batch as the domain mutation. This keeps the domain change and audit row coupled: if the audit insert fails, the domain write rolls back.

Audit event names:

- `directory.person_created`;
- `directory.person_updated`;
- `directory.person_deactivated`;
- `directory.household_created`;
- `directory.household_member_added`;
- `directory.household_member_removed`;
- `directory.household_admin_added`;
- `directory.household_admin_removed`;
- `directory.external_link_created`;
- `directory.parish_affiliation_added`;
- `directory.parish_affiliation_removed`.

## Transaction Safety

The service requires D1 batch support for mutations. Tests exercise rollback behavior by intentionally omitting `audit_log`; the attempted household write rolls back when the audit insert fails.

## Non-Goals

The service does not perform:

- household claiming;
- duplicate merge decisions;
- automatic matching;
- contact management;
- publication;
- search;
- imports;
- exports;
- photo/media handling;
- skills/service matching.
