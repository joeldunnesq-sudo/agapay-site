import { handleParishOutsideGifts } from '../handlers/parish-outside-gifts.js';

const SIMPLE_SUFFIX_ROUTES = new Map([
  ['/session', 'handleParishSession'],
  ['/onboarding', 'handleParishOnboarding'],
  ['/stripe-onboarding', 'handleParishStripeOnboarding'],
  ['/stripe-refresh', 'handleParishStripeRefresh'],
  ['/subscription-checkout', 'handleParishSubscriptionCheckout'],
  ['/demo-tier', 'handleParishDemoTier'],
  ['/subscription-refresh', 'handleParishSubscriptionRefresh'],
  ['/subscription-portal', 'handleParishSubscriptionPortal'],
  ['/commemorations', 'handleParishCommemorations'],
  ['/sacraments', 'handleParishSacraments'],
  ['/sacraments/google-calendar/status', 'handleSacramentsGoogleStatus'],
  ['/sacraments/google-calendar/connect', 'handleSacramentsGoogleConnect'],
  ['/sacraments/google-calendar/disconnect', 'handleSacramentsGoogleDisconnect'],
  ['/sacraments/availability', 'handleParishSacramentAvailability'],
  ['/sacraments/availability/rules', 'handleParishAvailabilityRuleCreate'],
  ['/sacraments/availability/blackouts', 'handleParishAvailabilityBlackoutCreate'],
  ['/memberships/invitations', 'handleMembershipInvitationCreate'],
  ['/memberships', 'handleMembershipList'],
  ['/giving-summary', 'handleParishGivingSummary'],
  ['/stripe-volume', 'handleParishStripeVolume'],
  ['/nonprofit-pricing', 'handleParishNonprofitPricing'],
  ['/nonprofit-pricing/documents', 'handleParishNonprofitPricingDocumentUpload'],
  ['/giving-history', 'handleParishGivingHistory'],
  ['/recurring-health', 'handleParishRecurringHealth'],
  ['/payout-diagnostics', 'handleParishPayoutDiagnostics'],
  ['/reconciliation/close', 'handleParishReconciliationClose'],
  ['/reconciliation', 'handleParishReconciliation'],
  ['/campaign-upload', 'handleParishCampaignUpload'],
  ['/logo', 'handleParishLogo'],
  ['/bookstore-readiness', 'handleParishBookstoreReadiness'],
  ['/tax-exemption/document', 'handleParishTaxExemptionDocumentView'],
  ['/tax-exemption/upload', 'handleParishTaxExemptionDocumentUpload'],
  ['/tax-exemption', 'handleParishTaxExemptionClaim'],
]);

export async function routeParishRequest({ request, env, ctx, url, actions }) {
  if (url.pathname === '/api/parish/password-reset-request') {
    return actions.handleParishPasswordResetRequest(request, env);
  }
  if (url.pathname === '/api/parish/password-reset-confirm') {
    return actions.handleParishPasswordResetConfirm(request, env);
  }
  if (request.method === 'POST' && url.pathname === '/api/create-checkout-session') {
    return actions.handleCheckout(request, env);
  }
  if ((request.method === 'GET' || request.method === 'POST') && url.pathname === '/api/checkout-session-status') {
    return actions.handleCheckoutSessionStatus(request, env);
  }

  const prefix = '/api/parish/dashboard/';
  if (!url.pathname.startsWith(prefix)) return null;

  const remainder = url.pathname.slice(prefix.length);
  const slashIndex = remainder.indexOf('/');
  const parishId = decodeURIComponent(slashIndex < 0 ? remainder : remainder.slice(0, slashIndex));
  const suffix = slashIndex < 0 ? '' : remainder.slice(slashIndex);
  if (suffix === '/outside-gifts' || suffix.startsWith('/outside-gifts/')) {
    return handleParishOutsideGifts(request, env, parishId, suffix.slice('/outside-gifts'.length));
  }
  const simpleAction = SIMPLE_SUFFIX_ROUTES.get(suffix);
  if (simpleAction) return actions[simpleAction](request, env, parishId);

  if (suffix.startsWith('/library')) {
    return actions.handleParishLibrary(request, env, parishId, suffix.slice('/library'.length));
  }
  if (suffix.startsWith('/bulletins')) {
    return actions.handleParishBulletins(request, env, parishId, suffix.slice('/bulletins'.length));
  }
  if (suffix.startsWith('/communications')) {
    const subpath = suffix.slice('/communications'.length);
    const normalizedSubpath = subpath.replace(/^\/+/, '');
    if (normalizedSubpath === 'teaching' || normalizedSubpath.startsWith('teaching/')) {
      return actions.handleParishTeaching(request, env, parishId, normalizedSubpath.replace(/^teaching\/?/, ''), ctx);
    }
    if (normalizedSubpath === 'video' || normalizedSubpath.startsWith('video/')) {
      return actions.handleParishVideo(request, env, parishId, normalizedSubpath.replace(/^video\/?/, ''));
    }
    if (normalizedSubpath === 'blog') return actions.handleParishBlog(request, env, parishId);
    return actions.handleParishCommunications(request, env, parishId, subpath, ctx);
  }
  if (suffix.startsWith('/prayer-requests')) {
    return actions.handleParishPrayerRequests(request, env, parishId, suffix.slice('/prayer-requests'.length));
  }
  if (suffix.startsWith('/sacraments/availability/rules/')) {
    return actions.handleParishAvailabilityRuleDelete(
      request,
      env,
      parishId,
      decodeURIComponent(suffix.slice('/sacraments/availability/rules/'.length))
    );
  }
  if (suffix.startsWith('/sacraments/availability/blackouts/')) {
    return actions.handleParishAvailabilityBlackoutDelete(
      request,
      env,
      parishId,
      decodeURIComponent(suffix.slice('/sacraments/availability/blackouts/'.length))
    );
  }
  if (suffix === '/sacraments/follow-up' || suffix.startsWith('/sacraments/follow-up/')) {
    return actions.handleParishPastoralFollowUp(
      request,
      env,
      parishId,
      suffix.slice('/sacraments/follow-up'.length),
      ctx
    );
  }
  if (
    suffix.includes('/sacraments/preparation') ||
    (suffix.startsWith('/sacraments/') && suffix.includes('/preparation/'))
  ) {
    return actions.handleParishSacramentPreparation(request, env, parishId, suffix.slice('/sacraments/'.length));
  }
  if (suffix.startsWith('/sacraments/')) {
    return actions.handleParishSacramentUpdate(
      request,
      env,
      parishId,
      decodeURIComponent(suffix.slice('/sacraments/'.length))
    );
  }
  if (suffix.startsWith('/memberships/invitations/')) {
    return actions.handleMembershipInvitationRevoke(
      request,
      env,
      parishId,
      decodeURIComponent(suffix.slice('/memberships/invitations/'.length))
    );
  }
  if (suffix.startsWith('/nonprofit-pricing/documents/')) {
    const documentPart = suffix.slice('/nonprofit-pricing/documents/'.length);
    const documentId = decodeURIComponent(documentPart.replace(/\/download$/, ''));
    return actions.handleParishNonprofitPricingDocumentView(
      request,
      env,
      parishId,
      documentId,
      documentPart.endsWith('/download') ? 'attachment' : 'inline'
    );
  }
  if (suffix.startsWith('/bookstore')) {
    return actions.handleParishBookstore(request, env, parishId, suffix.slice('/bookstore'.length));
  }
  if (suffix.startsWith('/events')) {
    return actions.handleParishEvents(request, env, parishId, suffix.slice('/events'.length));
  }
  if (suffix.startsWith('/settlement-profiles')) {
    return actions.handleParishSettlementProfiles(request, env, parishId, suffix.slice('/settlement-profiles'.length));
  }
  if (suffix === '/giving-statements/preview') {
    return actions.handleGivingStatementPreview(request, env, parishId);
  }
  if (suffix === '/giving-statements/jobs') {
    return request.method === 'POST'
      ? actions.handleGivingStatementJobCreate(request, env, parishId, ctx)
      : actions.handleGivingStatementJobList(request, env, parishId);
  }
  if (suffix.startsWith('/giving-statements/jobs/')) {
    return actions.handleGivingStatementJobStatus(
      request,
      env,
      parishId,
      decodeURIComponent(suffix.slice('/giving-statements/jobs/'.length))
    );
  }
  if (suffix.startsWith('/feature-requests/') && suffix.endsWith('/dismiss')) {
    const featureId = decodeURIComponent(suffix.slice('/feature-requests/'.length, -'/dismiss'.length));
    return actions.handleParishFeatureRequestDismiss(request, env, parishId, featureId);
  }

  // Preserve the legacy fallback contract, including its handling of unknown
  // suffixes, until all dashboard handlers have explicit route definitions.
  return actions.handleParishDashboard(request, env, decodeURIComponent(remainder));
}
