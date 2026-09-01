const DASHBOARD_SUFFIX_ROUTES = new Map([
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
  ['/stewardship/report/monthly-financial', 'handleStewardshipMonthlyFinancialReport'],
  ['/stewardship/report/monthly', 'handleStewardshipMonthlyReport'],
  ['/stewardship/giving/activate', 'handleStewardshipGivingActivate'],
  ['/stewardship/nudge', 'handleStewardshipNudge'],
  ['/stewardship/financials/accounting-summary', 'handleStewardshipAccountingBridge'],
  ['/stewardship/financials/import-from-accounting', 'handleStewardshipAccountingBridge'],
  ['/stewardship/financials', 'handleStewardshipFinancials'],
]);

const PAGE_ROUTES = new Map([
  ['/parish/stewardship', 'handleStewardshipHome'],
  ['/parish/stewardship/giving', 'handleStewardshipGivingMetricsPage'],
  ['/parish/stewardship/billing', 'handleStewardshipBilling'],
  ['/parish/stewardship/annual-meetings', 'handleStewardshipMeetingList'],
]);

export async function routeStewardshipRequest({ request, env, url, actions }) {
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
