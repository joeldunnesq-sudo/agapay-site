// Generated from src/lib/http-responses.ts by npm run build:server. Do not edit.
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Strict-Transport-Security': 'max-age=2592000; includeSubDomains',
  'Permissions-Policy':
    'geolocation=(), microphone=(), camera=(self), payment=(self), fullscreen=(self "https://www.youtube.com" "https://www.youtube-nocookie.com")',
  'Content-Security-Policy-Report-Only':
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://static.cloudflareinsights.com https://connect.facebook.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self' https://challenges.cloudflare.com https://*.cloudflarestream.com https://www.facebook.com; media-src 'self' https://*.cloudflarestream.com; frame-src https://challenges.cloudflare.com https://www.youtube.com https://www.youtube-nocookie.com; object-src 'none'; base-uri 'self'; form-action 'self'",
};
function json(body, init = {}) {
  return Response.json(body, {
    ...init,
    headers: {
      'Cache-Control': 'no-store',
      ...SECURITY_HEADERS,
      ...(init.headers || {}),
    },
  });
}
function corsHeaders(env) {
  const configuredOrigin = String(env?.AGAPAY_CORS_ORIGIN || '').trim();
  const environment = String(env?.AGAPAY_ENVIRONMENT || '')
    .trim()
    .toLowerCase();
  const origin = configuredOrigin || (environment === 'production' ? '' : '*');
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-AGAPAY-Donor-Email',
    'Access-Control-Max-Age': '86400',
  };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}
function corsJson(body, env, init = {}) {
  return Response.json(body, {
    ...init,
    headers: {
      'Cache-Control': 'no-store',
      ...SECURITY_HEADERS,
      ...corsHeaders(env),
      ...(init.headers || {}),
    },
  });
}
function corsPreflightResponse(env) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(env),
  });
}
export { SECURITY_HEADERS, corsHeaders, corsJson, corsPreflightResponse, json };
