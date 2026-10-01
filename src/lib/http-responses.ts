export interface HttpResponseEnv {
  readonly AGAPAY_CORS_ORIGIN?: unknown;
  readonly AGAPAY_ENVIRONMENT?: unknown;
}
// These helpers spread a plain header record; they do not normalize Headers objects.
export type JsonResponseInit = Omit<ResponseInit, 'headers'> & {
  readonly headers?: Readonly<Record<string, string>> | null;
};

// Baseline security response headers, applied to every Worker-generated
// response (API JSON) via json()/corsJson() below. Static assets get the
// same set via public/_headers, which Cloudflare's asset layer applies
// independently of the Worker -- see docs/SECURITY_HEADERS.md for how the
// two mechanisms cover different response paths and why both are needed.
//
// CSP ships in Report-Only mode intentionally: this codebase has
// extensive inline <script>/style="" usage by design (no build step), so
// an enforcing CSP without nonces would break real pages. Report-Only
// has zero behavior risk -- browsers only log violations to the console,
// never block -- while still surfacing anything loading from an
// unexpected origin (the actual threat CSP defends against here).
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Strict-Transport-Security': 'max-age=2592000; includeSubDomains',
  'Permissions-Policy':
    'geolocation=(), microphone=(), camera=(self), payment=(self), fullscreen=(self "https://www.youtube.com" "https://www.youtube-nocookie.com")',
  'Content-Security-Policy-Report-Only':
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://static.cloudflareinsights.com https://connect.facebook.net; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com data:; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' https://challenges.cloudflare.com https://*.cloudflarestream.com https://www.facebook.com; " +
    "media-src 'self' https://*.cloudflarestream.com; " +
    'frame-src https://challenges.cloudflare.com https://www.youtube.com https://www.youtube-nocookie.com; ' +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'",
};

export function json(body: unknown, init: JsonResponseInit = {}): Response {
  return Response.json(body, {
    ...init,
    headers: {
      'Cache-Control': 'no-store',
      ...SECURITY_HEADERS,
      ...(init.headers || {}),
    },
  });
}

// CORS headers for public-facing API endpoints that may be called cross-origin.
// Production must opt into a specific origin; a missing production binding
// deliberately omits Access-Control-Allow-Origin rather than failing open.
// Non-production environments retain the wildcard default for local/staging use.
export function corsHeaders(env: HttpResponseEnv | null | undefined): Record<string, string> {
  const configuredOrigin = String(env?.AGAPAY_CORS_ORIGIN || '').trim();
  const environment = String(env?.AGAPAY_ENVIRONMENT || '')
    .trim()
    .toLowerCase();
  const origin = configuredOrigin || (environment === 'production' ? '' : '*');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-AGAPAY-Donor-Email',
    'Access-Control-Max-Age': '86400',
  };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function corsJson(
  body: unknown,
  env: HttpResponseEnv | null | undefined,
  init: JsonResponseInit = {}
): Response {
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

export function corsPreflightResponse(env: HttpResponseEnv | null | undefined): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(env),
  });
}
