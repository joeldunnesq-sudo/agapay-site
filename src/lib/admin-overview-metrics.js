// Generated from src/lib/admin-overview-metrics.ts by npm run build:server. Do not edit.
import {
  subscriptionTier,
  subscriptionTiers,
  subscriptionAddOnsFor,
  subscriptionAddOnPricing,
} from './subscriptions.js';
const canceled = (value) => ['cancelled', 'canceled'].includes(String(value || '').toLowerCase());
function buildAdminOverviewMetrics(registrations, now = /* @__PURE__ */ new Date(), total = registrations.length) {
  const weekStart = new Date(now);
  weekStart.setUTCHours(0, 0, 0, 0);
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
  const inWeek = (value) => {
    const time = Date.parse(value || '');
    return Number.isFinite(time) && time >= weekStart.getTime() && time <= now.getTime();
  };
  const result = {
    totalRegistered: total,
    tierBreakdown: [
      ...subscriptionTiers.map((tier) => ({ id: tier.id, label: tier.label, count: 0 })),
      { id: 'unassigned', label: 'Not assigned', count: 0 },
      { id: 'other', label: 'Other / legacy', count: 0 },
    ],
    weekStart: weekStart.toISOString(),
    generatedAt: now.toISOString(),
    timeZone: 'UTC',
    newRegistrations: 0,
    cancellations: 0,
    undatedCancellations: 0,
    activePaidSubscriptions: 0,
    monthlyRecurringCents: 0,
    annualRecurringCents: 0,
    unknownPriceSubscriptions: 0,
    complete: registrations.length === total,
  };
  for (const registration of registrations) {
    const selected = String(registration.subscriptionTier || registration.tier || '')
      .trim()
      .toLowerCase();
    const tierId = selected === 'mission' ? 'starter' : selected || 'unassigned';
    const bucket =
      result.tierBreakdown.find((tier2) => tier2.id === tierId) ||
      result.tierBreakdown.find((tier2) => tier2.id === 'other');
    bucket.count++;
    if (inWeek(registration.receivedAt)) result.newRegistrations++;
    const history = Array.isArray(registration.subscriptionStatusHistory) ? registration.subscriptionStatusHistory : [];
    const dates = history.filter((item) => canceled(item.status)).map((item) => item.at);
    if (registration.subscriptionCancelledAt) dates.push(registration.subscriptionCancelledAt);
    if (dates.some(inWeek)) result.cancellations++;
    const status = String(registration.subscriptionStatus || registration.billingStatus || '').toLowerCase();
    if (canceled(status) && !dates.some((value) => Number.isFinite(Date.parse(value || ''))))
      result.undatedCancellations++;
    if (status !== 'active') continue;
    const tier = subscriptionTier(registration);
    const stored = registration.subscriptionMonthlyCents;
    const amount =
      stored !== void 0 && stored !== null && stored !== ''
        ? Number(stored)
        : tier.monthlyCents == null
          ? NaN
          : tier.monthlyCents +
            subscriptionAddOnsFor(registration).reduce(
              (sum, addOn) => sum + (subscriptionAddOnPricing(addOn)?.monthlyCents || 0),
              0
            );
    if (!Number.isFinite(amount) || amount < 0) {
      result.unknownPriceSubscriptions++;
      continue;
    }
    if (amount > 0) result.activePaidSubscriptions++;
    result.monthlyRecurringCents += Math.round(amount);
  }
  result.annualRecurringCents = result.monthlyRecurringCents * 12;
  return result;
}
export { buildAdminOverviewMetrics };
