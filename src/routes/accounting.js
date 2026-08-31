export async function routeAccountingRequest({ request, env, url, actions }) {
  const accessMatch = url.pathname.match(/^\/api\/parish\/dashboard\/([^/]+)\/accounting-access(?:\/.*)?$/);
  if (accessMatch) {
    const parishId = decodeURIComponent(accessMatch[1]);
    return actions.handleAccountingAccess(request, env, parishId);
  }

  const accountingMatch = url.pathname.match(/^\/api\/parish\/dashboard\/([^/]+)\/accounting(?:\/.*)?$/);
  if (!accountingMatch) return null;

  const parishId = decodeURIComponent(accountingMatch[1]);

  const handlers = [
    actions.handleAccountingRecurring,
    actions.handleAccountingPayablesBudgets,
    actions.handleAccountingReconciliationCommerce,
    actions.handleAccountingClose,
    actions.handleAccountingSetupReports,
    actions.handleAccountingAdjustments,
    actions.handleAccountingGovernance,
    actions.handleAccountingAttachments,
    actions.handleAccountingMigration,
    actions.handleAccountingLedger,
  ];
  for (const handler of handlers) {
    const response = await handler(request, env, parishId);
    if (response) return response;
  }
  return null;
}
