// Generated from src/routes/accounting.ts by npm run build:server. Do not edit.
async function routeAccountingRequest({ request, env, url, actions }) {
  const accessMatch = url.pathname.match(/^\/api\/parish\/dashboard\/([^/]+)\/accounting-access(?:\/.*)?$/);
  if (accessMatch) {
    const parishId2 = decodeURIComponent(accessMatch[1]);
    return actions.handleAccountingAccess(request, env, parishId2);
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
export { routeAccountingRequest };
