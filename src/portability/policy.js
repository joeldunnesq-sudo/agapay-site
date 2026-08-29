import { POLICY_VERSION } from './catalog.js';
import { strictBackupExpiryEnabled } from '../accounting/backup-retention.js';

export const RETENTION_DISCLOSURE_VERSION = '2026-08-29-draft-v1';

// Parish-facing policy copy lives separately from the deletion implementation.
// Any wording change requires a new exact-version approval before closure can run.
export function retentionDisclosure(env) {
  const approved = env.PARISH_RETENTION_DISCLOSURE_APPROVED === RETENTION_DISCLOSURE_VERSION;
  const activeData = 'After you save and verify the final export and explicitly confirm closure, eligible active parish data is deleted. Preparing or downloading an export by itself never deletes data.';
  const financial = 'Accounting books, transaction records, and supporting financial or legal evidence are not erased at closure. They are frozen and access is restricted. They enter retention review seven years after closure, or later when a longer configured accounting period or legal hold applies. A review date does not cause automatic deletion.';
  const support = 'Support and reconciliation correspondence enters retention review three years after closure. A legal hold or a record dependency can require it to remain longer.';
  const closureRecords = 'A minimal closure receipt and suppression record remains while any backup or recovery source could restore the parish. It prevents restored data from reactivating the parish and documents what was closed. Its final disposal requires an approved retention schedule.';
  const sharedAccounts = 'Independent donor accounts, parent-owned Learn records, and identities used by another parish are not deleted because they do not belong only to the closing parish.';
  const backups = strictBackupExpiryEnabled(env)
    ? `AGAPAY recovery objects expire after ${Number(env.ACCOUNTING_BACKUP_RETENTION_DAYS) || 365} days with no newest-copy exception. Provider recovery history expires on its separate schedule. Restores must replay the independent closure ledger before traffic resumes. Retained financial data can appear in later backups until its approved disposal.`
    : 'Strict backup expiry is awaiting release verification. The existing process preserves the newest recovery copy if every copy is expired, so automatic parish closure remains unavailable.';
  const providers = 'Records held independently by Stripe, email delivery providers, external media services, or people who already downloaded a copy are outside the AGAPAY parish purge and follow those providers’ or recipients’ controls.';
  return {
    version: RETENTION_DISCLOSURE_VERSION,
    policyVersion: POLICY_VERSION,
    status: approved ? 'approved' : 'draft_pending_approval',
    approvalRequired: !approved,
    activeData,
    financial,
    support,
    closureRecords,
    sharedAccounts,
    backups,
    providers,
    sections: [
      { key: 'activeData', title: 'Eligible active parish data', text: activeData },
      { key: 'financial', title: 'Accounting, financial, and legal records', text: financial },
      { key: 'support', title: 'Support records', text: support },
      { key: 'closureRecords', title: 'Closure safeguards', text: closureRecords },
      { key: 'sharedAccounts', title: 'Shared or independent accounts', text: sharedAccounts },
      { key: 'backups', title: 'Backups and recovery copies', text: backups },
      { key: 'providers', title: 'Copies outside AGAPAY', text: providers },
    ],
  };
}
