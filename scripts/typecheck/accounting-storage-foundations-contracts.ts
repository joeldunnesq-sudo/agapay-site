import {
  createAccountingR2ObjectKey,
  validateAccountingDocumentUpload,
  assertStateTransition,
  createBackupRequest,
  createMigrationOrchestrationPlan,
} from '../../src/accounting/storage-foundations.js';
const key: string = createAccountingR2ObjectKey({
  environment: 'test',
  parishId: 'p',
  documentClass: 'receipt',
  objectId: 1,
});
void key;
validateAccountingDocumentUpload({ contentType: 'application/pdf', sizeBytes: '1', checksum: 'x' });
createBackupRequest({ environment: 'test', requestedBy: 'u', archivedTenant: true });
const plan = createMigrationOrchestrationPlan({ environment: 'test', migrationId: 'm', lockId: 'l' });
const blockers: string[] = plan.blockers;
void blockers;
// @ts-expect-error State names must be strings.
assertStateTransition('backup', 123, 'running');
// @ts-expect-error Drift flag must be boolean.
createMigrationOrchestrationPlan({ schemaDriftDetected: 'true' });
// @ts-expect-error Archived flag must be boolean.
createBackupRequest({ archivedTenant: 'true' });
// @ts-expect-error Content types must be strings.
validateAccountingDocumentUpload({ contentType: 123 });
// @ts-expect-error Blocker values are strings.
plan.blockers.push(123);
