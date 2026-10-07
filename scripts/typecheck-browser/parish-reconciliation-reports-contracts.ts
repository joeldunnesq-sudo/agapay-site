renderReconciliationPayouts([{ id: 'p', amountCents: 100 }], [{ payoutId: 'p', matched: true }]);
renderReconciliationReviewHistory([{ updatedAt: '2026-10-01', bankConfirmed: true, bankStatementCents: 100 }]);
// @ts-expect-error Financial amounts are numeric cents.
renderReconciliationAllocations([{ netCents: '100' }]);
// @ts-expect-error Transactions must be a list.
renderReconciliationPayouts([], {});
// @ts-expect-error Confirmation must be boolean.
renderReconciliationReviewHistory([{ updatedAt: '2026-10-01', bankConfirmed: 'yes' }]);
