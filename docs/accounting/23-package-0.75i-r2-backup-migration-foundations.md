# Package 0.75I - R2, Backup, Restore, and Migration Foundations

## Objective

Package 0.75I creates guardrails for future accounting documents, exports, backups, restores, and migration orchestration without creating buckets, uploading objects, applying migrations, or touching production.

## Implementation

- Added `src/accounting/storage-foundations.js`.
- Added deterministic R2 object-key construction that avoids parish names and normalizes path segments.
- Added document content-type, size, checksum, and parish-access validation.
- Added backup and restore state transition guards.
- Added backup request metadata with duplicate keys.
- Added migration orchestration planning with locks, schema-drift blockers, canary blockers, and per-parish divergence blockers.
- Added `scripts/accounting-storage-foundation-tests.mjs`.

## Tests

- `node scripts/accounting-storage-foundation-tests.mjs`
- `npm run check`

## Acceptance Verdict

Accepted. Storage and migration foundations are now explicit and test-covered without provisioning resources or applying remote migrations.

## Manual Actions Deferred

- Create R2 buckets and lifecycle rules.
- Define backup retention and restore approval policy.
- Define migration canary criteria and rollback authority.
- Define archived tenant export policy.
