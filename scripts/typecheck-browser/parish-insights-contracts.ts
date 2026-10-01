const insightRequest: Promise<void> = loadGivingOverviewInsights();
void insightRequest;
const sourceMarkup: string = swGivingSourceComparison({ total_actual_cents: 100, manual_income_cents: 25 }, 2026);
void sourceMarkup;
// Unknown JSON values remain subject to runtime validation in the renderer.
swGivingSourceComparison({ total_actual_cents: 'bad', manual_income_cents: null }, '2026');
// @ts-expect-error Response data is an object, not a scalar.
swGivingSourceComparison(100, 2026);
// @ts-expect-error Loading reads shared state, not an arbitrary supplied parish.
loadGivingOverviewInsights('other');
