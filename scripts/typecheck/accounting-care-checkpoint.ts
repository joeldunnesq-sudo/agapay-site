import { processDueRecurringTransactions } from '../../src/accounting/recurring/service.js';
import { processDueRecurringBills } from '../../src/accounting/payables/recurring-bills.js';
import { createJournalDraft, type LedgerServiceActor } from '../../src/accounting/ledger/service.js';
import { createStripeSourceEventEnvelope } from '../../src/accounting/stripe-source-events.js';
import {
  createD1DatabaseFacade,
  createBoundD1ProvisioningAdapter,
} from '../../src/accounting/provisioning/adapters.js';
import { activationOptions } from '../../src/accounting/provisioning/activation.js';
import { centerCropForAspect, transformVariant } from '../../src/directory/media-transform.js';
import { parseKoinoniaCalendarIcs } from '../../src/handlers/donor-parish-calendar.js';
import { buildPastoralDigestGroups } from '../../src/sacraments/pastoral-digest.js';
import { handleMfaVerify } from '../../src/handlers/mfa.js';
import type { PortabilityDatabase } from '../../src/portability/contracts.js';
declare const db: PortabilityDatabase;
const actor: LedgerServiceActor = { id: 'test', capabilities: ['accounting.journals.post', 'ap.enter'] };
processDueRecurringTransactions(db, { actor, asOfDate: '2026-10-15', maxPostings: 100 });
processDueRecurringBills(db, { actor, asOfDate: '2026-10-15', maxBills: 100 });
const facade: PortabilityDatabase = createD1DatabaseFacade(createBoundD1ProvisioningAdapter({}), 'ACCOUNTING_DB');
facade.prepare('SELECT id FROM accounting_accounts').first<{ id: string }>();
activationOptions({ startDate: '2026-01-01', fiscalYearStartMonth: 1 });
const envelope = createStripeSourceEventEnvelope({
  id: 'evt_test',
  type: 'payout.paid',
  data: { object: { id: 'po_test', amount: 100 } },
});
const amount: number = envelope.amountCents;
const crop = centerCropForAspect(800, 600, 200, 200);
const events = parseKoinoniaCalendarIcs('BEGIN:VCALENDAR');
const groups = buildPastoralDigestGroups(
  [{ assigned_priest_email: 'a@example.test', next_due_on: '2026-10-15' }],
  '2026-10-15'
);
void [amount, crop, events, groups];
// @ts-expect-error Processing dates must be calendar strings.
processDueRecurringTransactions(db, { actor, asOfDate: 42 });
// @ts-expect-error Internal batch limits must be numeric.
processDueRecurringBills(db, { actor, asOfDate: '2026-10-15', maxBills: 'all' });
// @ts-expect-error Journal lines identify both account and fund.
createJournalDraft(db, { actor, entryDate: '2026-10-15', description: 'test', lines: [{ accountId: 'a' }] });
// @ts-expect-error Secure image dimensions must be numeric.
centerCropForAspect('800', 600, 200, 200);
// @ts-expect-error Variant transformations need a decoded source.
transformVariant({ targetWidth: 200, targetHeight: 200 });
// @ts-expect-error Route handlers require a real Request.
handleMfaVerify({}, {});

declare const privateEnvironment: AccountingProvisionerEnv;
privateEnvironment.ACCOUNTING_ACTIVATION.create({ id: 'test', params: { parishId: 'test', operationId: 'test' } });
// @ts-expect-error Workflow dispatch must identify its reserved operation.
privateEnvironment.ACCOUNTING_ACTIVATION.create({ id: 'test', params: { parishId: 'test' } });
// @ts-expect-error The private provisioner has no public asset binding.
privateEnvironment.ASSETS.fetch('https://example.test');
