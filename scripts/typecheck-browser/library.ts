libraryState.resources = [
  { id: 'pdf-1', title: 'Prayers', category: 'prayer_worship', resourceType: 'pdf', pinned: true },
];
libraryStatus('Loading');
openLibraryPdf('pdf-1');
window.MyAgapayShell?.authHeaders();
// @ts-expect-error Resources must identify themselves.
libraryState.resources = [{ title: 'Prayers', category: 'prayer_worship', resourceType: 'pdf' }];
// @ts-expect-error Pinned state is a boolean.
libraryState.resources[0].pinned = 'yes';
// @ts-expect-error Download IDs are strings.
openLibraryPdf(42);
// @ts-expect-error Status text is a string.
libraryStatus({ error: 'Failed' });
// @ts-expect-error Shared authentication header values are strings.
window.MyAgapayShell?.authHeaders({ Authorization: 42 });
