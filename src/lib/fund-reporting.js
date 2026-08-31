import { offeringFeeBreakdown } from './stripe-fees.js';

export function parishReportingTimezone(registration = {}) {
  const timezone = registration.timezone || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return timezone;
  } catch {
    return 'UTC';
  }
}

export function parishCalendarDate(value, timezone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date(value))
      .map(({ type, value: part }) => [type, part])
  );
  return parts.year + '-' + parts.month + '-' + parts.day;
}

function calendarOffset(date, days) {
  const value = new Date(date + 'T12:00:00Z');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function calendarMidnight(date, timezone) {
  const target = Date.parse(date + 'T00:00:00Z');
  let value = target;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    const p = Object.fromEntries(formatter.formatToParts(new Date(value)).map(({ type, value: part }) => [type, part]));
    const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    const delta = target - local;
    value += delta;
    if (!delta) break;
  }
  return new Date(value).toISOString();
}

export function fundReportPeriod({ month, week = false, timezone = 'UTC', now = new Date() } = {}) {
  const today = parishCalendarDate(now, timezone);
  let startDate, endDate, label;
  if (week) {
    const weekday = new Date(today + 'T12:00:00Z').getUTCDay();
    endDate = calendarOffset(today, -((weekday + 6) % 7));
    startDate = calendarOffset(endDate, -7);
    label = startDate + ' – ' + calendarOffset(endDate, -1);
  } else {
    month ||= calendarOffset(today.slice(0, 7) + '-01', -1).slice(0, 7);
    if (!/^(?:20|21)\d{2}-(?:0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid reconciliation month.');
    startDate = month + '-01';
    const next = new Date(startDate + 'T12:00:00Z');
    next.setUTCMonth(next.getUTCMonth() + 1);
    endDate = next.toISOString().slice(0, 10);
    label = new Date(startDate + 'T12:00:00Z').toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  const startIso = calendarMidnight(startDate, timezone);
  const endIso = calendarMidnight(endDate, timezone);
  return {
    month: week ? null : month,
    label,
    timezone,
    startDate,
    endDate,
    startIso,
    endIso,
    startUnix: Date.parse(startIso) / 1000,
    endUnix: Date.parse(endIso) / 1000,
    inProgress: endDate > today,
  };
}

// Funds & Alms owns current fund identities and labels. Index once per report,
// including disabled funds: retiring a giving option must not orphan old receipts.
export function createFundAllocationResolver(registration = {}) {
  const byId = new Map(),
    byName = new Map();
  const add = (map, key, fund) => {
    if (key) map.set(key, map.has(key) && map.get(key) !== fund ? null : fund);
  };
  for (const fund of Array.isArray(registration.funds) ? registration.funds : []) {
    if (!fund || !(fund.id || fund.code)) continue;
    for (const key of new Set([fund.id, fund.code].filter(Boolean).map(String))) add(byId, key.trim(), fund);
    add(
      byName,
      String(fund.name || '')
        .trim()
        .toLowerCase(),
      fund
    );
  }
  return (offering = {}) => {
    const id = String(offering.fundId || '').trim();
    const name = String(offering.fund || '').trim();
    const historical = historicalFundAllocation(offering);
    // An explicit historical ID always wins over a newly reused fund name.
    const map = id ? byId : name ? byName : byId;
    const key = id || (name ? name.toLowerCase() : historical?.fundId);
    if (key && map.has(key)) {
      const fund = map.get(key);
      if (!fund) return null; // Ambiguous catalog identities require review.
      const fundId = String(fund.id || fund.code);
      return {
        key: fundId === 'general' ? 'general' : 'fund:' + fundId,
        fundId,
        label: String(fund.name || fundId),
        category:
          fund.enabled === false || fund.active === false
            ? 'Retired fund'
            : fundId === 'general'
              ? 'General Giving'
              : 'Designated Fund',
        catalogSource: 'funds_and_alms',
      };
    }
    // Removed funds stay identifiable from immutable gift metadata. Do not
    // reinterpret a prior alms campaign using today's (possibly changed) destination.
    return historical ? { ...historical, catalogSource: 'historical_gift' } : null;
  };
}

export function fundAllocation(offering = {}, registration = {}) {
  return createFundAllocationResolver(registration)(offering);
}

// Never turn an unidentified designation or campaign into General.
function historicalFundAllocation(offering = {}) {
  const type = String(offering.giftType || '').toLowerCase();
  const id = String(offering.fundId || '').trim();
  const name = String(offering.fund || '').trim();
  const generalName = /^(general(?: operating)?(?: fund)?|general stewardship|stewardship)$/i;
  if (id)
    return {
      key: id === 'general' ? 'general' : 'fund:' + id,
      fundId: id,
      category: id === 'general' ? 'General Giving' : 'Designated Fund',
      label: name || (id === 'general' ? 'General Operating Fund' : id),
    };
  if (name)
    return {
      key: generalName.test(name) ? 'general' : 'legacy-fund:' + name.toLowerCase(),
      fundId: '',
      category: generalName.test(name) ? 'General Giving' : 'Historical designation',
      label: name,
    };
  if (['general', 'stewardship', 'tithe', 'tithes'].includes(type))
    return { key: 'general', fundId: 'general', category: 'General Giving', label: 'General Operating Fund' };
  return null;
}

// Period-scoped database paging, never the browser's last-500-gift cache.
// A bounded report must explicitly fail completeness instead of showing partial totals.
export async function loadFundGiftActivity(env, parishId, period, registration = {}) {
  if (!env.AGAPAY_DB) return { available: false, complete: false, reason: 'Giving database unavailable.' };
  const allocations = new Map();
  const resolveFund = createFundAllocationResolver(registration);
  let cursor = '',
    recordCount = 0,
    giftCount = 0,
    grossGiftCents = 0,
    parishNetCents = 0,
    feeCents = 0,
    estimatedFeeCount = 0,
    unallocatedCount = 0;
  for (;;) {
    const page = await env.AGAPAY_DB.prepare(
      'SELECT id, data, created_at FROM donor_offerings WHERE parish_id=?1 AND id>?2 ' +
        "AND (payment_status IN ('paid','succeeded','complete','completed','refunded','partially_refunded','disputed') OR status IN ('paid','succeeded','complete','completed','refunded','partially_refunded','disputed')) " +
        "AND julianday(COALESCE(NULLIF(json_extract(data,'$.paidAt'),''),NULLIF(json_extract(data,'$.createdAt'),''),created_at))>=julianday(?3) " +
        "AND julianday(COALESCE(NULLIF(json_extract(data,'$.paidAt'),''),NULLIF(json_extract(data,'$.createdAt'),''),created_at))<julianday(?4) ORDER BY id LIMIT 500"
    )
      .bind(parishId, cursor, period.startIso, period.endIso)
      .all();
    const rows = page.results || [];
    recordCount += rows.length;
    if (recordCount > 25000)
      return {
        available: false,
        complete: false,
        reason: 'This period exceeds the interactive reporting limit. Contact support for a complete report.',
      };
    for (const row of rows) {
      const gift = JSON.parse(row.data);
      if (!gift || (gift.parishId && gift.parishId !== parishId)) throw new Error('Invalid giving record.');
      if ((gift.currency || 'usd').toLowerCase() !== 'usd')
        return {
          available: false,
          complete: false,
          reason: 'This period contains another currency and needs a separate currency report.',
        };
      const amount = gift.giftAmountCents ?? gift.amountCents;
      const moneyFields = [
        amount,
        gift.chargeCents,
        gift.stripeFeeCents,
        gift.estimatedStripeFeeCents,
        gift.totalFeeCents,
        gift.parishNetCents,
      ];
      if (
        amount == null ||
        moneyFields.some((value) => value != null && (!Number.isSafeInteger(Number(value)) || Number(value) < 0))
      )
        return {
          available: false,
          complete: false,
          reason: 'A giving record has an invalid amount. Totals cannot be verified.',
        };
      const fee = offeringFeeBreakdown(gift);
      const allocation = resolveFund(gift) || {
        key: 'unallocated',
        label: 'Needs allocation',
        category: 'Unallocated',
        fundId: '',
      };
      const item = allocations.get(allocation.key) || {
        ...allocation,
        grossCents: 0,
        feeCents: 0,
        netCents: 0,
        transactionCount: 0,
      };
      item.grossCents += fee.giftAmountCents;
      item.feeCents += fee.totalFeeCents;
      item.netCents += fee.parishNetCents;
      item.transactionCount++;
      allocations.set(allocation.key, item);
      giftCount++;
      grossGiftCents += fee.giftAmountCents;
      parishNetCents += fee.parishNetCents;
      feeCents += fee.totalFeeCents;
      if (gift.stripeFeeSource !== 'balance_transaction') estimatedFeeCount++;
      if (allocation.key === 'unallocated') unallocatedCount++;
    }
    if (rows.length < 500) break;
    cursor = rows[rows.length - 1].id;
  }
  return {
    available: true,
    complete: true,
    period,
    currency: 'usd',
    giftCount,
    grossGiftCents,
    parishNetCents,
    feeCents,
    estimatedFeeCount,
    unallocatedCount,
    allocations: [...allocations.values()].sort((a, b) => b.netCents - a.netCents),
    generatedAt: new Date().toISOString(),
    basis: 'gift_date_before_refunds',
    note: 'By gift paid date. Net is before refunds and disputes, not bank deposits or current fund balances. See monthly reconciliation for payout adjustments.',
  };
}
