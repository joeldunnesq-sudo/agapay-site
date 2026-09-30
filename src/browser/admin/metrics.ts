interface AdminTierCount {
  readonly id: string;
  readonly label: string;
  readonly count: number;
}
interface AdminTierMetrics {
  readonly totalRegistered: number;
  readonly tierBreakdown: readonly AdminTierCount[];
}
interface AdminOverviewMetrics extends AdminTierMetrics {
  readonly complete: true;
  readonly weekStart: string;
  readonly generatedAt: string;
  readonly newRegistrations: number;
  readonly cancellations: number;
  readonly undatedCancellations: number;
  readonly monthlyRecurringCents: number;
  readonly annualRecurringCents: number;
  readonly unknownPriceSubscriptions: number;
  readonly activePaidSubscriptions: number;
}
// Missing/incomplete results are deliberately rendered as unavailable, never as zero.
type AdminOverviewMetricsInput = AdminOverviewMetrics | { readonly complete?: false } | null | undefined;

/* exported renderAdminOverviewMetrics */
function renderAdminOverviewMetrics(metrics: AdminOverviewMetricsInput): void {
  const card = document.getElementById('adminMetricsCard');
  if (!card) return;
  card.setAttribute('aria-busy', 'false');
  renderAdminTierBreakdown(metrics?.complete ? metrics : null);
  const text = (id: string, value: string) => {
    document.getElementById(id)!.textContent = value;
  };
  if (!metrics || !metrics.complete) {
    for (const id of ['weeklySignups', 'weeklyCancellations', 'monthlyRecurringRevenue', 'annualRecurringRevenue'])
      text(id, '—');
    text('metricsPaidSubscriptions', 'Active paid subscriptions · USD');
    text(
      'adminMetricsNote',
      metrics
        ? 'A complete set of parish records is not available. Metrics are withheld to avoid incomplete totals.'
        : 'Metrics unavailable. Use Refresh metrics to try again.'
    );
    return;
  }
  const currency = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(
      cents / 100
    );
  const date = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  text(
    'adminMetricsPeriod',
    `${date.format(new Date(metrics.weekStart))} – ${date.format(new Date(metrics.generatedAt))} · This week (UTC)`
  );
  text('weeklySignups', metrics.newRegistrations.toLocaleString());
  text('weeklyCancellations', `${metrics.undatedCancellations ? '≥' : ''}${metrics.cancellations.toLocaleString()}`);
  text(
    'monthlyRecurringRevenue',
    `${metrics.unknownPriceSubscriptions ? '≥' : ''}${currency(metrics.monthlyRecurringCents)}`
  );
  text(
    'annualRecurringRevenue',
    `${metrics.unknownPriceSubscriptions ? '≥' : ''}${currency(metrics.annualRecurringCents)}`
  );
  text(
    'metricsPaidSubscriptions',
    `${metrics.activePaidSubscriptions} active paid ${metrics.activePaidSubscriptions === 1 ? 'subscription' : 'subscriptions'} · USD`
  );
  const notes = [
    'Revenue is estimated from current parish plans, not cash received. Trials and free accounts are excluded.',
  ];
  if (metrics.undatedCancellations)
    notes.push(
      `${metrics.undatedCancellations} canceled ${metrics.undatedCancellations === 1 ? 'subscription has' : 'subscriptions have'} no recorded cancellation date; the weekly count may be higher.`
    );
  if (metrics.unknownPriceSubscriptions)
    notes.push(
      `${metrics.unknownPriceSubscriptions} active ${metrics.unknownPriceSubscriptions === 1 ? 'subscription has' : 'subscriptions have'} no recorded price and ${metrics.unknownPriceSubscriptions === 1 ? 'is' : 'are'} excluded from revenue.`
    );
  text('adminMetricsNote', notes.join(' '));
}

function renderAdminTierBreakdown(metrics: AdminTierMetrics | null | undefined): void {
  const chart = document.getElementById('adminTierChart');
  const legend = document.getElementById('adminTierLegend');
  const total = document.getElementById('totalParishesSignedUp');
  const status = document.getElementById('adminTierStatus');
  if (!chart || !legend || !total || !status) return;
  chart.replaceChildren();
  legend.replaceChildren();
  const circle = (color: string, count = 100, offset = 0) => {
    const element = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    for (const [name, value] of Object.entries({
      cx: 60,
      cy: 60,
      r: 49,
      fill: 'none',
      stroke: color,
      'stroke-width': 14,
      pathLength: 100,
      'stroke-dasharray': `${count} ${100 - count}`,
      'stroke-dashoffset': -offset,
      transform: 'rotate(-90 60 60)',
    }))
      element.setAttribute(name, String(value));
    chart.append(element);
    return element;
  };
  circle('#e8e3d9');
  if (!metrics || !Array.isArray(metrics.tierBreakdown) || !Number.isFinite(metrics.totalRegistered)) {
    total.textContent = '—';
    status.textContent = 'Tier breakdown unavailable. Refresh metrics to try again.';
    chart.setAttribute('aria-label', 'Parish tier breakdown unavailable');
    return;
  }
  total.textContent = metrics.totalRegistered.toLocaleString();
  chart.setAttribute(
    'aria-label',
    `${metrics.totalRegistered} parishes signed up. Counts and percentages by tier are listed alongside this chart.`
  );
  status.textContent = metrics.totalRegistered ? '' : 'No parish registrations yet.';
  const colors: Readonly<Record<string, string>> = {
    starter: '#b4832b',
    giving: '#244c67',
    parish: '#428477',
    diocese: '#79659a',
    monastery_free: '#b66b51',
    unassigned: '#929ba2',
    other: '#5b6065',
  };
  let offset = 0;
  for (const tier of metrics.tierBreakdown) {
    const color = colors[tier.id] || colors.other;
    const share = metrics.totalRegistered ? (tier.count / metrics.totalRegistered) * 100 : 0;
    if (tier.count > 0) {
      const slice = circle(color, share, offset);
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${tier.label}: ${tier.count} (${share.toFixed(1)}%)`;
      slice.append(title);
      offset += share;
    }
    // Show published tiers even at zero; disclose missing/legacy tiers when present.
    if (!tier.count && ['unassigned', 'other'].includes(tier.id)) continue;
    const row = document.createElement('li');
    const swatch = document.createElement('span');
    swatch.className = 'admin-tier-swatch';
    swatch.style.backgroundColor = color;
    swatch.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = tier.label;
    const count = document.createElement('strong');
    count.textContent = tier.count.toLocaleString();
    const percentage = document.createElement('small');
    percentage.textContent = `${share.toFixed(1)}%`;
    row.append(swatch, label, count, percentage);
    legend.append(row);
  }
}
