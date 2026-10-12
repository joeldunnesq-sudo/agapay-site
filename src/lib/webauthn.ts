// WebAuthn transport helpers shared by privileged MFA and optional consumer
// passkeys. Policy and credential storage intentionally remain in their
// separate domains.

export function bytesToBase64Url(bytes: Iterable<number>) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlToBytes(value: unknown) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function safeJson(value: unknown, fallback: unknown): unknown {
  try {
    const parsed = JSON.parse(String(value || ''));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function webauthnRpContext(request: Request, env: { AGAPAY_APP_URL?: unknown } | null | undefined) {
  const requestUrl = new URL(request.url);
  const configured = String(env?.AGAPAY_APP_URL || '').trim();
  const local = requestUrl.hostname === 'localhost' || requestUrl.hostname === '127.0.0.1';
  const origin = local ? requestUrl.origin : configured ? new URL(configured).origin : requestUrl.origin;
  return { origin, rpID: new URL(origin).hostname };
}

export async function opaqueWebauthnUserId(namespace: unknown, id: unknown) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${String(namespace || 'agapay')}:${String(id || '')}`)
  );
  return new Uint8Array(digest);
}
