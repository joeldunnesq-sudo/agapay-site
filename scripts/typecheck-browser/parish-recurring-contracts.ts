// Classic-script contracts must preserve nullable identity and actual DOM controls.
loadRecurringHealth();
loadRecurringHealth(document.createElement('button'));
loadRecurringHealth(null);
// @ts-expect-error Refresh controls must support disabled.
loadRecurringHealth(document.createElement('div'));
// @ts-expect-error A parish identity requires a string identifier.
currentParish = { parishId: 42 };
currentParish = null;
renderRecurringHealth({ activeCount: '2', failedThisMonthCount: null, monthlyRecurringCents: 100 });
// @ts-expect-error The renderer expects a response object, not an array.
renderRecurringHealth([]);
