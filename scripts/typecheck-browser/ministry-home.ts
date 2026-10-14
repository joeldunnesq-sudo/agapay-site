const ministryFixtureOptions: MinistryHomeOptions = {
  group: { name: 'Hospitality' },
  members: null,
  messages: [],
  escape: (value) => String(value ?? ''),
  formatDate: (value) => String(value ?? ''),
};
window.MinistryHome.render(document.createElement('section'), {}, ministryFixtureOptions);
// @ts-expect-error Rendering requires an element.
window.MinistryHome.render(null, {}, ministryFixtureOptions);
window.MinistryHome.render(
  document.createElement('section'),
  // @ts-expect-error Coverage actions require an ID.
  { coverageRequests: [{ title: 'Help' }] },
  ministryFixtureOptions
);
// @ts-expect-error Members need display names.
const invalidMinistryOptions: MinistryHomeOptions = { ...ministryFixtureOptions, members: [{ role: 'leader' }] };
void invalidMinistryOptions;
// @ts-expect-error Coverage IDs are strings.
window.acceptMinistryCoverage(42);
