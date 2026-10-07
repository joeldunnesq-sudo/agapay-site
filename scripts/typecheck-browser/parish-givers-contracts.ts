const giverExport: Promise<void> = exportGiversMonthlyCsv(new SubmitEvent('submit'));
void giverExport;
setGiversSort('recency', document.createElement('button'));
// @ts-expect-error Only implemented sort modes are allowed.
setGiversSort('email');
// @ts-expect-error Export requires a submit event.
exportGiversMonthlyCsv(new Event('click'));
const invalidGiver: ParishGiverSummary = {
  name: 'A',
  email: '',
  giftCount: 1,
  // @ts-expect-error Household totals use numeric cents.
  totalCents: '100',
  recurring: false,
  lastGiftAt: '',
  firstGiftAt: '',
};
void invalidGiver;
