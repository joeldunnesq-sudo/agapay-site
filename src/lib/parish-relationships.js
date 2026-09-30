import { buildAdminOverviewMetrics } from './admin-overview-metrics.js';
import { liturgicalFeastsForYear } from '../liturgical-calendar.js';

export function relationshipSnapshot(registrations) {
  return Object.fromEntries(registrations.map(r => {
    const m = buildAdminOverviewMetrics([r]);
    return [r.reference, { paid: m.activePaidSubscriptions > 0, cents: m.monthlyRecurringCents }];
  }));
}

export function retentionFromSnapshots(before, after) {
  const opening = Object.entries(before).filter(([, r]) => r.paid);
  const retained = opening.filter(([id]) => after[id]?.paid);
  const openingCents = opening.reduce((n, [, r]) => n + r.cents, 0);
  const retainedCents = retained.reduce((n, [id]) => n + after[id].cents, 0);
  return {
    opening: opening.length, retained: retained.length, lost: opening.length - retained.length,
    rate: opening.length ? retained.length / opening.length * 100 : null,
    revenueRate: openingCents ? retainedCents / openingCents * 100 : null,
    openingCents, retainedCents,
    newPaid: Object.entries(after).filter(([id, r]) => r.paid && !before[id]?.paid).length,
    changeCents: Object.values(after).reduce((n, r) => n + r.cents, 0) - Object.values(before).reduce((n, r) => n + r.cents, 0),
  };
}

export function localOccasionClock(now, timeZone = 'America/Chicago') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

function annualDate(year, monthDay) {
  // February 29 anniversaries are observed February 28 in non-leap years.
  if (monthDay === '02-29' && new Date(Date.UTC(year, 1, 29)).getUTCMonth() !== 1) monthDay = '02-28';
  const date = `${year}-${monthDay}`;
  const parsed = new Date(`${date}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

export function parishOccasions(registration, today, yearsAhead = 1) {
  const year = Number(today.slice(0, 4));
  const joined = /^\d{4}-\d{2}-\d{2}/.test(registration.receivedAt || '') ? registration.receivedAt.slice(0, 10) : '';
  const result = [];
  for (let y = year; y <= year + yearsAhead; y++) {
    if (joined && y > Number(joined.slice(0, 4))) {
      const date = annualDate(y, joined.slice(5));
      if (date) result.push({ kind: 'anniversary', date, title: `${y - Number(joined.slice(0, 4))} year signup anniversary` });
    }
    const raw = String(registration.patronalFeastDate || registration.parishPatronalFeastDate || '');
    const explicit = raw.length === 10 ? raw.slice(5) : raw;
    const feast = liturgicalFeastsForYear(y, registration.liturgicalCalendar || 'julian').find(f => f.id === registration.patronalFeast);
    const date = explicit ? annualDate(y, explicit) : feast?.date;
    const name = registration.patronalFeastName || registration.parishPatronalFeastName || feast?.name;
    if (date && name) result.push({ kind: 'feast', date, title: name });
  }
  return result.filter(item => item.date >= today).sort((a, b) => a.date.localeCompare(b.date));
}

export function defaultMilestonePreferences(r) {
  return { anniversary: false, feast: false, recipient: r.treasurerEmail || r.priestEmail || '', feastRecipient: r.priestEmail || r.treasurerEmail || '', timeZone: 'America/Chicago' };
}

export function parishAttention(r) {
  const status = String(r.subscriptionStatus || '').toLowerCase();
  if (['past_due', 'unpaid'].includes(status)) return { label: 'Billing needs attention', tone: 'amber' };
  if (r.subscriptionCancelAtPeriodEnd) return { label: 'Cancellation scheduled', tone: 'amber' };
  if (['canceled', 'cancelled'].includes(status)) return { label: 'Subscription ended', tone: 'rose' };
  if (r.status !== 'verified') return { label: 'Complete parish verification', tone: 'amber' };
  if (!r.stripeAccountId || !['charges_enabled', 'payouts_enabled'].includes(r.stripeAccountStatus)) return { label: 'Finish payment setup', tone: 'amber' };
  return null;
}
