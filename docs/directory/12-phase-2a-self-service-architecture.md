# Parish Directory Phase 2A -- Self-Service Architecture

Phase 2A adds the first My AGAPAY household self-service layer on top of the existing private directory model. It does not create a shared household login and it does not create a parallel ownership system.

## Context Resolution

`src/directory/self-service.js` resolves authority from the authenticated platform user, then follows the active `directory_person_links` row where `link_type = 'platform_user'`. The client never supplies the authoritative user, person, household-admin, or parish identity.

The resolved context includes:

- the linked canonical person;
- active parish affiliations;
- active household memberships;
- active household-administrator grants;
- protected-person and child flags;
- manageable households;
- pending change requests;
- Phase 2A entitlement status.

An unlinked platform user receives a safe `claimed: false` response. The service does not create a person record automatically.

## Field Ownership

Person-owned data remains separate from household-owned data.

Direct person edits are limited to existing schema fields that are safe for self-service:

- `preferredName`
- `middleName`
- `suffix`
- `dateOfBirth`

Parish-controlled fields, canonical identity fields, protected-person flags, affiliation status, household structure, household-admin grants, and internal notes are not directly editable. Requests for reviewable person fields are captured as change requests instead.

Direct household edits are limited to:

- `displayName`

Household contacts and addresses use the Phase 1B normalized contact/address services.

## Concurrency

Self-service profile updates require the caller to submit the current `updated_at` value as `expectedVersion`. Stale writes fail with a directory error before mutation. This keeps the Phase 2A API safe without adding duplicate version columns to existing 1A/1B tables.

## Entitlement

Phase 2A is available to both Mission and Parish plans. The service returns a server-side entitlement object indicating that Mission and Parish both receive the feature. No Phase 2A behavior depends on UI hiding or subscription-tier differences.

## Routes

The Worker routes under `/api/directory/*` call `src/handlers/directory-self-service.js`, which delegates all business rules to the directory domain service.

The handler rejects unauthenticated requests and does not accept legacy parish bearer authorization. Platform-user session resolution remains the only self-service identity path.

## UI

`public/myagapay/directory.html` is the minimal My AGAPAY self-service screen. It displays profile status, contacts, households, publication status, pending requests, and safe status messages. It does not implement browsing, search, photos, media upload, imports, exports, or reporting.
