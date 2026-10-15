import { createAccountingJobEnvelope, shouldRetryAccountingJob } from '../../src/accounting/background-jobs.js';
import { recordAttachment } from '../../src/accounting/attachments/service.js';
import { previewActivationChart, commitActivationChart } from '../../src/accounting/provisioning/chart-import.js';
import { applyAccountingMigration } from '../../src/accounting/provisioning/full-schema.js';
import { resolveAccountingDatabase } from '../../src/accounting/database-resolution.js';
import { recognizeGivingStripeFee } from '../../src/accounting/integrations/processor-fees.js';
import {
  recognizeGivingFeeCoverage,
  givingFeeCoverageBackfill,
} from '../../src/accounting/integrations/fee-coverage.js';
import { serviceInvoiceFacts, readServiceCosts } from '../../src/accounting/service-costs.js';
import { readPlatformCosts } from '../../src/stewardship/platform-costs.js';
import { upsertStewardshipFinancialSnapshot } from '../../src/stewardship/financial-snapshots.js';
import { getParishAttendanceTrend } from '../../src/stewardship/attendance.js';
import { handleStewardshipAttendance } from '../../src/handlers/stewardship-attendance.js';
import { aggregateDiocesanStatistics } from '../../src/reports/diocesan-statistics.js';
import { handleDiocesanStatisticsReport } from '../../src/handlers/diocesan-statistics.js';
import { listAccountingStaffProfiles, requireAccountingStaffProfile } from '../../src/lib/accounting-staff.js';
import { createPasswordRecord } from '../../src/lib/core.js';
import { accountingCatalogRequiredForParish } from '../../src/lib/accounting-availability.js';
import { deliverDirectorySignupInvitation } from '../../src/directory/signup-invitation.js';
import { handleDonorNotifications } from '../../src/handlers/donor-notifications.js';
import { loadAdminRegistrationPage } from '../../src/handlers/registration-admin-page.js';
import { saveCommemorationEntry } from '../../src/handlers/parish-commemorations.js';
import { deliverDonationReceipt } from '../../src/payments/donation-receipts.js';
import { applySubscriptionTaxCode } from '../../src/lib/tax-codes.js';
import { fetchPonomarDailyHymns } from '../../src/learn/hymn-source.js';
import { fetchOrthocalDay } from '../../src/learn/readings-source.js';

declare const env: Env;
declare const request: Request;
const actor = { id: 'staff', capabilities: ['accounting.view'] };
const job = createAccountingJobEnvelope({
  type: 'accounting.report.generate',
  parishId: 'parish',
  correlationId: 'request',
});
void shouldRetryAccountingJob(job, { code: 'ClosedPeriodError' });
void recordAttachment(env.AGAPAY_DB, {
  actor,
  entityType: 'bill',
  entityId: 'bill',
  displayName: 'invoice.pdf',
  storageKey: 'private',
  mimeType: 'application/pdf',
  sizeBytes: 42,
  sha256Hex: 'digest',
});
void previewActivationChart(env.AGAPAY_DB, { actor, csv: 'Name,Type', typeMap: { Bank: 'asset' } });
void commitActivationChart(env.AGAPAY_DB, {
  actor,
  csv: '',
  migrationSessionId: 'session',
  confirmed: true,
  fingerprint: 'hash',
  typeMap: {},
});
void applyAccountingMigration(env.AGAPAY_DB, { name: 'migration', sql: 'SELECT 1', sha256: 'hash' });
void resolveAccountingDatabase(env, { parishId: 'parish' });
void recognizeGivingStripeFee(env.AGAPAY_DB, {
  actor,
  entitlementTier: 'parish',
  offering: {},
  donationId: 'gift',
  fundId: 'fund',
  occurredAt: '2026-10-14',
});
void recognizeGivingFeeCoverage(env.AGAPAY_DB, {
  actor,
  entitlementTier: 'parish',
  offering: {},
  originalEventId: 'event',
});
void givingFeeCoverageBackfill(env, env.AGAPAY_DB, {
  actor,
  entitlementTier: 'parish',
  parishId: 'parish',
  year: 2026,
});
void serviceInvoiceFacts(env, { id: 'invoice' }, { parishId: 'parish' });
void readServiceCosts(env, 'parish', 2026);
void readPlatformCosts(env, 'parish', 2026);
void upsertStewardshipFinancialSnapshot(env, {
  parishId: 'parish',
  fiscalYear: 2026,
  restrictedFunds: [{ fundName: 'Mission', beginningBalanceCents: 0 }],
});
void getParishAttendanceTrend(env, { parishId: 'parish', weeks: '52' });
void handleStewardshipAttendance(request, env, 'parish');
void aggregateDiocesanStatistics(env, { parishId: 'parish', year: 2026 });
void handleDiocesanStatisticsReport(request, env, 'parish');
void listAccountingStaffProfiles(env, 'parish').then((profiles) => {
  // @ts-expect-error Public staff summaries must not expose password records.
  return profiles[0]?.pin_record;
});
void requireAccountingStaffProfile(request, env, 'parish', 'accounting.view');
void createPasswordRecord('fixture').then((record) => {
  const version: 'pbkdf2-sha256' = record.version;
  return version;
});
void accountingCatalogRequiredForParish(env, 'parish', {});
void deliverDirectorySignupInvitation(env, {
  email: 'member@example.test',
  name: 'Member',
  parishName: 'Parish',
  rawToken: 'fixture',
  invitationId: 'invite',
});
void handleDonorNotifications(request, env);
void loadAdminRegistrationPage(env, { limit: 10 });
void saveCommemorationEntry(env, { id: 'entry', parishId: 'parish', living: ['Name'] });
void deliverDonationReceipt(env, {}, async () => ({ status: 'sent' }));
void applySubscriptionTaxCode(new URLSearchParams(), 'prefix', 'giving', env);
void fetchPonomarDailyHymns({ civilDate: '2026-10-14' });
void fetchOrthocalDay({ civilDate: '2026-10-14' });
void commitActivationChart(env.AGAPAY_DB, {
  actor,
  csv: '',
  migrationSessionId: 'session',
  // @ts-expect-error Chart confirmation is a boolean, not a form string.
  confirmed: 'true',
  fingerprint: 'hash',
  typeMap: {},
});
// @ts-expect-error Finance calculations require a numeric year.
void readServiceCosts(env, 'parish', '2026');
// @ts-expect-error Attendance reads require a database binding.
void getParishAttendanceTrend({}, { parishId: 'parish' });
// @ts-expect-error Receipt delivery callbacks must return a string status.
void deliverDonationReceipt(env, {}, async () => ({ status: 200 }));
// @ts-expect-error Only the configured subscription product identifiers are accepted.
void applySubscriptionTaxCode(new URLSearchParams(), 'prefix', 'unknown', env);
