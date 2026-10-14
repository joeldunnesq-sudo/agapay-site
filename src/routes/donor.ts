type RouteResult = Response | null | undefined;
type AwaitableResult = RouteResult | Promise<RouteResult>;
export interface DonorActions<TEnv, TExecutionContext> {
  handleAnnouncementDigestUnsubscribe(request: Request, env: TEnv): AwaitableResult;
  handleConsumerPasskeyAuthenticationOptions(request: Request, env: TEnv): AwaitableResult;
  handleConsumerPasskeyAuthenticationVerify(request: Request, env: TEnv): AwaitableResult;
  handleConsumerPasskeyRegistrationOptions(request: Request, env: TEnv): AwaitableResult;
  handleConsumerPasskeyRegistrationVerify(request: Request, env: TEnv): AwaitableResult;
  handleConsumerPasskeys(request: Request, env: TEnv, resource?: string): AwaitableResult;
  handleDonorAccountDeletion(request: Request, env: TEnv): AwaitableResult;
  handleDonorBlog(request: Request, env: TEnv): AwaitableResult;
  handleDonorBookstore(request: Request, env: TEnv, resource?: string): AwaitableResult;
  handleDonorBookstoreIsbnLookup(request: Request, env: TEnv): AwaitableResult;
  handleDonorBookstoreItemFields(request: Request, env: TEnv): AwaitableResult;
  handleDonorBookstoreRequestFeature(request: Request, env: TEnv): AwaitableResult;
  handleDonorClaimCheckout(request: Request, env: TEnv): AwaitableResult;
  handleDonorCommemorations(request: Request, env: TEnv): AwaitableResult;
  handleDonorCustomNewsFeeds(request: Request, env: TEnv, resource?: string): AwaitableResult;
  handleDonorDashboard(request: Request, env: TEnv): AwaitableResult;
  handleDonorDigestSubscription(request: Request, env: TEnv): AwaitableResult;
  handleDonorEvents(request: Request, env: TEnv, resource?: string): AwaitableResult;
  handleDonorExternalFeed(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleDonorFeed(request: Request, env: TEnv, resource?: string): AwaitableResult;
  handleDonorGivingPlusFeatureRequest(request: Request, env: TEnv): AwaitableResult;
  handleDonorGivingStatementDownload(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleDonorGivingStatements(request: Request, env: TEnv): AwaitableResult;
  handleDonorGroups(request: Request, env: TEnv, resource: TExecutionContext): AwaitableResult;
  handleDonorKoinoniaCommunityTools(request: Request, env: TEnv): AwaitableResult;
  handleDonorKoinoniaExchange(request: Request, env: TEnv, resource: TExecutionContext): AwaitableResult;
  handleDonorKoinoniaPrayerRequests(request: Request, env: TEnv): AwaitableResult;
  handleDonorKoinoniaSignups(request: Request, env: TEnv, resource: TExecutionContext): AwaitableResult;
  handleDonorLogin(request: Request, env: TEnv): AwaitableResult;
  handleDonorMinistryServiceInterest(request: Request, env: TEnv): AwaitableResult;
  handleDonorNotificationDismiss(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleDonorNotifications(request: Request, env: TEnv): AwaitableResult;
  handleDonorOcaNews(request: Request, env: TEnv): AwaitableResult;
  handleDonorOfferings(request: Request, env: TEnv): AwaitableResult;
  handleDonorParishCalendar(request: Request, env: TEnv): AwaitableResult;
  handleDonorParishLibrary(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleDonorPasswordResetConfirm(request: Request, env: TEnv): AwaitableResult;
  handleDonorPasswordResetRequest(request: Request, env: TEnv): AwaitableResult;
  handleDonorPush(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleDonorSacramentAvailability(request: Request, env: TEnv): AwaitableResult;
  handleDonorSacramentBook(request: Request, env: TEnv): AwaitableResult;
  handleDonorSacramentCancel(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleDonorSacramentPreparation(request: Request, env: TEnv, resource: string): AwaitableResult;
  handleDonorSacraments(request: Request, env: TEnv): AwaitableResult;
  handleDonorSession(request: Request, env: TEnv): AwaitableResult;
  handleDonorSignup(request: Request, env: TEnv): AwaitableResult;
  handleDonorStewardshipFeatureRequest(request: Request, env: TEnv): AwaitableResult;
  handleDonorSubscriptionPortal(request: Request, env: TEnv): AwaitableResult;
  handleDonorSupportTicket(request: Request, env: TEnv): AwaitableResult;
  handleDonorTeaching(request: Request, env: TEnv, resource?: string, subpath?: string): AwaitableResult;
  handleDonorVerify(request: Request, env: TEnv): AwaitableResult;
  handleDonorVerifyPage(request: Request, env: TEnv): AwaitableResult;
  handleDonorVideo(request: Request, env: TEnv, resource?: string, subpath?: string): AwaitableResult;
  handleKoinoniaAccess(request: Request, env: TEnv): AwaitableResult;
  handleSacramentsGoogleCallback(request: Request, env: TEnv): AwaitableResult;
}
export interface DonorRouteContext<TEnv, TExecutionContext> {
  request: Request;
  env: TEnv;
  url: URL;
  ctx: TExecutionContext;
  actions: DonorActions<TEnv, TExecutionContext>;
}

const SIMPLE_ROUTES = new Map<
  string,
  | 'handleDonorSignup'
  | 'handleDonorLogin'
  | 'handleConsumerPasskeyAuthenticationOptions'
  | 'handleConsumerPasskeyAuthenticationVerify'
  | 'handleConsumerPasskeyRegistrationOptions'
  | 'handleConsumerPasskeyRegistrationVerify'
  | 'handleConsumerPasskeys'
  | 'handleDonorPasswordResetRequest'
  | 'handleDonorPasswordResetConfirm'
  | 'handleDonorVerify'
  | 'handleDonorSession'
  | 'handleDonorClaimCheckout'
  | 'handleDonorNotifications'
  | 'handleDonorDashboard'
  | 'handleDonorSupportTicket'
  | 'handleDonorAccountDeletion'
  | 'handleKoinoniaAccess'
  | 'handleDonorKoinoniaPrayerRequests'
  | 'handleDonorFeed'
  | 'handleDonorTeaching'
  | 'handleDonorVideo'
  | 'handleDonorBlog'
  | 'handleDonorOcaNews'
  | 'handleDonorCustomNewsFeeds'
  | 'handleDonorDigestSubscription'
  | 'handleAnnouncementDigestUnsubscribe'
  | 'handleDonorStewardshipFeatureRequest'
  | 'handleDonorGivingPlusFeatureRequest'
  | 'handleDonorMinistryServiceInterest'
  | 'handleDonorParishCalendar'
  | 'handleDonorOfferings'
  | 'handleDonorSubscriptionPortal'
  | 'handleDonorBookstoreItemFields'
  | 'handleDonorBookstoreIsbnLookup'
  | 'handleDonorBookstoreRequestFeature'
  | 'handleDonorBookstore'
  | 'handleDonorEvents'
  | 'handleDonorCommemorations'
  | 'handleDonorGivingStatements'
  | 'handleDonorSacraments'
  | 'handleSacramentsGoogleCallback'
  | 'handleDonorSacramentAvailability'
  | 'handleDonorSacramentBook'
>([
  ['/api/donor/signup', 'handleDonorSignup'],
  ['/api/donor/login', 'handleDonorLogin'],
  ['/api/donor/passkeys/authentication/options', 'handleConsumerPasskeyAuthenticationOptions'],
  ['/api/donor/passkeys/authentication/verify', 'handleConsumerPasskeyAuthenticationVerify'],
  ['/api/donor/passkeys/registration/options', 'handleConsumerPasskeyRegistrationOptions'],
  ['/api/donor/passkeys/registration/verify', 'handleConsumerPasskeyRegistrationVerify'],
  ['/api/donor/passkeys', 'handleConsumerPasskeys'],
  ['/api/donor/password-reset-request', 'handleDonorPasswordResetRequest'],
  ['/api/donor/password-reset-confirm', 'handleDonorPasswordResetConfirm'],
  ['/api/donor/verify', 'handleDonorVerify'],
  ['/api/donor/session', 'handleDonorSession'],
  ['/api/donor/claim-checkout', 'handleDonorClaimCheckout'],
  ['/api/donor/notifications', 'handleDonorNotifications'],
  ['/api/donor/dashboard', 'handleDonorDashboard'],
  ['/api/donor/support-tickets', 'handleDonorSupportTicket'],
  ['/api/donor/account-deletion', 'handleDonorAccountDeletion'],
  ['/api/donor/koinonia-access', 'handleKoinoniaAccess'],
  ['/api/donor/koinonia/prayer-requests', 'handleDonorKoinoniaPrayerRequests'],
  ['/api/donor/feed', 'handleDonorFeed'],
  ['/api/donor/teaching', 'handleDonorTeaching'],
  ['/api/donor/videos', 'handleDonorVideo'],
  ['/api/donor/blog', 'handleDonorBlog'],
  ['/api/donor/oca-news', 'handleDonorOcaNews'],
  ['/api/donor/custom-news-feeds', 'handleDonorCustomNewsFeeds'],
  ['/api/donor/digest/subscription', 'handleDonorDigestSubscription'],
  ['/api/donor/digest/unsubscribe', 'handleAnnouncementDigestUnsubscribe'],
  ['/api/donor/stewardship-feature-request', 'handleDonorStewardshipFeatureRequest'],
  ['/api/donor/giving-plus-feature-request', 'handleDonorGivingPlusFeatureRequest'],
  ['/api/donor/ministry-service-interest', 'handleDonorMinistryServiceInterest'],
  ['/api/donor/parish-calendar', 'handleDonorParishCalendar'],
  ['/api/donor/offerings', 'handleDonorOfferings'],
  ['/api/donor/subscription-portal', 'handleDonorSubscriptionPortal'],
  ['/api/donor/bookstore/item-fields', 'handleDonorBookstoreItemFields'],
  ['/api/donor/bookstore/isbn-lookup', 'handleDonorBookstoreIsbnLookup'],
  ['/api/donor/bookstore/request-feature', 'handleDonorBookstoreRequestFeature'],
  ['/api/donor/bookstore', 'handleDonorBookstore'],
  ['/api/donor/events', 'handleDonorEvents'],
  ['/api/donor/commemorations', 'handleDonorCommemorations'],
  ['/api/donor/giving-statements', 'handleDonorGivingStatements'],
  ['/api/donor/sacraments', 'handleDonorSacraments'],
  ['/api/parish/sacraments/google-calendar/callback', 'handleSacramentsGoogleCallback'],
  ['/api/donor/sacraments/availability', 'handleDonorSacramentAvailability'],
  ['/api/donor/sacraments/book', 'handleDonorSacramentBook'],
]);

const VERIFY_PAGES = new Set([
  '/donor/verify',
  '/donor/verify/',
  '/my-agapay/verify',
  '/my-agapay/verify/',
  '/myagapay/verify',
  '/myagapay/verify/',
]);

export async function routeDonorRequest<TEnv, TExecutionContext>({
  request,
  env,
  ctx,
  url,
  actions,
}: DonorRouteContext<TEnv, TExecutionContext>) {
  const simpleAction = SIMPLE_ROUTES.get(url.pathname);
  if (simpleAction) return actions[simpleAction](request, env);

  if (VERIFY_PAGES.has(url.pathname)) return actions.handleDonorVerifyPage(request, env);

  if (url.pathname.startsWith('/api/donor/passkeys/')) {
    const credentialId = decodeURIComponent(url.pathname.replace('/api/donor/passkeys/', ''));
    return actions.handleConsumerPasskeys(request, env, credentialId);
  }
  if (url.pathname.startsWith('/api/donor/notifications/') && url.pathname.endsWith('/dismiss')) {
    const notificationId = decodeURIComponent(
      url.pathname.replace('/api/donor/notifications/', '').replace('/dismiss', '')
    );
    return actions.handleDonorNotificationDismiss(request, env, notificationId);
  }
  if (
    url.pathname === '/api/donor/koinonia/community-tools' ||
    url.pathname.startsWith('/api/donor/koinonia/community-tools/')
  ) {
    return actions.handleDonorKoinoniaCommunityTools(request, env);
  }
  if (url.pathname === '/api/donor/koinonia/signups' || url.pathname.startsWith('/api/donor/koinonia/signups/')) {
    return actions.handleDonorKoinoniaSignups(request, env, ctx);
  }
  if (url.pathname === '/api/donor/koinonia/exchange' || url.pathname.startsWith('/api/donor/koinonia/exchange/')) {
    return actions.handleDonorKoinoniaExchange(request, env, ctx);
  }
  if (
    url.pathname === '/api/donor/koinonia/prayer-requests' ||
    url.pathname.startsWith('/api/donor/koinonia/prayer-requests/')
  ) {
    return actions.handleDonorKoinoniaPrayerRequests(request, env);
  }
  if (url.pathname === '/api/donor/library' || url.pathname.startsWith('/api/donor/library/')) {
    return actions.handleDonorParishLibrary(request, env, url.pathname.replace('/api/donor/library', ''));
  }
  if (url.pathname.startsWith('/api/donor/custom-news-feeds/')) {
    const feedId = decodeURIComponent(url.pathname.replace('/api/donor/custom-news-feeds/', '').replace(/\/+$/, ''));
    return actions.handleDonorCustomNewsFeeds(request, env, feedId);
  }
  if (url.pathname.startsWith('/api/donor/external-feeds/')) {
    const feedId = decodeURIComponent(url.pathname.replace('/api/donor/external-feeds/', '').replace(/\/+$/, ''));
    return actions.handleDonorExternalFeed(request, env, feedId);
  }
  if (url.pathname.startsWith('/api/donor/push/')) {
    const action = url.pathname.replace('/api/donor/push/', '').replace(/\/+$/, '');
    return actions.handleDonorPush(request, env, action);
  }
  if (url.pathname.startsWith('/api/donor/feed/') && url.pathname.endsWith('/read')) {
    const announcementId = decodeURIComponent(url.pathname.replace('/api/donor/feed/', '').replace('/read', ''));
    return actions.handleDonorFeed(request, env, announcementId);
  }
  if (url.pathname === '/api/donor/groups' || url.pathname.startsWith('/api/donor/groups/')) {
    return actions.handleDonorGroups(request, env, ctx);
  }
  if (url.pathname.startsWith('/api/public/bookstore/')) {
    const parishId = decodeURIComponent(url.pathname.replace('/api/public/bookstore/', '').replace(/\/+$/, ''));
    return actions.handleDonorBookstore(request, env, parishId);
  }
  if (url.pathname.startsWith('/api/public/events/')) {
    const parishId = decodeURIComponent(url.pathname.replace('/api/public/events/', '').replace(/\/+$/, ''));
    return actions.handleDonorEvents(request, env, parishId);
  }
  if (url.pathname.startsWith('/api/donor/giving-statements/') && url.pathname.endsWith('/download')) {
    const statementId = decodeURIComponent(
      url.pathname.replace('/api/donor/giving-statements/', '').replace('/download', '')
    );
    return actions.handleDonorGivingStatementDownload(request, env, statementId);
  }
  if (url.pathname.startsWith('/api/donor/sacraments/') && url.pathname.includes('/preparation/')) {
    return actions.handleDonorSacramentPreparation(request, env, url.pathname.replace('/api/donor/sacraments/', ''));
  }
  if (url.pathname.startsWith('/api/donor/sacraments/') && url.pathname.endsWith('/cancel')) {
    const requestId = decodeURIComponent(url.pathname.replace('/api/donor/sacraments/', '').replace('/cancel', ''));
    return actions.handleDonorSacramentCancel(request, env, requestId);
  }
  if (url.pathname.startsWith('/api/donor/teaching/') && url.pathname.endsWith('/read')) {
    const teachingId = decodeURIComponent(url.pathname.replace('/api/donor/teaching/', '').replace('/read', ''));
    return actions.handleDonorTeaching(request, env, teachingId, 'read');
  }
  if (url.pathname.startsWith('/api/donor/videos/')) {
    const parts = url.pathname.replace('/api/donor/videos/', '').split('/').filter(Boolean).map(decodeURIComponent);
    return actions.handleDonorVideo(request, env, parts[0] || '', parts[1] || '');
  }
  return null;
}
