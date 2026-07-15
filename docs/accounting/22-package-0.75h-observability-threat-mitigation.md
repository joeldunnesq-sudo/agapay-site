# Package 0.75H - Observability and Threat Mitigation

## Objective

Package 0.75H establishes accounting-safe observability primitives before any accounting data, posting engine, or parish accounting database is introduced.

## Implementation

- Added `src/accounting/observability.js`.
- Added a stable accounting event taxonomy for gateway requests, job lifecycle events, database resolution, blocked migrations, support actions, backups, restores, and Stripe source events.
- Added redaction and masking helpers for email addresses, Stripe IDs, R2 object keys, IP addresses, tokens, cookies, passwords, secrets, and private-key-shaped fields.
- Added environment labeling through the existing accounting environment configuration.
- Added safe error responses that preserve correlation IDs without leaking raw secrets or binding details.
- Added support-action audit event requirements.
- Added `scripts/accounting-observability-tests.mjs`.

## Threat Disposition

| Threat | Disposition |
| --- | --- |
| Secret leakage in job or error logs | Mitigated by redaction helpers and safe error responses. |
| Raw database binding exposure | Mitigated by existing gateway/database-resolution boundaries and new log redaction. |
| Support action without audit trail | Mitigated by `createSupportAuditRequirement`. |
| Cross-environment ambiguity | Mitigated by environment labels on accounting log events. |
| Correlation loss across async jobs | Mitigated by required job correlation IDs and log correlation fields. |

## Tests

- `node scripts/accounting-observability-tests.mjs`
- `npm run check`

## Acceptance Verdict

Accepted. Future accounting work now has safe log/event primitives and an incident-ready audit shape.

## Human Policy Decisions Before Phase 1

- Define alert severity thresholds.
- Decide support access approval policy.
- Decide log retention windows for accounting events.
