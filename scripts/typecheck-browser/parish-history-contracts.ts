const historyRequest: Promise<void> = loadGivingHistory(document.createElement('button'));
void historyRequest;
const historyGift: ParishHistoryGift = { source: 'outside', amountCents: 100, commemorationNames: ['Intention'] };
void historyGift;
// @ts-expect-error Refresh requires a button control.
loadGivingHistory(document.createElement('div'));
// @ts-expect-error Gift cents are numeric in the response contract.
const invalidHistoryGift: ParishHistoryGift = { amountCents: '100' };
void invalidHistoryGift;
// @ts-expect-error Shared cache is a gift list.
manualAccountingGifts = {};
