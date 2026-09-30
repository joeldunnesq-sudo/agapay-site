/* exported renderAdminOverviewMetrics */
function renderAdminOverviewMetrics(metrics) {
  const card = document.getElementById('adminMetricsCard');
  if (!card) return;
  card.setAttribute('aria-busy', 'false');
  const text = (id, value) => { document.getElementById(id).textContent = value; };
  if (!metrics || !metrics.complete) {
    for (const id of ['weeklySignups', 'weeklyCancellations', 'monthlyRecurringRevenue', 'annualRecurringRevenue']) text(id, '—');
    text('metricsPaidSubscriptions', 'Active paid subscriptions · USD');
    text('adminMetricsNote', metrics ? 'A complete set of parish records is not available. Metrics are withheld to avoid incomplete totals.' : 'Metrics unavailable. Use Refresh metrics to try again.');
    return;
  }
  const currency = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(cents / 100);
  const date = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  text('adminMetricsPeriod', `${date.format(new Date(metrics.weekStart))} – ${date.format(new Date(metrics.generatedAt))} · This week (UTC)`);
  text('weeklySignups', metrics.newRegistrations.toLocaleString());
  text('weeklyCancellations', `${metrics.undatedCancellations ? '≥' : ''}${metrics.cancellations.toLocaleString()}`);
  text('monthlyRecurringRevenue', `${metrics.unknownPriceSubscriptions ? '≥' : ''}${currency(metrics.monthlyRecurringCents)}`);
  text('annualRecurringRevenue', `${metrics.unknownPriceSubscriptions ? '≥' : ''}${currency(metrics.annualRecurringCents)}`);
  text('metricsPaidSubscriptions', `${metrics.activePaidSubscriptions} active paid ${metrics.activePaidSubscriptions === 1 ? 'subscription' : 'subscriptions'} · USD`);
  const notes = ['Revenue is estimated from current parish plans, not cash received. Trials and free accounts are excluded.'];
  if (metrics.undatedCancellations) notes.push(`${metrics.undatedCancellations} canceled ${metrics.undatedCancellations === 1 ? 'subscription has' : 'subscriptions have'} no recorded cancellation date; the weekly count may be higher.`);
  if (metrics.unknownPriceSubscriptions) notes.push(`${metrics.unknownPriceSubscriptions} active ${metrics.unknownPriceSubscriptions === 1 ? 'subscription has' : 'subscriptions have'} no recorded price and ${metrics.unknownPriceSubscriptions === 1 ? 'is' : 'are'} excluded from revenue.`);
  text('adminMetricsNote', notes.join(' '));
}
