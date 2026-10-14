import assert from 'node:assert/strict';
import {
  ACCOUNTING_DOCUMENT_CLASSES,
  ACCOUNTING_R2_ALLOWED_CONTENT_TYPES,
  BACKUP_STATES,
  RESTORE_STATES,
  sanitizeStorageSegment,
  createAccountingR2ObjectKey,
  validateAccountingDocumentUpload,
  assertStateTransition,
  createBackupRequest,
  createMigrationOrchestrationPlan,
} from '../src/accounting/storage-foundations.js';
import { ValidationError } from '../src/accounting/errors.js';
assert.equal(sanitizeStorageSegment(' Hello / World '), 'hello-world');
assert.equal(sanitizeStorageSegment(123), '123');
for (const value of [null, undefined, '', ' ', '/', '.', '..'])
  assert.throws(() => sanitizeStorageSegment(value), ValidationError);
for (const documentClass of ACCOUNTING_DOCUMENT_CLASSES)
  assert.equal(
    createAccountingR2ObjectKey({
      environment: ' TEST ',
      parishId: 'Parish A',
      documentClass,
      objectId: 'ID',
      extension: 'PDF',
    }),
    `accounting/test/parish-a/${documentClass}/v1/id.pdf`
  );
assert.equal(
  createAccountingR2ObjectKey({
    environment: 'test',
    parishId: 'p',
    documentClass: 'receipt',
    objectId: 'x',
    version: 0,
  }),
  'accounting/test/p/receipt/v1/x.bin'
);
assert.equal(
  createAccountingR2ObjectKey({
    environment: 'test',
    parishId: 'p',
    documentClass: 'receipt',
    objectId: 'x',
    version: '2',
  }),
  'accounting/test/p/receipt/v2/x.bin'
);
assert.throws(() => createAccountingR2ObjectKey({ documentClass: 'unknown' }), ValidationError);
const upload = {
  contentType: 'application/pdf',
  sizeBytes: 1,
  checksum: ' checksum ',
  parishId: 'p',
  requesterParishId: 'p',
};
for (const contentType of ACCOUNTING_R2_ALLOWED_CONTENT_TYPES)
  assert.equal(validateAccountingDocumentUpload({ ...upload, contentType }), true);
assert.equal(validateAccountingDocumentUpload({ ...upload, sizeBytes: 25 * 1024 * 1024 }), true);
assert.equal(validateAccountingDocumentUpload({ ...upload, sizeBytes: '1' }), true);
for (const sizeBytes of [0, -1, 25 * 1024 * 1024 + 1, null, undefined])
  assert.throws(() => validateAccountingDocumentUpload({ ...upload, sizeBytes }), ValidationError);
assert.throws(() => validateAccountingDocumentUpload({ ...upload, contentType: 'text/html' }), ValidationError);
assert.throws(() => validateAccountingDocumentUpload({ ...upload, checksum: ' ' }), ValidationError);
assert.throws(() => validateAccountingDocumentUpload({ ...upload, requesterParishId: 'other' }), ValidationError);
assert.equal(validateAccountingDocumentUpload({ ...upload, requesterParishId: '' }), true);
const transitions = {
  backup: {
    requested: ['running', 'failed'],
    running: ['completed', 'failed'],
    completed: ['expired'],
    failed: [],
    expired: [],
  },
  restore: {
    requested: ['validating', 'rejected'],
    validating: ['ready', 'rejected', 'failed'],
    ready: ['completed', 'failed'],
    rejected: [],
    completed: [],
    failed: [],
  },
};
for (const [kind, states] of [
  ['backup', BACKUP_STATES],
  ['restore', RESTORE_STATES],
])
  for (const from of [...states, 'unknown'])
    for (const to of states) {
      if ((transitions[kind][from] || []).includes(to)) assert.equal(assertStateTransition(kind, from, to), true);
      else assert.throws(() => assertStateTransition(kind, from, to), ValidationError);
    }
assert.equal(assertStateTransition('other', 'requested', 'running'), true);
const backup = createBackupRequest({
  environment: ' TEST ',
  tenantId: 'Tenant A',
  requestedBy: ' user ',
  archivedTenant: true,
});
assert.equal(backup.kind, 'backup');
assert.equal(backup.state, 'requested');
assert.equal(backup.environment, 'test');
assert.equal(backup.tenantId, 'tenant-a');
assert.equal(backup.requestedBy, 'user');
assert.equal(backup.archivedTenant, true);
assert.equal(backup.duplicateKey, 'backup: TEST :Tenant A');
assert.ok(Number.isFinite(Date.parse(backup.requestedAt)));
assert.equal(createBackupRequest({ environment: 'test', requestedBy: 'u' }).tenantId, 'platform');
assert.throws(() => createBackupRequest({ environment: 'test' }), ValidationError);
for (let mask = 0; mask < 8; mask++) {
  const schemaDriftDetected = Boolean(mask & 1),
    failed = Boolean(mask & 2),
    perParishDivergence = Boolean(mask & 4);
  const plan = createMigrationOrchestrationPlan({
    environment: ' TEST ',
    migrationId: ' m ',
    lockId: ' l ',
    schemaDriftDetected,
    canaryStatus: failed ? 'failed' : 'passed',
    perParishDivergence,
  });
  const expected = [];
  if (schemaDriftDetected) expected.push('schema_drift_detected');
  if (failed) expected.push('canary_failed');
  if (perParishDivergence) expected.push('per_parish_divergence');
  assert.deepEqual(plan.blockers, expected);
  assert.equal(plan.allowed, mask === 0);
  assert.equal(plan.migrationId, 'm');
  assert.equal(plan.lockId, 'l');
  assert.equal(plan.environment, 'test');
}
assert.equal(createMigrationOrchestrationPlan({ environment: 'test', migrationId: 'm', lockId: 'l' }).allowed, true);
assert.throws(() => createMigrationOrchestrationPlan({ environment: 'test', migrationId: 'm' }), ValidationError);
console.log(
  'PASS - Accounting object keys, upload boundaries, state transitions, backup requests and migration blockers'
);
