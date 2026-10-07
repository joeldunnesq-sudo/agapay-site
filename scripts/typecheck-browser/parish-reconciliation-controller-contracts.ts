const reconciliationLoad: Promise<void> = loadReconciliation(document.createElement('button'));
void reconciliationLoad;
const reconciliationSave: Promise<void> = saveReconciliationClose(true);
void reconciliationSave;
// @ts-expect-error Close state must be boolean.
saveReconciliationClose('closed');
// @ts-expect-error Loading control must be a button.
loadReconciliation(document.createElement('div'));
// @ts-expect-error Report context requires a month.
renderReconciliation({ period: { timezone: 'UTC' } });
