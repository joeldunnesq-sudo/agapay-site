type RouteResult = Response | null | undefined;
type AwaitableResult = RouteResult | Promise<RouteResult>;
export interface AdminMigrationEnvironment {
  readonly AGAPAY_ENABLE_KV_MIGRATION?: unknown;
}
export interface AdminActions<TEnv> {
  handleAdminAccountingOperations(request: Request, env: TEnv): AwaitableResult;
  handleAdminAuditLog(request: Request, env: TEnv): AwaitableResult;
  handleAdminContactLeads(request: Request, env: TEnv): AwaitableResult;
  handleAdminDailyPastoralCareDigest(request: Request, env: TEnv): AwaitableResult;
  handleAdminEmailDiagnostics(request: Request, env: TEnv): AwaitableResult;
  handleAdminGrantStewardshipComp(request: Request, env: TEnv): AwaitableResult;
  handleAdminLearnCommunity(request: Request, env: TEnv, resource?: string): AwaitableResult;
  handleAdminLearnFeedback(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleAdminLearnScholarship(request: Request, env: TEnv): AwaitableResult;
  handleAdminLearnSummary(request: Request, env: TEnv): AwaitableResult;
  handleAdminMigrateKvToD1(request: Request, env: TEnv): AwaitableResult;
  handleAdminNonprofitPricing(request: Request, env: TEnv): AwaitableResult;
  handleAdminNonprofitPricingAlerts(request: Request, env: TEnv): AwaitableResult;
  handleAdminNonprofitPricingDocumentView(
    request: Request,
    env: TEnv,
    resource: string,
    subpath: string,
    context: string
  ): AwaitableResult;
  handleAdminOnboardingTest(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleAdminParishSupportTickets(request: Request, env: TEnv, resource?: string): AwaitableResult;
  handleAdminPassword(request: Request, env: TEnv): AwaitableResult;
  handleAdminPlatformSummary(request: Request, env: TEnv): AwaitableResult;
  handleAdminRebuildIndexes(request: Request, env: TEnv): AwaitableResult;
  handleAdminRecentActivity(request: Request, env: TEnv): AwaitableResult;
  handleAdminRegistrationDetail(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleAdminRegistrationGivingSummary(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleAdminRegistrations(request: Request, env: TEnv): AwaitableResult;
  handleAdminRelationships(request: Request, env: TEnv): AwaitableResult;
  handleAdminReleaseStatus(request: Request, env: TEnv): AwaitableResult;
  handleAdminSession(request: Request, env: TEnv): AwaitableResult;
  handleAdminSetSacramentsEnabled(request: Request, env: TEnv): AwaitableResult;
  handleAdminStewardshipCompStatus(request: Request, env: TEnv): AwaitableResult;
  handleAdminTaxExemptionApprove(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleAdminTaxExemptionDetail(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleAdminTaxExemptionDocumentView(request: Request, env: TEnv, resource: string, subpath: string): AwaitableResult;
  handleAdminTaxExemptionExpire(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleAdminTaxExemptionNote(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleAdminTaxExemptionQueue(request: Request, env: TEnv): AwaitableResult;
  handleAdminTaxExemptionReject(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleAdminTaxExemptionRequestReplacement(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleAdminTaxExemptionRetrySync(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleAdminTaxExemptionRevoke(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleAdminTaxExemptionSummary(request: Request, env: TEnv): AwaitableResult;
  handleAdminTaxExemptionSyncReconcile(request: Request, env: TEnv, resource: string, subpath: string): AwaitableResult;
  handleAdminTaxExemptionSyncRetry(request: Request, env: TEnv, resource: string, subpath: string): AwaitableResult;
  handleAdminWeeklyAnnouncementDigest(request: Request, env: TEnv): AwaitableResult;
  handleAdminWeeklyCommemorationEmails(request: Request, env: TEnv): AwaitableResult;
  handleAdminWeeklySacramentDigest(request: Request, env: TEnv): AwaitableResult;
  handleAdminWeeklyTreasurerCommerceEmails(request: Request, env: TEnv): AwaitableResult;
  handleDashboardInvite(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleIdentityCapabilityCatalog(request: Request): AwaitableResult;
  handleIdentityInvitationAccept(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleIdentityLogin(request: Request, env: TEnv): AwaitableResult;
  handleIdentityLogout(request: Request, env: TEnv): AwaitableResult;
  handleIdentitySession(request: Request, env: TEnv): AwaitableResult;
  handleMfaEnrollmentOptions(request: Request, env: TEnv): AwaitableResult;
  handleMfaEnrollmentVerify(request: Request, env: TEnv): AwaitableResult;
  handleMfaStatus(request: Request, env: TEnv): AwaitableResult;
  handleMfaStepUp(request: Request, env: TEnv): AwaitableResult;
  handleMfaVerify(request: Request, env: TEnv): AwaitableResult;
  handleParishAuthenticatorSetup(request: Request, env: TEnv): AwaitableResult;
  handleStripeRefresh(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleSubscriptionCheckout(request: Request, env: TEnv, resource: string): AwaitableResult;
  json(arg0: unknown, arg1: ResponseInit): Response;
}
export interface AdminRouteContext<TEnv> {
  request: Request;
  env: TEnv;
  url: URL;
  actions: AdminActions<TEnv>;
}

const SIMPLE_ROUTES = new Map<
  string,
  | 'handleAdminRelationships'
  | 'handleAdminSession'
  | 'handleMfaEnrollmentOptions'
  | 'handleMfaEnrollmentVerify'
  | 'handleMfaVerify'
  | 'handleMfaStepUp'
  | 'handleMfaStatus'
  | 'handleParishAuthenticatorSetup'
  | 'handleIdentityLogin'
  | 'handleIdentitySession'
  | 'handleIdentityLogout'
  | 'handleIdentityCapabilityCatalog'
  | 'handleAdminEmailDiagnostics'
  | 'handleAdminWeeklyCommemorationEmails'
  | 'handleAdminWeeklyTreasurerCommerceEmails'
  | 'handleAdminDailyPastoralCareDigest'
  | 'handleAdminWeeklySacramentDigest'
  | 'handleAdminWeeklyAnnouncementDigest'
  | 'handleAdminRebuildIndexes'
  | 'handleAdminPassword'
  | 'handleAdminParishSupportTickets'
  | 'handleAdminLearnScholarship'
  | 'handleAdminLearnCommunity'
  | 'handleAdminTaxExemptionSummary'
  | 'handleAdminTaxExemptionQueue'
  | 'handleAdminNonprofitPricing'
  | 'handleAdminNonprofitPricingAlerts'
>([
  ['/api/admin/relationships', 'handleAdminRelationships'],
  ['/api/admin/session', 'handleAdminSession'],
  ['/api/mfa/enrollment/options', 'handleMfaEnrollmentOptions'],
  ['/api/mfa/enrollment/verify', 'handleMfaEnrollmentVerify'],
  ['/api/mfa/verify', 'handleMfaVerify'],
  ['/api/mfa/step-up', 'handleMfaStepUp'],
  ['/api/mfa/status', 'handleMfaStatus'],
  ['/api/mfa/parish-authenticator', 'handleParishAuthenticatorSetup'],
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

const GET_ROUTES = new Map<
  string,
  | 'handleAdminRegistrations'
  | 'handleAdminPlatformSummary'
  | 'handleAdminRecentActivity'
  | 'handleAdminReleaseStatus'
  | 'handleAdminAuditLog'
  | 'handleAdminLearnSummary'
>([
  ['/api/admin/registrations', 'handleAdminRegistrations'],
  ['/api/admin/platform-summary', 'handleAdminPlatformSummary'],
  ['/api/admin/recent-activity', 'handleAdminRecentActivity'],
  ['/api/admin/release-status', 'handleAdminReleaseStatus'],
  ['/api/admin/audit-log', 'handleAdminAuditLog'],
  ['/api/admin/learn/summary', 'handleAdminLearnSummary'],
]);

export async function routeAdminRequest<TEnv extends object>({ request, env, url, actions }: AdminRouteContext<TEnv>) {
  if (url.pathname === '/api/admin/contact-leads' || url.pathname.startsWith('/api/admin/contact-leads/'))
    return actions.handleAdminContactLeads(request, env);
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
    if ((env as TEnv & AdminMigrationEnvironment).AGAPAY_ENABLE_KV_MIGRATION !== 'true') {
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
    ] as const;
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
    const handlers: Record<string, (request: Request, env: TEnv, id: string) => AwaitableResult> = {
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
