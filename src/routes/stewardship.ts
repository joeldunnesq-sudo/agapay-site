type RouteResult = Response | null | undefined;
type AwaitableResult = RouteResult | Promise<RouteResult>;
export interface StewardshipActions<TEnv> {
  handleDiocesanStatisticsReport(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleParishStewardshipBillingPortal(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleParishStewardshipMeetingDetail(request: Request, env: TEnv, resource: string, subpath: string): AwaitableResult;
  handleParishStewardshipMeetings(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleParishStewardshipSubscribe(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleParishStewardshipSummary(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleStewardshipAccountingBridge(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleStewardshipAttendance(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleStewardshipAttendanceDelegation(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleStewardshipBilling(request: Request, env: TEnv): AwaitableResult;
  handleStewardshipBillingPortal(request: Request, env: TEnv): AwaitableResult;
  handleStewardshipFinancials(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleStewardshipGivingActivate(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleStewardshipGivingConcentration(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleStewardshipGivingDistribution(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleStewardshipGivingFunds(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleStewardshipGivingHealthScore(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleStewardshipGivingMetricsPage(request: Request, env: TEnv): AwaitableResult;
  handleStewardshipGivingRecurring(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleStewardshipGivingRetention(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleStewardshipGivingSummary(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleStewardshipHome(request: Request, env: TEnv): AwaitableResult;
  handleStewardshipManualIncomeCreate(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleStewardshipManualIncomeDelete(request: Request, env: TEnv, resource: string, subpath: string): AwaitableResult;
  handleStewardshipManualIncomeList(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleStewardshipMeetingEdit(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleStewardshipMeetingList(request: Request, env: TEnv): AwaitableResult;
  handleStewardshipMeetingNew(request: Request, env: TEnv): AwaitableResult;
  handleStewardshipMeetingPdf(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleStewardshipMeetingPreview(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleStewardshipMonthlyFinancialReport(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleStewardshipMonthlyReport(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleStewardshipNudge(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleStewardshipSubscribe(request: Request, env: TEnv): AwaitableResult;
  handleStewardshipWebhook(request: Request, env: TEnv): AwaitableResult;
}
export interface StewardshipRouteContext<TEnv> {
  request: Request;
  env: TEnv;
  url: URL;
  actions: StewardshipActions<TEnv>;
}

const DASHBOARD_SUFFIX_ROUTES = new Map<
  string,
  | 'handleParishStewardshipSummary'
  | 'handleParishStewardshipSubscribe'
  | 'handleParishStewardshipBillingPortal'
  | 'handleParishStewardshipMeetings'
  | 'handleStewardshipGivingSummary'
  | 'handleStewardshipGivingFunds'
  | 'handleStewardshipGivingDistribution'
  | 'handleStewardshipGivingRetention'
  | 'handleStewardshipGivingConcentration'
  | 'handleStewardshipGivingRecurring'
  | 'handleStewardshipGivingHealthScore'
  | 'handleStewardshipAttendance'
  | 'handleStewardshipAttendanceDelegation'
  | 'handleDiocesanStatisticsReport'
  | 'handleStewardshipMonthlyFinancialReport'
  | 'handleStewardshipMonthlyReport'
  | 'handleStewardshipGivingActivate'
  | 'handleStewardshipNudge'
  | 'handleStewardshipAccountingBridge'
  | 'handleStewardshipFinancials'
>([
  ['/stewardship', 'handleParishStewardshipSummary'],
  ['/stewardship/subscribe', 'handleParishStewardshipSubscribe'],
  ['/stewardship/billing-portal', 'handleParishStewardshipBillingPortal'],
  ['/stewardship/meetings', 'handleParishStewardshipMeetings'],
  ['/stewardship/giving/summary', 'handleStewardshipGivingSummary'],
  ['/stewardship/giving/funds', 'handleStewardshipGivingFunds'],
  ['/stewardship/giving/distribution', 'handleStewardshipGivingDistribution'],
  ['/stewardship/giving/retention', 'handleStewardshipGivingRetention'],
  ['/stewardship/giving/concentration', 'handleStewardshipGivingConcentration'],
  ['/stewardship/giving/recurring', 'handleStewardshipGivingRecurring'],
  ['/stewardship/giving/health-score', 'handleStewardshipGivingHealthScore'],
  ['/stewardship/attendance', 'handleStewardshipAttendance'],
  ['/stewardship/attendance/delegation', 'handleStewardshipAttendanceDelegation'],
  ['/reports/diocesan-statistics', 'handleDiocesanStatisticsReport'],
  ['/stewardship/report/monthly-financial', 'handleStewardshipMonthlyFinancialReport'],
  ['/stewardship/report/monthly', 'handleStewardshipMonthlyReport'],
  ['/stewardship/giving/activate', 'handleStewardshipGivingActivate'],
  ['/stewardship/nudge', 'handleStewardshipNudge'],
  ['/stewardship/financials/accounting-summary', 'handleStewardshipAccountingBridge'],
  ['/stewardship/financials/import-from-accounting', 'handleStewardshipAccountingBridge'],
  ['/stewardship/financials', 'handleStewardshipFinancials'],
]);

const PAGE_ROUTES = new Map<
  string,
  | 'handleStewardshipHome'
  | 'handleStewardshipGivingMetricsPage'
  | 'handleStewardshipBilling'
  | 'handleStewardshipMeetingList'
>([
  ['/parish/stewardship', 'handleStewardshipHome'],
  ['/parish/stewardship/giving', 'handleStewardshipGivingMetricsPage'],
  ['/parish/stewardship/billing', 'handleStewardshipBilling'],
  ['/parish/stewardship/annual-meetings', 'handleStewardshipMeetingList'],
]);

export async function routeStewardshipRequest<TEnv>({ request, env, url, actions }: StewardshipRouteContext<TEnv>) {
  const pageAction = PAGE_ROUTES.get(url.pathname);
  if (pageAction) return actions[pageAction](request, env);
  if (request.method === 'POST' && url.pathname === '/parish/stewardship/subscribe') {
    return actions.handleStewardshipSubscribe(request, env);
  }
  if (request.method === 'POST' && url.pathname === '/parish/stewardship/billing-portal') {
    return actions.handleStewardshipBillingPortal(request, env);
  }
  if (
    (request.method === 'GET' || request.method === 'POST') &&
    url.pathname === '/parish/stewardship/annual-meetings/new'
  ) {
    return actions.handleStewardshipMeetingNew(request, env);
  }
  if (
    request.method === 'POST' &&
    (url.pathname === '/webhooks/stewardship' || url.pathname === '/api/parish/stewardship/webhook')
  ) {
    return actions.handleStewardshipWebhook(request, env);
  }
  if (url.pathname.startsWith('/parish/stewardship/annual-meetings/')) {
    const [meetingId, action] = url.pathname.replace('/parish/stewardship/annual-meetings/', '').split('/');
    if (meetingId) {
      if (action === 'preview') return actions.handleStewardshipMeetingPreview(request, env, meetingId);
      if (action === 'pdf') return actions.handleStewardshipMeetingPdf(request, env, meetingId);
      return actions.handleStewardshipMeetingEdit(request, env, meetingId);
    }
  }

  const dashboardMatch = url.pathname.match(/^\/api\/parish\/dashboard\/([^/]+)(\/.*)$/);
  if (!dashboardMatch) return null;
  const parishId = decodeURIComponent(dashboardMatch[1]);
  const suffix = dashboardMatch[2];
  const dashboardAction = DASHBOARD_SUFFIX_ROUTES.get(suffix);
  if (dashboardAction) return actions[dashboardAction](request, env, parishId);

  if (suffix.startsWith('/stewardship/meetings/')) {
    return actions.handleParishStewardshipMeetingDetail(
      request,
      env,
      parishId,
      decodeURIComponent(suffix.slice('/stewardship/meetings/'.length))
    );
  }
  if ((request.method === 'GET' || request.method === 'POST') && suffix === '/stewardship/income/manual') {
    return request.method === 'GET'
      ? actions.handleStewardshipManualIncomeList(request, env, parishId)
      : actions.handleStewardshipManualIncomeCreate(request, env, parishId);
  }
  if (request.method === 'DELETE' && suffix.startsWith('/stewardship/income/manual/')) {
    return actions.handleStewardshipManualIncomeDelete(
      request,
      env,
      parishId,
      decodeURIComponent(suffix.slice('/stewardship/income/manual/'.length))
    );
  }
  return null;
}
