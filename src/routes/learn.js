const EXACT_ROUTES = new Map([
  ['GET /api/learn/meta', 'handleLearnMeta'],
  ['GET /api/learn/dashboard', 'handleLearnDashboard'],
  ['POST /api/learn/completion', 'handleLearnCompletionSave'],
  ['GET /api/learn/planner', 'handleLearnPlanner'],
  ['GET /api/learn/print-center', 'handleLearnPrintCenter'],
  ['GET /api/learn/formation', 'handleLearnFormation'],
  ['GET /api/learn/saints', 'handleLearnSaints'],
  ['GET /api/learn/books', 'handleLearnBooks'],
  ['GET /api/learn/grades', 'handleLearnGrades'],
  ['POST /api/learn/grades', 'handleLearnGradesSave'],
  ['GET /api/learn/test-scores', 'handleLearnTestScores'],
  ['POST /api/learn/test-scores', 'handleLearnTestScoresSave'],
  ['POST /api/learn/attendance', 'handleLearnAttendanceSave'],
  ['GET /api/learn/community', 'handleLearnCommunity'],
  ['POST /api/learn/community/resources', 'handleLearnCommunitySubmit'],
  ['GET /api/learn/reports', 'handleLearnReports'],
  ['GET /api/learn/co-op', 'handleLearnCoOp'],
  ['POST /api/learn/odyssey/activate', 'handleLearnOdysseyActivate'],
  ['GET /api/learn/billing/status', 'handleLearnBillingStatus'],
  ['POST /api/learn/billing/checkout', 'handleLearnBillingCheckout'],
  ['POST /api/learn/billing/cancel', 'handleLearnBillingCancel'],
  ['POST /api/learn/grace-mode', 'handleLearnGraceModeSave'],
  ['POST /api/learn/family-planning', 'handleLearnFamilyPlanningSave'],
  ['POST /api/learn/planner', 'handleLearnPlannerBlockSave'],
  ['POST /api/learn/planner/move', 'handleLearnMoveUnfinishedWork'],
  ['POST /api/learn/feedback', 'handleLearnFeedbackSubmit'],
]);

const METHOD_AGNOSTIC_ROUTES = new Map([
  ['/api/learn/google-calendar/status', 'handleLearnGoogleCalendarStatus'],
  ['/api/learn/google-calendar/connect', 'handleLearnGoogleCalendarConnect'],
  ['/api/learn/google-calendar/preview', 'handleLearnGoogleCalendarPreview'],
  ['/api/learn/google-calendar/sync', 'handleLearnGoogleCalendarSync'],
]);

export async function routeLearnRequest({ request, env, url, actions }) {
  const exactAction = EXACT_ROUTES.get(`${request.method} ${url.pathname}`);
  if (exactAction) {
    return exactAction === 'handleLearnMeta' ? actions[exactAction](env) : actions[exactAction](request, env);
  }

  const generalAction = METHOD_AGNOSTIC_ROUTES.get(url.pathname);
  if (generalAction) return actions[generalAction](request, env);

  if (request.method === 'POST' && url.pathname.startsWith('/api/learn/print/')) {
    return actions.handleLearnPrintPdf(
      request,
      env,
      decodeURIComponent(url.pathname.slice('/api/learn/print/'.length))
    );
  }
  if (request.method === 'POST' && url.pathname === '/api/learn/print') {
    return actions.handleLearnPrintPdf(request, env, '');
  }
  if (
    request.method === 'POST' &&
    url.pathname.startsWith('/api/learn/community/resources/') &&
    url.pathname.endsWith('/flag')
  ) {
    const resourceId = decodeURIComponent(
      url.pathname.slice('/api/learn/community/resources/'.length, -'/flag'.length)
    );
    return actions.handleLearnCommunityFlag(request, env, resourceId);
  }
  if (request.method === 'POST' && url.pathname.startsWith('/api/learn/terms/') && url.pathname.endsWith('/close')) {
    const termId = decodeURIComponent(url.pathname.slice('/api/learn/terms/'.length, -'/close'.length));
    return actions.handleLearnTermClose(request, env, termId);
  }
  if (request.method === 'GET' && (url.pathname === '/api/learn/onboarding' || url.pathname === '/api/learn/setup')) {
    return actions.handleLearnOnboarding(request, env);
  }
  if (request.method === 'POST' && (url.pathname === '/api/learn/onboarding' || url.pathname === '/api/learn/setup')) {
    return actions.handleLearnOnboardingSave(request, env);
  }
  if (url.pathname === '/api/learn/google-calendar/callback') {
    return String(url.searchParams.get('state') || '').startsWith('sac.')
      ? actions.handleSacramentsGoogleCallback(request, env)
      : actions.handleLearnGoogleCalendarCallback(request, env);
  }
  return null;
}
