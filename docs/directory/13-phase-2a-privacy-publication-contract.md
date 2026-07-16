# Parish Directory Phase 2A -- Privacy and Publication Self-Service Contract

Phase 2A reuses the Phase 1B privacy and publication services. It does not introduce a second privacy model.

## Privacy Preferences

Self-service privacy changes call `setFieldPrivacyPreference`. The effective result is constrained by:

- the requested preference;
- the Phase 1B field default;
- parish directory settings;
- child flags;
- protected-person flags;
- protected-address flags;
- whether the field is publication eligible.

The user preference is not absolute authority. If the requested setting is broader than policy allows, the request is rejected.

## Protected Records

Children remain hidden by default. Protected people fail closed. Protected addresses cannot be published to ordinary directory members and are returned to the UI with sensitive street/postal details omitted.

Giving, donor, Learn, and accounting information are not privacy-controlled directory fields and are not read by the Phase 2A services.

## Publication

Self-service publication transitions reuse the Phase 1B lifecycle:

- `not_configured`
- `draft`
- `pending_approval`
- `approved`
- `paused`
- `archived`

Self-service users may submit for review or pause publication where they manage the owner. They cannot approve their own publication profile. Profile edits do not auto-approve or auto-publish a directory record.

## Contact Verification

Directory contact verification remains separate from platform email verification. Phase 2A preserves existing verification fields but does not falsely mark self-entered contacts as verified.
