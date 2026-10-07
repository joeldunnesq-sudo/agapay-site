const commemorationRequest: Promise<void> = loadCommemorations(document.createElement('button'));
void commemorationRequest;
const candleClassification: boolean = isCandleGift({ memo: 'vigil', amountCents: 100 });
void candleClassification;
renderCommemorations({ entries: [{ living: 'malformed', departed: null }] });
// @ts-expect-error Refresh needs a button.
loadCommemorations(document.createElement('div'));
// @ts-expect-error Gift signals are an object.
isCandleGift('candle');
