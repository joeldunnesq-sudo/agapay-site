# Accounting Incident Runbook

## Scope

This runbook covers future accounting incidents involving source-event processing, background jobs, storage exports, restore validation, migration orchestration, and accounting gateway access.

It does not authorize direct ledger edits, journal edits, production migration changes, or manual posting.

## First Response

1. Capture the correlation ID, parish ID if present, environment, event type, and approximate timestamp.
2. Confirm the environment before taking action.
3. Preserve source events and failed-job records.
4. Do not rerun a job unless the idempotency key and retry policy are understood.
5. Escalate if the incident involves cross-parish access, suspected secret leakage, schema drift, restore failure, or migration lock failure.

## Containment

- Disable the specific job route or consumer if repeated processing would amplify damage.
- Quarantine failed restore or import artifacts.
- Block migration orchestration if schema drift, canary failure, or per-parish divergence is detected.
- Use support-action audit events for every manual inspection.

## Recovery

- Replay only from immutable source events or approved backups.
- Prefer idempotent retries through the background-job contract.
- Validate restored data before any tenant is allowed to use it.
- Document every human decision in the incident record.

## Post-Incident

- Review redaction behavior.
- Review retry thresholds and dead-letter handling.
- Add regression tests for the failure mode.
- Update Phase 1 policies if a human accounting decision was required.
