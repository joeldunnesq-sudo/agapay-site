// Compile-only consumers of classic parish and embedded browser APIs.
window.ParishFeatureRegistry.register('typed-fixture', {
  load(force = false) {
    return force;
  },
});
window.AgapayDiagnostics.report(new Error('fixture'), 'dashboard');
window.ParishBackup.mount({ element: document.createElement('div'), parishId: 'fixture', headers: () => ({}) });
window.ParishPortability.open({ parishId: 'fixture', headers: () => ({ Authorization: 'fixture' }) });
window.ParishLibraryAdmin?.load({ parishId: 'fixture', headers: () => ({}), notify: () => {}, force: true });
window.AGAPAYGivingBox?.mount(document.createElement('div'));
renderNudgePreview({
  year: 2026,
  behind: [{ donorEmail: 'fixture@example.org', pledgeCents: 100, givenCents: 0, expectedCents: 50 }],
});
renderFinancialsEditorAssetRow({ valueCents: 100, assetType: 'investment' });
renderDiocesanStatisticsPreview({ attendance: { status: 'reported', averageWeeklyAttendance: 25 } });
// @ts-expect-error Registry identity is a string.
window.ParishFeatureRegistry.register(4, { load() {} });
// @ts-expect-error A feature must have a load operation.
window.ParishFeatureRegistry.register('invalid', {});
// @ts-expect-error Backup headers must be callable at request time.
window.ParishBackup.mount({ element: document.createElement('div'), parishId: 'fixture', headers: {} });
// @ts-expect-error Library force is a boolean.
window.ParishLibraryAdmin?.load({ parishId: 'fixture', headers: () => ({}), notify: () => {}, force: 'yes' });
// @ts-expect-error Giving iframe mounts require a DOM element.
window.AGAPAYGivingBox?.mount('selector');
// @ts-expect-error Financial values are numeric cents.
renderFinancialsEditorAssetRow({ valueCents: '100' });
renderNudgePreview({
  // @ts-expect-error Preview rows require numeric expected amounts.
  behind: [{ donorEmail: 'fixture@example.org', pledgeCents: 100, givenCents: 0, expectedCents: '50' }],
});
// @ts-expect-error Staff invites require the normal submit event contract.
inviteParishStaff(new Event('submit'));
// @ts-expect-error Diagnostics expose redacted fields, never a raw error.
void window.AgapayDiagnostics.recent()[0].error;
