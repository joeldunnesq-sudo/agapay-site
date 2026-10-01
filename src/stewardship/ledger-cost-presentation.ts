export interface LedgerCostData {
  readonly expenseLines?: readonly { readonly accountNumber?: unknown; readonly amount?: unknown }[] | null;
}

export function ledgerCostTable(
  monthly: LedgerCostData,
  yearToDate: LedgerCostData,
  money: (value: number) => string
): string {
  const cost = (data: LedgerCostData, number: string) =>
    (data.expenseLines || [])
      .filter((row) => row.accountNumber === number)
      .reduce((sum, row) => sum + Number(row.amount), 0);
  const lines = [
    ['5840', 'Bank & payment processing fees'],
    ['5850', 'AGAPAY transaction fees'],
    ['5860', 'AGAPAY service subscription'],
  ];
  return `<section><h2>Processing &amp; platform expenses</h2><div class="table-wrap"><table><thead><tr><th>Expense line</th><th>This month</th><th>Year to date</th></tr></thead><tbody>${lines.map(([number, label]) => `<tr><td>${label}</td><td>${money(cost(monthly, number) / 100)}</td><td>${money(cost(yearToDate, number) / 100)}</td></tr>`).join('')}</tbody></table></div><p class="note">Included in total expenses above. Processing includes the full fee even when donors fund it. AGAPAY service subscriptions are separate from transaction fees. Subscription entries use paid invoice amounts and the billed plan. Match the bank or card payment to AGAPAY Billing Clearing (2180), without recording the expense twice. Review unposted invoices in Accounting integrations; closed periods and review requirements still apply. These lines use standard accounts 5840–5860; fees mapped to custom accounts remain in total expenses.</p></section>`;
}
