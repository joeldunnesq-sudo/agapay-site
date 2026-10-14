import {
  sweepAccountingBackupRetention,
  accountingBackupRetentionDays,
  type BackupRetentionEnv,
} from '../../src/accounting/backup-retention.js';
const env: BackupRetentionEnv = {};
void sweepAccountingBackupRetention(env, '2030-01-01');
const days: number = accountingBackupRetentionDays({ ACCOUNTING_BACKUP_RETENTION_DAYS: '365' });
void days;
// @ts-expect-error Sweep time must be a numeric timestamp or date string.
void sweepAccountingBackupRetention(env, true);
// @ts-expect-error Backup list binding must be callable.
const invalid: BackupRetentionEnv = { ACCOUNTING_BACKUPS: { list: 'invalid' } };
void invalid;
// @ts-expect-error Closure ledger must expose its put operation.
const missing: BackupRetentionEnv = { PARISH_CLOSURE_LEDGER: {} };
void missing;
async function resultContract() {
  const result = await sweepAccountingBackupRetention({});
  const count: number = result.deleted;
  void count;
  // @ts-expect-error Deletion counts are numeric.
  const text: string = result.deleted;
  void text;
}
void resultContract;
