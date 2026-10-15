import { createZip, sha256, utf8 } from '../../src/portability/archive.js';
import { portabilityDiagnosticSnapshot } from '../../src/portability/diagnostics.js';
import { cloudBackupStatus } from '../../src/portability/cloud-backup.js';
import { retentionDisclosure } from '../../src/portability/policy.js';
import { parsePublicMediaPath, publicMediaBase } from '../../src/portability/public-media.js';
import { verifyBackupExpiryEvidence } from '../../src/portability/backup-evidence.js';
import { PORTABILITY_SCHEMA } from '../../src/portability/accounting-schema.js';
import { accountingLegacyColumns } from '../../src/portability/accounting-legacy.js';
import { inspectStorage, schemaMetadata, exportRow, sanitizeValue } from '../../src/portability/catalog.js';
import { suppressionRecord, assertRestoreSafe } from '../../src/portability/suppression.js';
import { configuration, syncConfigurationMirrors } from '../../src/recovery/configuration.js';
import { protectFileStorage, withStorageOperation, inventoryParishObjects } from '../../src/portability/storage.js';
import { classifyLegacyRecord, collectLegacyRecords } from '../../src/portability/legacy.js';
import { resolvePortabilityBooks, inspectBooks } from '../../src/portability/accounting.js';
import { closureReadiness, parishClosureState, barrierStatements } from '../../src/portability/closure.js';
import { retentionDeadline, disposeParishFiles } from '../../src/portability/disposal.js';
import { collectParishExport } from '../../src/portability/export.js';
import { requireQuarantine } from '../../src/portability/maintenance.js';
import { replayClosureSuppressions } from '../../src/portability/restore.js';
import { captureDatabase, readPart, query } from '../../src/recovery/storage.js';
import { freeze } from '../../src/recovery/locks.js';
import { retainFinancialEvidence } from '../../src/recovery/retention.js';
import { downloadRecoverySnapshot } from '../../src/recovery/archive.js';
import { runRecoveryJobs } from '../../src/recovery/maintenance.js';
import { portabilityBudget, recoveryBudget, portabilityBudgetUsage } from '../../src/portability/budget.js';
import type {
  PortabilityJob,
  RecoveryOperation,
  RecoverySnapshot,
  ClosureManifest,
  PortabilityDatabase,
} from '../../src/portability/contracts.js';
declare const env: Env;
declare const job: PortabilityJob;
declare const operation: RecoveryOperation;
declare const snapshot: RecoverySnapshot;
declare const manifest: ClosureManifest;
declare const remoteBooks: PortabilityDatabase;
const parishId = 'fixture-parish';
void sha256(createZip([{ name: 'fixture.json', bytes: utf8('{}') }]));
void portabilityDiagnosticSnapshot({ status: 'ready', mode: 'export' });
void cloudBackupStatus(env);
void retentionDisclosure(env);
void parsePublicMediaPath('/api/public/parish-assets/campaign/file.png');
void publicMediaBase(env, 'CAMPAIGN_ASSETS');
void verifyBackupExpiryEvidence(env);
const columns: readonly string[] | undefined = PORTABILITY_SCHEMA.accounting_accounts;
void columns;
void accountingLegacyColumns('registrations');
void inspectStorage(env.AGAPAY_DB);
void schemaMetadata(remoteBooks, ['accounting_accounts']);
const safe: unknown = sanitizeValue({ password: 'not-a-secret-fixture', label: 'label' });
void safe;
void exportRow('registrations', { data: '{}' });
void suppressionRecord(env, parishId);
void assertRestoreSafe(env);
void configuration({ parishName: 'Fixture' });
void syncConfigurationMirrors(env, parishId, ['fixture']);
void protectFileStorage(env);
void withStorageOperation(
  env,
  { parishId, binding: 'CAMPAIGN_ASSETS', key: 'fixture', operation: 'put' },
  async () => 1
).then((value) => {
  const count: number = value;
  return count;
});
void inventoryParishObjects(env, parishId);
void classifyLegacyRecord('fixture', '{}', async () => null);
void collectLegacyRecords(env, parishId);
void resolvePortabilityBooks(env, parishId, [{ id: 'entity', parish_id: parishId }]);
void inspectBooks(remoteBooks);
void closureReadiness(env, manifest);
void parishClosureState(env, parishId);
void barrierStatements(['registrations']);
void retentionDeadline(Date.now(), 7);
void disposeParishFiles(env, job, manifest);
void collectParishExport(env, parishId);
void requireQuarantine(env, 'fixture');
void replayClosureSuppressions(env, 'fixture');
void captureDatabase(remoteBooks, 'books', parishId);
void readPart(env, snapshot, 'files').then((value) => {
  const body: string | undefined = value.files[0]?.body;
  return body;
});
void readPart(env, snapshot, 'books').then((value) => {
  const schema: string | undefined = value?.schema;
  return schema;
});
void query(env.AGAPAY_DB, 'SELECT 1').first<{ value: number }>();
void freeze(env, operation, remoteBooks);
void retainFinancialEvidence(env, operation, snapshot);
void downloadRecoverySnapshot(env, parishId, snapshot.id, 'parish');
void runRecoveryJobs(env);
const budget = portabilityBudget(env);
recoveryBudget(budget)();
const operations: number = portabilityBudgetUsage(budget).operations;
void operations;
// @ts-expect-error Archive contents must be bytes, not an unencoded object.
void createZip([{ name: 'fixture.json', bytes: {} }]);
// @ts-expect-error A recovery component must name an existing part.
void readPart(env, snapshot, 'credentials');
// @ts-expect-error Database inspection requires a SQL adapter.
void inspectStorage({});
// @ts-expect-error Quarantine evidence must be a string.
void requireQuarantine(env, 123);
// @ts-expect-error Parish identifiers cannot be numeric.
void parishClosureState(env, 123);
// @ts-expect-error The retention period is numeric.
void closureReadiness(env, { accountingRetentionYears: '7' });
// @ts-expect-error An Accounting export needs explicit entity ownership.
void resolvePortabilityBooks(env, parishId, [{ id: 'entity' }]);

void schemaMetadata(remoteBooks, ['accounting_accounts'], 'foreign_key_list').then((metadata) => {
  const parent: string | undefined = metadata.get('accounting_accounts')?.[0]?.table;
  return parent;
});
// @ts-expect-error A PRAGMA metadata kind must be explicitly reviewed.
void schemaMetadata(remoteBooks, ['accounting_accounts'], 'arbitrary_pragma');
