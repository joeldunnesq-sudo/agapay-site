import assert from 'node:assert/strict';

// Reviewed deployment evidence: docs/accounting/133-phase-g-completion-report.md.
// The technical canary has no customer registration or self-service login.
export function accountingAuditOwner(record, knownParishes, productionConfig) {
  assert.match(record.database_identifier, /^agapay-acct-production-[a-z0-9-]+$/);
  if (knownParishes.has(record.parish_id)) return 'parish';
  if (
    record.parish_id === 'agapay-phase-g-canary' &&
    record.database_identifier === 'agapay-acct-production-e4601e1d985ec8dcb9fe'
  ) {
    assert.match(
      productionConfig,
      /binding = "ACCOUNTING_DB_PHASE_G_CANARY"\s+database_name = "agapay-acct-production-e4601e1d985ec8dcb9fe"\s+database_id = "0b55d572-7dbc-4f6d-97a5-826841f4bbb8"/
    );
    return 'technical-canary';
  }
  throw new Error(
    'Accounting parish is absent from the production parish registry and is not the reviewed technical canary'
  );
}
