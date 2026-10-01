import { paidOfferingStatus, type PaidOfferingStatusInput } from './paid-offering-status.js';
import { normalizeEmail } from './normalize-email.js';
import { giftDisplayName, type PublicGiftInput } from './public-gift-model.js';

export interface RecurringGiftInput extends PublicGiftInput, PaidOfferingStatusInput {
  readonly stripeSubscriptionId?: unknown;
  readonly stripe_subscription_id?: unknown;
  readonly title?: unknown;
  readonly failureMessage?: unknown;
  readonly completedAt?: string | number | Date | null;
  readonly failedAt?: string | number | Date | null;
}
interface RecurringGroup {
  key: unknown;
  donorName: unknown;
  donorEmail: unknown;
  amountCents: number;
  frequency: unknown;
  giftType: unknown;
  fund: unknown;
  stripeSubscriptionId: unknown;
  lastPaidAt: string;
  lastFailureAt: string;
  failureMessage: unknown;
}
export type RecurringHealthSummary = ReturnType<typeof summarizeParishRecurringHealth>;

export function recurringOfferingStatus(offering: RecurringGiftInput = {}) {
  const status = String(offering.status || '').toLowerCase();
  const paymentStatus = String(offering.paymentStatus || '').toLowerCase();
  if (['failed', 'payment_failed', 'past_due'].includes(status) || ['failed', 'past_due'].includes(paymentStatus))
    return 'failed';
  if (['cancelled', 'canceled'].includes(status) || ['cancelled', 'canceled'].includes(paymentStatus))
    return 'cancelled';
  if (paidOfferingStatus(offering)) return 'active';
  return 'pending';
}

export function recurringHealthGroupKey(offering: RecurringGiftInput = {}) {
  return (
    offering.stripeSubscriptionId ||
    offering.stripe_subscription_id ||
    [
      normalizeEmail(offering.donorEmail || offering.email || ''),
      offering.frequency || 'recurring',
      offering.amountCents || '',
      offering.giftType || '',
      offering.fund || '',
      offering.campaign || '',
    ].join('|')
  );
}

export function recurringExpectedDays(frequency: unknown = '') {
  const normalized = String(frequency || '').toLowerCase();
  if (normalized === 'weekly') return 10;
  if (normalized === 'biweekly') return 24;
  if (normalized === 'quarterly') return 110;
  if (normalized === 'yearly' || normalized === 'annual') return 400;
  return 45;
}

export function summarizeParishRecurringHealth(records: readonly RecurringGiftInput[] = []) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const groups = new Map<unknown, RecurringGroup>();

  for (const offering of records) {
    const key = recurringHealthGroupKey(offering);
    if (!key) continue;
    const status = recurringOfferingStatus(offering);
    const dateValue = offering.completedAt || offering.failedAt || offering.updatedAt || offering.createdAt || '';
    const timestamp = dateValue ? new Date(dateValue) : null;
    const group = groups.get(key) || {
      key,
      donorName: giftDisplayName(offering) || offering.donorName || 'Anonymous donor',
      donorEmail: offering.donorEmail || offering.email || '',
      amountCents: Number(offering.amountCents || 0),
      frequency: offering.frequency || 'recurring',
      giftType: offering.giftType || 'recurring',
      fund: offering.fund || offering.campaign || offering.title || '',
      stripeSubscriptionId: offering.stripeSubscriptionId || '',
      lastPaidAt: '',
      lastFailureAt: '',
      failureMessage: '',
    };

    if (!group.stripeSubscriptionId && offering.stripeSubscriptionId)
      group.stripeSubscriptionId = offering.stripeSubscriptionId;
    if (!group.donorEmail && offering.donorEmail) group.donorEmail = offering.donorEmail;
    if (!group.fund && (offering.fund || offering.campaign || offering.title))
      group.fund = offering.fund || offering.campaign || offering.title;
    if (!group.amountCents && offering.amountCents) group.amountCents = Number(offering.amountCents || 0);

    if (status === 'active' && timestamp && (!group.lastPaidAt || timestamp > new Date(group.lastPaidAt))) {
      group.lastPaidAt = timestamp.toISOString();
      group.amountCents = Number(offering.amountCents || group.amountCents || 0);
    }
    if (
      (status === 'failed' || status === 'cancelled') &&
      timestamp &&
      (!group.lastFailureAt || timestamp > new Date(group.lastFailureAt))
    ) {
      group.lastFailureAt = timestamp.toISOString();
      group.failureMessage =
        offering.failureMessage || (status === 'cancelled' ? 'Recurring gift cancelled.' : 'Recurring payment failed.');
    }

    groups.set(key, group);
  }

  const rows = Array.from(groups.values()).map((group) => {
    const paidAt = group.lastPaidAt ? new Date(group.lastPaidAt) : null;
    const failureAt = group.lastFailureAt ? new Date(group.lastFailureAt) : null;
    const expectedDays = recurringExpectedDays(group.frequency);
    const daysSincePaid = paidAt ? Math.floor((now.getTime() - paidAt.getTime()) / 86400000) : null;
    const recoveredAfterFailure = Boolean(paidAt && failureAt && paidAt > failureAt);
    const failedThisMonth = Boolean(failureAt && failureAt >= monthStart && !recoveredAfterFailure);
    const lapsed = Boolean(!failedThisMonth && (!paidAt || daysSincePaid! > expectedDays));
    return {
      ...group,
      status: failedThisMonth ? ('failed' as const) : lapsed ? ('lapsed' as const) : ('active' as const),
      daysSincePaid,
      expectedDays,
    };
  });

  rows.sort((a, b) => {
    const order = { failed: 0, lapsed: 1, active: 2 };
    return (
      (order[a.status] ?? 9) - (order[b.status] ?? 9) ||
      String(b.lastFailureAt || b.lastPaidAt || '').localeCompare(String(a.lastFailureAt || a.lastPaidAt || ''))
    );
  });

  return {
    activeCount: rows.filter((row) => row.status === 'active').length,
    failedThisMonthCount: rows.filter((row) => row.status === 'failed').length,
    lapsedCount: rows.filter((row) => row.status === 'lapsed').length,
    monthlyRecurringCents: rows
      .filter((row) => row.status === 'active')
      .reduce((sum, row) => sum + Number(row.amountCents || 0), 0),
    generatedAt: now.toISOString(),
    rows,
  };
}
