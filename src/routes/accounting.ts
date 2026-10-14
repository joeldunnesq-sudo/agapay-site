type RouteResult = Response | null | undefined;
type AwaitableResult = RouteResult | Promise<RouteResult>;

export interface AccountingActions<TEnv> {
  handleAccountingAccess(request: Request, env: TEnv, resourceId: string): AwaitableResult;
  handleAccountingAdjustments(request: Request, env: TEnv, resourceId: string): AwaitableResult;
  handleAccountingAttachments(request: Request, env: TEnv, resourceId: string): AwaitableResult;
  handleAccountingClose(request: Request, env: TEnv, resourceId: string): AwaitableResult;
  handleAccountingGovernance(request: Request, env: TEnv, resourceId: string): AwaitableResult;
  handleAccountingLedger(request: Request, env: TEnv, resourceId: string): AwaitableResult;
  handleAccountingMigration(request: Request, env: TEnv, resourceId: string): AwaitableResult;
  handleAccountingPayablesBudgets(request: Request, env: TEnv, resourceId: string): AwaitableResult;
  handleAccountingReconciliationCommerce(request: Request, env: TEnv, resourceId: string): AwaitableResult;
  handleAccountingRecurring(request: Request, env: TEnv, resourceId: string): AwaitableResult;
  handleAccountingSetupReports(request: Request, env: TEnv, resourceId: string): AwaitableResult;
}

export interface AccountingRouteContext<TEnv> {
  request: Request;
  env: TEnv;
  url: URL;
  actions: AccountingActions<TEnv>;
}

export async function routeAccountingRequest<TEnv>({ request, env, url, actions }: AccountingRouteContext<TEnv>) {
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
