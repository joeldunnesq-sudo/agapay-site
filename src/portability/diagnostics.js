const CONFIRMATION_STAGES = Object.freeze({
  freeze_books: 'freezing_accounting',
  authorize: 'validating_final_state',
  releasing: 'releasing_safeguards',
});

const FAILURE_FAMILIES = Object.freeze([
  [/^backup_/, 'backup_expiry'],
  [/^(write_barrier_|schema_|unclassified_|incomplete_schema$|cross_parish_|deletion_dependency_)/, 'database_integrity'],
  [/^(archive_|export_|read_failed$|asset_|missing_asset$|invalid_asset$|video_export_)/, 'export_integrity'],
  [/^(storage_|file_|inventory_|operation_)/, 'file_storage'],
  [/^legacy_/, 'legacy_data'],
  [/^accounting_/, 'accounting'],
  [/^(suppression_|restore_|quarantine_)/, 'restore_protection'],
  [/^(cache_|retention_|retained_)/, 'retention_disposal'],
  [/^(confirmation_|closure_|wrong_actor$|preparation_|deletion_started$)/, 'closure_authorization'],
  [/^(portability_|job_|request_|retry_|too_many_|import_|invalid_|not_found$|parish_)/, 'workflow'],
]);

function stageFor(job) {
  if (CONFIRMATION_STAGES[job?.confirmation_stage]) return CONFIRMATION_STAGES[job.confirmation_stage];
  if (job?.status === 'active_data_deleted') return 'completed';
  if (job?.status === 'cancelled') return 'cancelled';
  if (job?.status === 'failed') return job?.confirmed_at ? 'stopped_during_deletion' : 'stopped_before_deletion';
  if (job?.status === 'deleting') return 'deleting_active_data';
  if (job?.status === 'ready') return job?.mode === 'close' ? 'awaiting_closure_confirmation' : 'ready_for_download';
  if (job?.status === 'preparing') return 'preparing_export';
  return 'unknown';
}

function failedSafeguardFor(errorCode) {
  if (!errorCode) return null;
  for (const [pattern, family] of FAILURE_FAMILIES) if (pattern.test(errorCode)) return family;
  return 'unexpected_failure';
}

// This is an allowlisted projection. Never spread a job row into diagnostic
// output: it contains parish identifiers, actor fingerprints, object keys,
// archive hashes, and the private export manifest.
export function portabilityDiagnosticSnapshot(job) {
  return Object.freeze({
    version: 1,
    stage: stageFor(job),
    failedSafeguard: failedSafeguardFor(job?.error_code),
  });
}
