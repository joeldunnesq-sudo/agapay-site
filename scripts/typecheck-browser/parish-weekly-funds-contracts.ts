const weeklyRequest: Promise<void> = loadWeeklyFunds(document.createElement('button'));
void weeklyRequest;
const weeklyColor: string = fundReportColor(null);
void weeklyColor;
// @ts-expect-error Refresh controls must be buttons.
loadWeeklyFunds(document.createElement('div'));
// @ts-expect-error Verified report allocations use numeric cents.
const invalidWeeklyAllocation: ParishWeeklyFundAllocation = { key: 'fund', label: 'Fund', netCents: '100' };
void invalidWeeklyAllocation;
