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

export function json(body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, {
    ...init,
    headers: {
      'Cache-Control': 'no-store',
      ...SECURITY_HEADERS,
      ...(init.headers || {}),
    },
  });
}

export function unauthorized(): Response {
  return json({ error: 'Unauthorized' }, { status: 401 });
}

export function getBearerToken(request: Request): string {
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();
  return '';
}
