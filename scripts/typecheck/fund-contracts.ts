import { fundReportPeriod, calendarMidnight, parishCalendarDate } from '../../src/lib/fund-report-period.js';
import { createFundAllocationResolver, fundAllocation, type FundCatalog } from '../../src/lib/fund-allocation.js';

const period = fundReportPeriod({ month: '2026-03', timezone: 'America/Chicago' });
const boundary: number = period.endUnix;
const month: string | null = period.month;
const catalog: FundCatalog = { funds: [{ id: 'general', name: 'General', enabled: false }] };
const allocation = createFundAllocationResolver(catalog)({ giftType: 'general' });
if (allocation) {
  const source: 'funds_and_alms' | 'historical_gift' = allocation.catalogSource;
  void source;
}
parishCalendarDate(new Date(), 'UTC');
parishCalendarDate(0, 'UTC');
void [boundary, month];
// @ts-expect-error: weekly periods have no reporting month.
const requiredMonth: string = period.month;
void requiredMonth;
// @ts-expect-error: clock input must be a Date.
fundReportPeriod({ now: '2026-01-01' });
// @ts-expect-error: month selection is a string, not a numeric month index.
fundReportPeriod({ month: 3 });
// @ts-expect-error: calendar boundaries require a timezone string.
calendarMidnight('2026-01-01', null);
// @ts-expect-error: ambiguous or unknown allocations must be handled.
const id: string = fundAllocation({ giftType: 'candle' }).fundId;
void id;
// @ts-expect-error: catalog input is a list of entries.
createFundAllocationResolver({ funds: 'general' });
// @ts-expect-error: callers cannot mutate a readonly catalog through the contract.
catalog.funds!.push({ id: 'new' });
