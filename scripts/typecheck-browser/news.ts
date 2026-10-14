// Compile-only consumer checks for the classic-script News boundary.
newsState.sources = [{ sourceKey: 'oca', subscribed: true, posts: [{ publishedAt: null }] }];
newsHeaders({ Authorization: 'synthetic' });
setNewsFilter('oca');
toggleNewsSource(document.createElement('button'));
addCustomNewsSource(new SubmitEvent('submit'));
// @ts-expect-error Subscription flags are booleans.
newsState.sources = [{ sourceKey: 'oca', subscribed: 'yes' }];
// @ts-expect-error Inline subscription handlers require a button.
toggleNewsSource(document.createElement('div'));
// @ts-expect-error Header values must be strings.
newsHeaders({ Authorization: 123 });
// @ts-expect-error Source keys are required.
newsState.sources = [{ posts: [] }];
// @ts-expect-error Dates must match the API's date representations.
newsDate({ date: '2026-10-13' });
