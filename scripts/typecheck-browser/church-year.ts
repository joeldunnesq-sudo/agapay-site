const churchYear = window.KoinoniaChurchYear.progressFor('2026-10-14', 'julian');
if (churchYear) {
  const percentage: number = churchYear.percent;
  void percentage;
}
window.KoinoniaChurchYear.render('2026-10-14');
// @ts-expect-error The date contract is an ISO date string.
window.KoinoniaChurchYear.progressFor(new Date());
// @ts-expect-error Calendar identifiers are strings.
window.KoinoniaChurchYear.render('2026-10-14', 1);
// @ts-expect-error Progress numbers cannot be strings.
const invalidChurchYear: ChurchYearProgress = { elapsed: 0, day: 1, length: 365, percent: '0' };
void invalidChurchYear;
