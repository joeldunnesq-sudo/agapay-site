// Compile-only contracts for the first event-driven controller and its read model.
const contactTool: AdminNavigationTool = [
  'overview',
  'Contacts',
  'Review contacts',
  'Your work',
  'contacts',
  'contactLeadsCard',
];
switchTab(contactTool[0]);
// @ts-expect-error: prevent navigation to a nonexistent tab.
switchTab('unknown-tab');
const invalidSection: AdminNavigationTool = [
  'overview',
  'Contacts',
  'Review contacts',
  'Your work',
  'contacts',
  // @ts-expect-error: section shortcuts must name a supported target.
  'missingCard',
];
void invalidSection;
// @ts-expect-error: navigation tuples cannot be mutated by consumers.
contactTool[0] = 'giving';

const overviewMetrics: AdminOverviewMetrics = {
  complete: true,
  weekStart: '2026-09-28T00:00:00Z',
  generatedAt: '2026-09-30T12:00:00Z',
  newRegistrations: 0,
  cancellations: 0,
  undatedCancellations: 0,
  monthlyRecurringCents: 0,
  annualRecurringCents: 0,
  unknownPriceSubscriptions: 0,
  activePaidSubscriptions: 0,
  totalRegistered: 0,
  tierBreakdown: [],
};
renderAdminOverviewMetrics(overviewMetrics);
renderAdminOverviewMetrics(null);
renderAdminOverviewMetrics({ complete: false });
renderAdminOverviewMetrics({});
renderAdminTierBreakdown({
  totalRegistered: 1,
  tierBreakdown: [{ id: 'future-tier', label: 'Future tier', count: 1 }],
});
// @ts-expect-error: complete metrics must contain the counters, dates, revenue and tier totals.
renderAdminOverviewMetrics({ complete: true });
// @ts-expect-error: monetary values stay numeric cents.
renderAdminOverviewMetrics({ ...overviewMetrics, monthlyRecurringCents: '$25' });
// @ts-expect-error: rendering must not mutate the supplied metrics.
overviewMetrics.totalRegistered = 3;
// @ts-expect-error: published counts are numeric.
renderAdminTierBreakdown({ totalRegistered: 1, tierBreakdown: [{ id: 'parish', label: 'Parish', count: '1' }] });
