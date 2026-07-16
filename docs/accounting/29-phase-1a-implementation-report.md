# Phase 1A Implementation Report

## Package

Accounting Control Plane Registry & Lifecycle

## Status

Complete locally. Verified with focused tests and full `npm run check`.

## Files Created

- `migrations/0021_accounting_control_plane.sql`
- `src/accounting/control-plane.js`
- `scripts/accounting-control-plane-tests.mjs`
- `docs/accounting/25-phase-1a-control-plane-architecture.md`
- `docs/accounting/26-phase-1a-registry-schema-report.md`
- `docs/accounting/27-phase-1a-lifecycle-state-machine.md`
- `docs/accounting/28-phase-1a-security-review.md`
- `docs/accounting/29-phase-1a-implementation-report.md`

## Files Modified

- `src/accounting/database-resolution.js`
- `src/accounting/index.js`
- `package.json`

## Implementation Summary

Phase 1A adds the central registry tables and lifecycle service that future accounting packages will use to determine whether a parish accounting database exists and is safe to use.

The implementation includes:

- normalized control-plane schema
- accounting entity lifecycle state machine
- database registry row model
- server-side resolver
- health validation helpers
- schema version update operation
- lifecycle event history
- central audit integration
- deterministic automated tests

## Tests

Focused:

- `node scripts/accounting-control-plane-tests.mjs`

Full:

- `npm run check`

Result: passed.

## Acceptance Criteria

| Criterion | Status |
| --- | --- |
| `npm run check` passes | Met |
| No existing functionality regresses | Met |
| No ledger/accounting data tables introduced | Met |
| Registry is normalized | Met |
| No JSON-blob persistence introduced for registry facts | Met |
| Resolver rejects client-supplied database identifiers | Met |
| Lifecycle actions are audited | Met |
| Cross-parish isolation is tested | Met |
| Suspended/archive rejection is tested | Met |
| Documentation is complete | Met |

## Phase 1B Readiness

Ready for Phase 1B: Per-Parish Accounting Database Provisioning.

Prerequisites and recommended refinements for Phase 1B:

- define the exact physical D1 naming convention
- implement provisioning against Cloudflare only through server-side operations
- preserve the resolver boundary and do not expose physical database identifiers to browsers
- add provisioning failure and retry policy using the Phase 0.75F job envelope
- add migration canary criteria before marking a database `ready`
- decide whether support-only validation tools need a distinct `accounting.audit` or platform support capability

## Final Verdict

Phase 1A is accepted as the accounting control-plane foundation. It creates registry and lifecycle safety without beginning ledger development.
