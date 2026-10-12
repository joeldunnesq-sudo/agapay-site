// Generated from src/lib/webauthn.ts by npm run build:server. Do not edit.
function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function base64UrlToBytes(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
function safeJson(value, fallback) {
  try {
    const parsed = JSON.parse(String(value || ''));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}
function webauthnRpContext(request, env) {
  const requestUrl = new URL(request.url);
  const configured = String(env?.AGAPAY_APP_URL || '').trim();
  const local = requestUrl.hostname === 'localhost' || requestUrl.hostname === '127.0.0.1';
  const origin = local ? requestUrl.origin : configured ? new URL(configured).origin : requestUrl.origin;
  return { origin, rpID: new URL(origin).hostname };
}
async function opaqueWebauthnUserId(namespace, id) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${String(namespace || 'agapay')}:${String(id || '')}`)
  );
  return new Uint8Array(digest);
}
export { base64UrlToBytes, bytesToBase64Url, opaqueWebauthnUserId, safeJson, webauthnRpContext };
