export async function routePublicRequest({ request, env, url, actions }) {
  if (request.method === 'POST' && url.pathname === '/api/stripe/webhook') {
    return actions.handleStripeWebhook(request, env);
  }
  if (request.method === 'POST' && url.pathname === '/api/resend/webhook') {
    return actions.handleResendWebhook(request, env);
  }
  if (request.method === 'GET' && url.pathname === '/api/listen/profile') {
    try {
      const donor = await actions.requireDonor(request, env);
      if (donor) {
        const name = donor.donorName || donor.householdName || 'AGAPAY Member';
        const initials =
          name
            .split(' ')
            .map((part) => part[0])
            .join('')
            .toUpperCase()
            .slice(0, 2) || '--';
        return actions.json({ authenticated: true, name, initials, memberStatus: 'AGAPAY Member' });
      }
    } catch (error) {
      console.warn('Listen profile SSO error:', error);
    }
    return actions.json({ authenticated: false, name: 'Guest Listener', initials: '--', memberStatus: 'Anonymous' });
  }
  if (request.method === 'GET' && url.pathname === '/api/listen/search')
    return actions.handleListenSearch(request, env);
  if (request.method === 'GET' && url.pathname === '/api/listen/rss') return actions.handleListenRss(request, env);
  if (request.method === 'GET' && url.pathname === '/api/listen/audio') return actions.handleListenAudio(request, env);
  if (url.pathname === '/api/listen/progress') return actions.handleListenProgress(request, env);
  if (url.pathname === '/api/listen/subscriptions') return actions.handleListenSubscriptions(request, env);
  if (request.method === 'GET' && url.pathname === '/api/parishes') {
    return actions.addCorsHeaders(await actions.handleParishes(request, env), env);
  }
  if (request.method === 'GET' && url.pathname === '/api/campaign') {
    return actions.addCorsHeaders(await actions.handlePublicCampaign(request, env), env);
  }
  if (request.method === 'GET' && url.pathname === '/api/platform/summary') {
    return actions.addCorsHeaders(await actions.handlePublicPlatformSummary(env), env);
  }
  if (url.pathname.startsWith('/api/public/parish-assets/')) return actions.handlePublicParishAsset(request, env);
  if (request.method === 'GET' && url.pathname === '/api/subscription-tiers') {
    return actions.corsJson({ tiers: actions.publicSubscriptionTiers() }, env);
  }
  if (request.method === 'GET' && url.pathname === '/api/marketplace/catalog') {
    return actions.addCorsHeaders(await actions.handleMarketplaceCatalog(request), env);
  }
  if (url.pathname === '/api/waitlist') return actions.handleWaitlist(request, env);
  if (url.pathname === '/api/parish-interest') return actions.handleParishInterest(request, env);
  if (request.method === 'GET' && url.pathname === '/api/security/config') return actions.handleSecurityConfig(env);
  if (request.method === 'GET' && url.pathname === '/api/health') return actions.handleHealth(env);
  if (request.method === 'GET' && url.pathname === '/api/liturgical-calendar') {
    return actions.addCorsHeaders(await actions.handleLiturgicalCalendar(request), env);
  }
  if (request.method === 'GET' && url.pathname === '/api/donor/liturgical-day') {
    return actions.handleDonorLiturgicalDay(request, env);
  }
  if (request.method === 'POST' && url.pathname === '/api/registrations') {
    return actions.handleRegistrations(request, env);
  }
  if (url.pathname === '/api/tax-exemption/state-guidance') {
    return actions.handleTaxExemptionStateGuidance(request, env);
  }
  if (url.pathname.startsWith('/api/tax-exemption/') && url.pathname.endsWith('/upload')) {
    const exemptionId = decodeURIComponent(url.pathname.replace('/api/tax-exemption/', '').replace('/upload', ''));
    return actions.handleClaimScopedDocumentUpload(request, env, exemptionId);
  }
  return null;
}
