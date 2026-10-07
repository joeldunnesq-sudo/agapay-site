const transferInstructions: ParishFundTransferInstruction[] = collectFundTransferInstructions();
void transferInstructions;
renderFundTransferWorksheet({ available: true, lines: [{ key: 'fund', netCents: 100 }] });
// @ts-expect-error Amounts are numeric cents.
renderFundTransferWorksheet({ depositedCents: '100' });
// @ts-expect-error Completion is a boolean, not text.
renderFundTransferWorksheet(null, [{ key: 'fund', completed: 'yes' }]);
