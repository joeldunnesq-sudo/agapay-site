const SIMPLE_ROUTES = new Map([
  ['/api/admin/session', 'handleAdminSession'],
  ['/api/mfa/enrollment/options', 'handleMfaEnrollmentOptions'],
  ['/api/mfa/enrollment/verify', 'handleMfaEnrollmentVerify'],
  ['/api/mfa/verify', 'handleMfaVerify'],
  ['/api/mfa/step-up', 'handleMfaStepUp'],
  ['/api/mfa/status', 'handleMfaStatus'],
  ['/api/identity/login', 'handleIdentityLogin'],
  ['/api/identity/session', 'handleIdentitySession'],
  ['/api/identity/logout', 'handleIdentityLogout'],
  ['/api/identity/capabilities', 'handleIdentityCapabilityCatalog'],
  ['/api/admin/email-diagnostics', 'handleAdminEmailDiagnostics'],
  ['/api/admin/commemorations/send-weekly', 'handleAdminWeeklyCommemorationEmails'],
  ['/api/admin/commerce/send-weekly-treasurer', 'handleAdminWeeklyTreasurerCommerceEmails'],
  ['/api/admin/sacraments/send-daily-pastoral-digest', 'handleAdminDailyPastoralCareDigest'],
  ['/api/admin/sacraments/send-weekly-digest', 'handleAdminWeeklySacramentDigest'],
  ['/api/admin/communications/send-weekly-digest', 'handleAdminWeeklyAnnouncementDigest'],
  ['/api/admin/rebuild-indexes', 'handleAdminRebuildIndexes'],
  ['/api/admin/password', 'handleAdminPassword'],
  ['/api/admin/parish-support-tickets', 'handleAdminParishSupportTickets'],
  ['/api/admin/learn/scholarships', 'handleAdminLearnScholarship'],
  ['/api/admin/learn/community', 'handleAdminLearnCommunity'],
  ['/api/admin/tax-exemptions/summary', 'handleAdminTaxExemptionSummary'],
  ['/api/admin/tax-exemptions', 'handleAdminTaxExemptionQueue'],
  ['/api/admin/nonprofit-pricing', 'handleAdminNonprofitPricing'],
  ['/api/admin/nonprofit-pricing/alerts/run', 'handleAdminNonprofitPricingAlerts'],
]);

const GET_ROUTES = new Map([
  ['/api/admin/registrations', 'handleAdminRegistrations'],
  ['/api/admin/platform-summary', 'handleAdminPlatformSummary'],
  ['/api/admin/recent-activity', 'handleAdminRecentActivity'],
  ['/api/admin/release-status', 'handleAdminReleaseStatus'],
  ['/api/admin/audit-log', 'handleAdminAuditLog'],
  ['/api/admin/learn/summary', 'handleAdminLearnSummary'],
]);

export async function routeAdminRequest({ request, env, url, actions }) {
  const getAction = request.method === 'GET' ? GET_ROUTES.get(url.pathname) : null;
  if (getAction) return actions[getAction](request, env);

  const simpleAction = SIMPLE_ROUTES.get(url.pathname);
  if (simpleAction) {
    return simpleAction === 'handleIdentityCapabilityCatalog'
      ? actions[simpleAction](request)
      : actions[simpleAction](request, env);
  }

  if (url.pathname.startsWith('/api/identity/invitations/') && url.pathname.endsWith('/accept')) {
    const token = decodeURIComponent(url.pathname.replace('/api/identity/invitations/', '').replace('/accept', ''));
    return actions.handleIdentityInvitationAccept(request, env, token);
  }
  if (url.pathname.startsWith('/api/admin/accounting/')) {
    return actions.handleAdminAccountingOperations(request, env);
  }
  if (url.pathname === '/api/admin/stewardship/comp' && request.method === 'POST') {
    return actions.handleAdminGrantStewardshipComp(request, env);
  }
  if (url.pathname === '/api/admin/stewardship/comp-status' && request.method === 'GET') {
    return actions.handleAdminStewardshipCompStatus(request, env);
  }
  if (url.pathname === '/api/admin/sacraments/enabled' && request.method === 'POST') {
    return actions.handleAdminSetSacramentsEnabled(request, env);
  }
  if (url.pathname === '/api/admin/migrate-kv-to-d1') {
    if (env.AGAPAY_ENABLE_KV_MIGRATION !== 'true') {
      return actions.json(
        { error: 'Migration endpoint is disabled. Set AGAPAY_ENABLE_KV_MIGRATION=true to enable.' },
        { status: 403 }
      );
    }
    return actions.handleAdminMigrateKvToD1(request, env);
  }
  if (url.pathname.startsWith('/api/admin/learn/feedback/')) {
    return actions.handleAdminLearnFeedback(
      request,
      env,
      decodeURIComponent(url.pathname.slice('/api/admin/learn/feedback/'.length))
    );
  }
  if (url.pathname.startsWith('/api/admin/parish-support-tickets/')) {
    return actions.handleAdminParishSupportTickets(
      request,
      env,
      decodeURIComponent(url.pathname.slice('/api/admin/parish-support-tickets/'.length))
    );
  }
  if (url.pathname.startsWith('/api/admin/learn/community/')) {
    return actions.handleAdminLearnCommunity(
      request,
      env,
      decodeURIComponent(url.pathname.slice('/api/admin/learn/community/'.length))
    );
  }

  const registrationPrefix = '/api/admin/registrations/';
  if (url.pathname.startsWith(registrationPrefix)) {
    const rest = url.pathname.slice(registrationPrefix.length);
    const registrationActions = [
      ['/subscription-checkout', actions.handleSubscriptionCheckout],
      ['/stripe-refresh', actions.handleStripeRefresh],
      ['/giving-summary', actions.handleAdminRegistrationGivingSummary],
      ['/dashboard-invite', actions.handleDashboardInvite],
      ['/onboarding-test', actions.handleAdminOnboardingTest],
    ];
    for (const [suffix, handler] of registrationActions) {
      if (rest.endsWith(suffix)) {
        return handler(request, env, decodeURIComponent(rest.slice(0, -suffix.length)));
      }
    }
    return actions.handleAdminRegistrationDetail(request, env, decodeURIComponent(rest));
  }

  if (url.pathname.startsWith('/api/admin/tax-exemptions/')) {
    const [taxExemptionId, action, syncId, syncAction] = url.pathname
      .slice('/api/admin/tax-exemptions/'.length)
      .split('/');
    if (action === 'syncs' && syncId && syncAction === 'retry') {
      return actions.handleAdminTaxExemptionSyncRetry(request, env, taxExemptionId, syncId);
    }
    if (action === 'syncs' && syncId && syncAction === 'reconcile') {
      return actions.handleAdminTaxExemptionSyncReconcile(request, env, taxExemptionId, syncId);
    }
    const handlers = {
      approve: actions.handleAdminTaxExemptionApprove,
      reject: actions.handleAdminTaxExemptionReject,
      'request-replacement': actions.handleAdminTaxExemptionRequestReplacement,
      revoke: actions.handleAdminTaxExemptionRevoke,
      expire: actions.handleAdminTaxExemptionExpire,
      'retry-sync': actions.handleAdminTaxExemptionRetrySync,
      notes: actions.handleAdminTaxExemptionNote,
    };
    if (handlers[action]) return handlers[action](request, env, taxExemptionId);
    if (action === 'document' || action === 'document-download') {
      return actions.handleAdminTaxExemptionDocumentView(
        request,
        env,
        taxExemptionId,
        action === 'document-download' ? 'attachment' : 'inline'
      );
    }
    if (!action) return actions.handleAdminTaxExemptionDetail(request, env, taxExemptionId);
    return actions.json({ error: 'Not found' }, { status: 404 });
  }

  if (url.pathname.startsWith('/api/admin/nonprofit-pricing/applications/') && url.pathname.includes('/documents/')) {
    const [applicationId, documentPart = ''] = url.pathname
      .slice('/api/admin/nonprofit-pricing/applications/'.length)
      .split('/documents/');
    const documentId = decodeURIComponent(documentPart.replace(/\/download$/, ''));
    return actions.handleAdminNonprofitPricingDocumentView(
      request,
      env,
      decodeURIComponent(applicationId),
      documentId,
      documentPart.endsWith('/download') ? 'attachment' : 'inline'
    );
  }
  return null;
}
