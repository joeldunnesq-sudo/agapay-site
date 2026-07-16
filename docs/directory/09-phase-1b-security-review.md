# Parish Directory Phase 1B - Security Review

## Verdict

Phase 1B establishes contact, privacy, publication, settings, and sanitized projection foundations without adding member-facing browse UI, public APIs, search, imports, exports, photos, or claiming.

## Child Exposure

Children fail closed through `directory_person_privacy_flags`. Child names and related fields are private by default and are not ordinary-member-publishable in Phase 1B.

## Protected Addresses

Protected addresses cannot be projected to ordinary members. Parish settings cannot raise address maximum visibility beyond `staff` in Phase 1B.

## Cross-Parish Access

Every service validates actor parish scope. Projection loading runs parish isolation before producing output.

## Household-Admin Abuse

Household admins may manage their household-owned contacts only when they are active admins and hold `directory.self.manage`. They cannot manage another household or another adult's person-owned contact.

## Raw-Record Exposure

The projection service returns shaped objects only. It excludes raw rows, internal IDs in projected owner objects, notes, external identity links, and donor/giving data.

## Giving-Data Leakage

Directory services do not read donor offering, pledge, Stripe, statement, payment, or donor classification data. Directory contact edits do not update donor records.

## Legacy Bearer Access

The request-to-actor helper uses `requireCapability`, which requires platform-user session authentication. A legacy parish bearer token alone resolves to no directory actor.

## Publication-State Bypass

Ordinary projections require enabled settings and approved publication profiles. Draft, pending, paused, archived, and not-configured profiles do not produce ordinary-member projections.

## Audit Leakage

Contact audit events store masked contact values. Full addresses are omitted from audit summaries.

## Residual Risks

- No UI exists yet, so self-service user experience and user-confirmed consent remain future work.
- Capabilities are broader than the eventual mature matrix.
- Publication approval has service behavior but no review screen.
- Sensitive access observability is service-only; route-level logging will be added when routes exist.
