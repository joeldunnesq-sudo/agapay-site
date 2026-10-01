import assert from 'node:assert/strict';
import * as periods from '../src/lib/fund-report-period.js';
import * as allocations from '../src/lib/fund-allocation.js';
import * as legacy from '../src/lib/fund-reporting.js';

for (const [name, fn] of [...Object.entries(periods), ...Object.entries(allocations)])
  assert.equal(legacy[name], fn, name);
const { parishReportingTimezone, parishCalendarDate, calendarMidnight, fundReportPeriod } = periods;
assert.equal(parishReportingTimezone(), 'UTC');
assert.equal(parishReportingTimezone({ timezone: null }), 'UTC');
assert.equal(parishReportingTimezone({ timezone: 'invalid/timezone' }), 'UTC');
assert.equal(parishReportingTimezone({ timezone: 'America/Chicago' }), 'America/Chicago');
assert.equal(parishCalendarDate('2026-08-01T02:00:00Z', 'America/Chicago'), '2026-07-31');
assert.equal(parishCalendarDate(0, 'UTC'), '1970-01-01');
assert.throws(() => parishCalendarDate('invalid', 'UTC'), RangeError);
assert.throws(() => calendarMidnight('2026-01-01', 'invalid/timezone'), RangeError);
assert.equal(calendarMidnight('2026-03-08', 'America/Chicago'), '2026-03-08T06:00:00.000Z');
assert.equal(calendarMidnight('2026-03-09', 'America/Chicago'), '2026-03-09T05:00:00.000Z');
assert.equal(calendarMidnight('2026-11-01', 'America/Chicago'), '2026-11-01T05:00:00.000Z');
assert.equal(calendarMidnight('2026-11-02', 'America/Chicago'), '2026-11-02T06:00:00.000Z');
assert.equal(calendarMidnight('2026-01-01', 'Asia/Kathmandu'), '2025-12-31T18:15:00.000Z');
const now = new Date('2026-08-01T02:00:00Z');
const prior = fundReportPeriod({ now, timezone: 'America/Chicago' });
assert.equal(prior.month, '2026-06');
assert.equal(prior.label, 'June 2026');
assert.equal(prior.inProgress, false);
assert.equal(fundReportPeriod({ month: '2026-08', now }).inProgress, true);
const march = fundReportPeriod({ month: '2026-03', timezone: 'America/Chicago', now });
assert.equal((march.endUnix - march.startUnix) / 3600, 31 * 24 - 1);
const november = fundReportPeriod({ month: '2026-11', timezone: 'America/Chicago', now });
assert.equal((november.endUnix - november.startUnix) / 3600, 30 * 24 + 1);
assert.equal(fundReportPeriod({ month: '2024-02', now }).endDate, '2024-03-01');
assert.equal(fundReportPeriod({ month: '2026-12', now }).endDate, '2027-01-01');
for (const month of ['1999-12', '2200-01', '2026-13', '2026-1', 'garbage'])
  assert.throws(() => fundReportPeriod({ month, now }), /valid reconciliation month/);
const week = fundReportPeriod({
  week: true,
  month: 'ignored',
  timezone: 'America/Chicago',
  now: new Date('2026-03-09T18:00:00Z'),
});
assert.equal(week.month, null);
assert.equal(week.startDate, '2026-03-02');
assert.equal(week.endDate, '2026-03-09');
assert.equal(week.label, '2026-03-02 – 2026-03-08');
assert.equal((week.endUnix - week.startUnix) / 3600, 167);
assert.equal(now.toISOString(), '2026-08-01T02:00:00.000Z');

const { fundAllocation, createFundAllocationResolver } = allocations;
const general = Object.freeze({ id: 'general', code: 'operating', name: 'Operating' });
const retired = Object.freeze({ id: 'missions', name: 'Missions', enabled: false });
const catalog = Object.freeze({ funds: Object.freeze([null, {}, general, retired]) });
const resolve = createFundAllocationResolver(catalog);
assert.deepEqual(resolve({ fundId: 'operating' }), {
  key: 'general',
  fundId: 'general',
  label: 'Operating',
  category: 'General Giving',
  catalogSource: 'funds_and_alms',
});
assert.equal(resolve({ fund: ' MISSIONS ' }).category, 'Retired fund');
assert.equal(resolve({ fundId: 'removed', fund: 'Missions' }).catalogSource, 'historical_gift');
assert.equal(
  resolve({ fundId: 'removed', fund: 'Missions' }).fundId,
  'removed',
  'explicit historical IDs win over reused names'
);
assert.equal(resolve({ giftType: 'general' }).catalogSource, 'funds_and_alms');
assert.equal(resolve({ giftType: 'candle' }), null);
assert.equal(fundAllocation({ fund: 'GENERAL OPERATING FUND' }).key, 'general');
assert.equal(fundAllocation({ fund: 'Old mission' }).key, 'legacy-fund:old mission');
assert.equal(fundAllocation({ fundId: 123, fund: 456 }).label, '456');
assert.equal(fundAllocation({ giftType: 'TITHES' }).fundId, 'general');
assert.equal(
  fundAllocation({ fundId: 'x' }, { funds: [{ code: 'x', name: 'Disabled', active: false }] }).category,
  'Retired fund'
);
assert.equal(
  fundAllocation({ fundId: 'x' }, { funds: [{ id: 'x', enabled: 0 }] }).category,
  'Designated Fund',
  'only boolean false marks a fund retired'
);
const ambiguous = createFundAllocationResolver({
  funds: [
    { id: 'a', name: 'Shared' },
    { id: 'b', name: ' shared ' },
  ],
});
assert.equal(ambiguous({ fund: 'SHARED' }), null);
assert.equal(ambiguous({ fundId: 'a', fund: 'Shared' }).fundId, 'a');
assert.equal(
  fundAllocation({ fundId: 'a' }, { funds: [{ id: 'a' }, { id: 'a' }] }),
  null,
  'distinct duplicate IDs require review'
);
assert.equal(
  fundAllocation({ fundId: 'general' }, { funds: [general, general] }).fundId,
  'general',
  'repeated identical objects retain identity'
);
assert.equal(fundAllocation({ fundId: 'x' }, { funds: 'invalid legacy data' }).catalogSource, 'historical_gift');
console.log(
  'PASS - fund period DST/date boundaries, allocation ambiguity/history, readonly inputs, and compatibility exports'
);
