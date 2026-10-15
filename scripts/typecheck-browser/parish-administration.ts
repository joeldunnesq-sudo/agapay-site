// Compile-only consumers protect the contracts used by the newly migrated parish modules.
loadAccountingCoreReport('trialBalance');
accountingPriorYear('2024-02-29');
renderBookstoreCountSessions([{ id: 'count', status: 'draft', items: [{ difference: 0 }] }]);
renderStewardshipAttendance({ points: [{ weekOf: '2026-10-11', headcount: null }] });
window.DirectoryImport.open({ api: (path) => path, headers: () => ({}) });
window.ParishRecovery?.openAccounting({ parishId: 'fixture', headers: () => ({}) });
patchParishPrayerRequest('fixture', { expectedRevision: 1, status: 'active' });
// @ts-expect-error Core reports use the closed set of actual endpoints.
loadAccountingCoreReport('invented-report');
// @ts-expect-error Inventory differences remain numeric.
renderBookstoreCountSessions([{ id: 'count', status: 'completed', items: [{ difference: '2' }] }]);
// @ts-expect-error Missing attendance is null, not arbitrary text or a measured zero.
renderStewardshipAttendance({ points: [{ weekOf: '2026-10-11', headcount: 'missing' }] });
// @ts-expect-error Import headers are callable at request time.
window.DirectoryImport.open({ api: (path) => path, headers: {} });
window.ParishRecovery?.mount({
  element: document.createElement('div'),
  parishId: 'fixture',
  headers: () => ({}),
  // @ts-expect-error Recovery accepts only the existing parish/accounting scopes.
  scope: 'platform',
});
// @ts-expect-error Moderation revision counters are numeric.
patchParishPrayerRequest('fixture', { expectedRevision: '1' });
