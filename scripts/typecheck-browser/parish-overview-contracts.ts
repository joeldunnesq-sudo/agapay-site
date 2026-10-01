loadGivingSummary(document.createElement('button'));
loadGivingSummary(null);
pdxAnimateCount(null, '100', { money: true, duration: 10 });
pdxDrawSparkline(document.createElementNS('http://www.w3.org/2000/svg', 'svg'), [1, 2]);
renderGivingSummary({ lastGiftAt: null, monthly: [{ amountCents: '100' }] });
// @ts-expect-error Summary controls need a disabled property.
loadGivingSummary(document.createElement('div'));
// @ts-expect-error Monthly results are rows, not scalar amounts.
renderGivingSummary({ monthly: [100] });
// @ts-expect-error Durations must be numeric.
pdxAnimateCount(null, 1, { duration: 'fast' });
