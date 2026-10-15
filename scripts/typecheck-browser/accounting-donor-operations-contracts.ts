const bank: AccountingBankAccount = { id: 'bank', version: 1, name: 'Operating' };
// @ts-expect-error Versions must be numeric for optimistic concurrency.
const invalidBank: AccountingBankAccount = { id: 'bank', version: '1', name: 'Operating' };
const draft: AccountingJournalDraft = {
  id: 'entry',
  version: 1,
  entryDate: '2026-01-01',
  lines: [{ debitAmount: 100 }],
};
// @ts-expect-error Journal amounts must be numbers.
const invalidLine: AccountingJournalLine = { debitAmount: '100' };
const day: DonorLiturgicalDay = { saints: ['Test'], readingAppointments: [{ type: 'epistle', ref: 'Romans' }] };
// @ts-expect-error Saints returned to the calendar are names, not arbitrary objects.
const invalidDay: DonorLiturgicalDay = { saints: [{ name: 'Test' }] };
void [bank, invalidBank, draft, invalidLine, day, invalidDay];
