// Compile-only callers. Never executed or deployed.
import type { DirectoryContext } from '../../src/directory/contracts.js';
import { createRecurringTransaction } from '../../src/accounting/index.js';
declare const env: Env;
declare const request: Request;
declare const directoryContext: DirectoryContext;
import * as m0 from '../../src/learn/academic-records.js';
import * as m1 from '../../src/learn/academic-print-templates.js';
import * as m2 from '../../src/handlers/directory-imports.js';
const response2_handleDirectoryImports: Promise<Response | null> = m2.handleDirectoryImports(
  request,
  env,
  directoryContext,
  '/imports'
);
void response2_handleDirectoryImports;
import * as m3 from '../../src/handlers/admin-relationships.js';
const response3_handleAdminRelationships: Promise<Response | null> = m3.handleAdminRelationships(request, env);
void response3_handleAdminRelationships;
import * as m4 from '../../src/handlers/parish-interest.js';
const response4_handleParishInterest: Promise<Response | null> = m4.handleParishInterest(request, env);
void response4_handleParishInterest;
import * as m5 from '../../src/handlers/contact.js';
const response5_handleContact: Promise<Response | null> = m5.handleContact(request, env);
void response5_handleContact;
const response5_handleAdminContactLeads: Promise<Response | null> = m5.handleAdminContactLeads(request, env);
void response5_handleAdminContactLeads;
import * as m6 from '../../src/handlers/accounting-adjustments.js';
const response6_handleAccountingAdjustments: Promise<Response | null> = m6.handleAccountingAdjustments(
  request,
  env,
  'fixture-parish'
);
void response6_handleAccountingAdjustments;
import * as m7 from '../../src/handlers/accounting-governance.js';
const response7_handleAccountingGovernance: Promise<Response | null> = m7.handleAccountingGovernance(
  request,
  env,
  'fixture-parish'
);
void response7_handleAccountingGovernance;
import * as m8 from '../../src/handlers/accounting-recurring.js';
const response8_handleAccountingRecurring: Promise<Response | null> = m8.handleAccountingRecurring(
  request,
  env,
  'fixture-parish'
);
void response8_handleAccountingRecurring;
import * as m9 from '../../src/handlers/accounting-reconciliation-commerce.js';
const response9_handleAccountingReconciliationCommerce: Promise<Response | null> =
  m9.handleAccountingReconciliationCommerce(request, env, 'fixture-parish');
void response9_handleAccountingReconciliationCommerce;
import * as m10 from '../../src/handlers/accounting-attachments.js';
const response10_handleAccountingAttachments: Promise<Response | null> = m10.handleAccountingAttachments(
  request,
  env,
  'fixture-parish'
);
void response10_handleAccountingAttachments;
import * as m11 from '../../src/handlers/accounting-migration.js';
const response11_handleAccountingMigration: Promise<Response | null> = m11.handleAccountingMigration(
  request,
  env,
  'fixture-parish'
);
void response11_handleAccountingMigration;
import * as m12 from '../../src/handlers/accounting-setup-reports.js';
const response12_handleAccountingSetupReports: Promise<Response | null> = m12.handleAccountingSetupReports(
  request,
  env,
  'fixture-parish'
);
void response12_handleAccountingSetupReports;
import * as m13 from '../../src/handlers/accounting-close.js';
const response13_handleAccountingClose: Promise<Response | null> = m13.handleAccountingClose(
  request,
  env,
  'fixture-parish'
);
void response13_handleAccountingClose;
import * as m14 from '../../src/handlers/directory-media.js';
const response14_handleDirectoryMedia: Promise<Response | null> = m14.handleDirectoryMedia(request, env);
void response14_handleDirectoryMedia;
import * as m15 from '../../src/handlers/directory-member.js';
const response15_handleDirectoryMember: Promise<Response | null> = m15.handleDirectoryMember(request, env);
void response15_handleDirectoryMember;
import * as m16 from '../../src/handlers/koinonia-access.js';
const response16_handleKoinoniaAccess: Promise<Response | null> = m16.handleKoinoniaAccess(request, env);
void response16_handleKoinoniaAccess;
import * as m17 from '../../src/handlers/koinonia-community-tools.js';
const response17_handleDonorKoinoniaCommunityTools: Promise<Response | null> = m17.handleDonorKoinoniaCommunityTools(
  request,
  env
);
void response17_handleDonorKoinoniaCommunityTools;
import * as m18 from '../../src/handlers/platform-actions.js';
const response18_handleLearnOdysseyActivate: Promise<Response | null> = m18.handleLearnOdysseyActivate(request, env);
void response18_handleLearnOdysseyActivate;
const response18_handleHealth: Promise<Response | null> = m18.handleHealth(env);
void response18_handleHealth;
import * as m19 from '../../src/handlers/accounting-access.js';
const response19_handleAccountingAccess: Promise<Response | null> = m19.handleAccountingAccess(
  request,
  env,
  'fixture-parish'
);
void response19_handleAccountingAccess;
import * as m20 from '../../src/handlers/accounting-activation.js';
const response20_handleAccountingActivation: Promise<Response | null> = m20.handleAccountingActivation(
  request,
  env,
  'fixture-parish',
  '/activation'
);
void response20_handleAccountingActivation;
import * as m21 from '../../src/handlers/accounting-payables-budgets.js';
const response21_handleAccountingPayablesBudgets: Promise<Response | null> = m21.handleAccountingPayablesBudgets(
  request,
  env,
  'fixture-parish'
);
void response21_handleAccountingPayablesBudgets;
import * as m22 from '../../src/directory/claims.js';
import * as m23 from '../../src/handlers/admin-email-diagnostics.js';
const response23_handleAdminEmailDiagnostics: Promise<Response | null> = m23.handleAdminEmailDiagnostics(request, env);
void response23_handleAdminEmailDiagnostics;
import * as m24 from '../../src/handlers/resend-webhook.js';
const response24_handleResendWebhook: Promise<Response | null> = m24.handleResendWebhook(request, env);
void response24_handleResendWebhook;
void m0.closeLearnTerm(
  env,
  {
    identity: { householdId: 'fixture-household' },
    children: [{ id: 'fixture-child' }],
    terms: [{ id: 'fixture-term' }],
  },
  'fixture-term'
);
const grade: string = m0.computeSubjectGrade({ percent: 90 }, 'letter-grade');
void grade;
const report: string = m1.renderReportCardTemplate({
  studentName: 'Fixture',
  courses: [{ courseTitle: 'Math', grades: [{ termIndex: 1, letterGrade: 'A' }] }],
});
void report;
void m1.renderHighSchoolTranscriptTemplate({ courses: [] });
// @ts-expect-error child identity remains a string across term closure.
void m0.closeLearnTerm(env, { children: [{ id: 42 }] }, 'fixture-term');
// @ts-expect-error grade collections cannot be arbitrary strings.
void m1.renderReportCardTemplate({ courses: [{ grades: 'invalid' }] });
// @ts-expect-error legacy domain calls still require an identified actor.
void createRecurringTransaction(env.AGAPAY_DB, { actor: { id: 42, capabilities: [] } });
// @ts-expect-error Accounting endpoints require a string parish scope.
void m6.handleAccountingAdjustments(request, env, 42);
void m22.inspectDirectoryInvitationForRecipient(env, { token: 'synthetic-fixture-token' }).then((invitation) => {
  // @ts-expect-error recipient views must not expose stored token hashes.
  void invitation.token_hash;
});
void m22.acceptDirectoryInvitation(env, {
  user: { id: 'fixture-user', email: 'fixture@example.test' },
  token: 'synthetic-fixture-token',
});
// @ts-expect-error claims require a string account identity.
void m22.acceptDirectoryInvitation(env, { user: { id: 42 }, token: 'synthetic-fixture-token' });
