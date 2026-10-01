import {
  summarizeParishRecurringHealth,
  recurringOfferingStatus,
  type RecurringGiftInput,
} from '../../src/lib/recurring-health.js';
import { paidOfferingStatus } from '../../src/lib/paid-offering-status.js';
import { normalizeEmail } from '../../src/lib/normalize-email.js';
const records: readonly RecurringGiftInput[] = [{ status: 'paid', amountCents: '100', createdAt: new Date() }];
const result = summarizeParishRecurringHealth(records);
const status: 'failed' | 'lapsed' | 'active' = result.rows[0].status;
const days: number | null = result.rows[0].daysSincePaid;
const paid: boolean = paidOfferingStatus(records[0]);
const email: string = normalizeEmail(1);
const state: 'failed' | 'cancelled' | 'active' | 'pending' = recurringOfferingStatus(records[0]);
void [status, days, paid, email, state];
// @ts-expect-error: nullable lapse age needs narrowing.
const age: number = result.rows[0].daysSincePaid;
void age;
// @ts-expect-error: legacy display values are unvalidated.
const name: string = result.rows[0].donorName;
void name;
// @ts-expect-error: timestamp inputs must support Date construction.
summarizeParishRecurringHealth([{ completedAt: {} }]);
// @ts-expect-error: inputs remain read-only.
records[0].status = 'failed';
