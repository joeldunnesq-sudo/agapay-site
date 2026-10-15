export interface AttributionTouch extends Record<string, unknown> {
  source: string;
  medium: string;
  campaign: string;
  content: string;
  term: string;
  rawReferrer: string;
  page: string;
  timestamp: string;
  category: string;
  currentUtms: Record<string, string>;
  referringUrl: string;
}
interface RawTouch extends Record<string, unknown> {
  currentUtms?: Record<string, unknown>;
}
// Shared browser/server attribution schema. Never trust client-provided categories.
export const UTM_FIELDS = ['source', 'medium', 'campaign', 'content', 'term'];
export function cleanText(value: unknown, limit: number = 200) {
  return typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f\u007f<>]/g, '')
        .trim()
        .slice(0, limit)
    : '';
}
export function cleanUrl(value: unknown) {
  try {
    const url = new URL(cleanText(value, 4096));
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    // Queries, fragments and credentials can contain personal information or tokens.
    return `${url.origin}${url.pathname}`.slice(0, 1024);
  } catch {
    return '';
  }
}
function host(value: string) {
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).hostname.toLowerCase();
  } catch {
    return '';
  }
}
export function normalizeSource(source: unknown, medium: string, referrer: string = '') {
  const name = cleanText(source).toLowerCase();
  const domain = host(name || referrer);
  const matches = (...names: string[]) => names.some((item) => domain === item || domain.endsWith(`.${item}`));
  if (/^(email|e-mail|newsletter)$/.test(cleanText(medium).toLowerCase()) || /^(email|newsletter)$/.test(name))
    return 'Email';
  if (matches('chatgpt.com', 'chat.openai.com') || name === 'chatgpt') return 'ChatGPT / Organic AI';
  if (matches('facebook.com', 'instagram.com', 'fb.com') || /^(facebook|instagram|meta|fb|ig)$/.test(name)) {
    return /^(paid|paid_social|paid-social|paidsocial|cpc|ppc|cpm)$/i.test(medium) ? 'Meta / Paid' : 'Meta / Organic';
  }
  const paid = /^(paid|cpc|ppc|paid_search|display)$/i.test(medium);
  if (
    matches('perplexity.ai', 'claude.ai', 'gemini.google.com', 'copilot.microsoft.com') ||
    /^(perplexity|claude|gemini|copilot)$/.test(name)
  )
    return 'Other AI Referral';
  if (name === 'google' || matches('google.com') || /(^|\.)google\.(co\.[a-z]{2}|com\.[a-z]{2}|[a-z]{2})$/.test(domain))
    return paid ? 'Other' : 'Google / Organic';
  if (name === 'bing' || matches('bing.com')) return paid ? 'Other' : 'Bing / Organic';
  if ((!name && !referrer) || /^(direct|\(direct\))$/.test(name)) return 'Direct';
  return (!name && referrer) || domain.includes('.') || /^(referral|organic)$/i.test(medium) ? 'Referral' : 'Other';
}
export function readUtms(url: string) {
  try {
    const params = new URL(url).searchParams;
    return Object.fromEntries(UTM_FIELDS.map((key) => [key, cleanText(params.get(`utm_${key}`))]));
  } catch {
    return {};
  }
}
export function sanitizeTouch(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const touch: AttributionTouch = Object.fromEntries(
    UTM_FIELDS.map((key) => [key, cleanText((value as RawTouch)[key])])
  ) as AttributionTouch;
  touch.rawReferrer = cleanUrl((value as RawTouch).rawReferrer);
  touch.page = cleanUrl((value as RawTouch).page);
  const time =
    typeof (value as RawTouch).timestamp === 'string' ? Date.parse((value as RawTouch).timestamp as string) : NaN;
  touch.timestamp = Number.isFinite(time) && time <= Date.now() + 300000 ? new Date(time).toISOString() : '';
  if (!touch.page || !touch.timestamp) return null;
  touch.category = normalizeSource(touch.source, touch.medium, touch.rawReferrer);
  touch.currentUtms = Object.fromEntries(
    UTM_FIELDS.map((key) => [key, cleanText((value as RawTouch).currentUtms?.[key])])
  );
  touch.referringUrl = cleanUrl((value as RawTouch).referringUrl);
  return touch;
}
export function sanitizeAttribution(
  value: { firstTouch?: unknown; lastTouch?: unknown } | null | undefined,
  submittedAt: string = new Date().toISOString()
) {
  try {
    const firstTouch = sanitizeTouch(value?.firstTouch);
    const lastTouch = sanitizeTouch(value?.lastTouch);
    if (!firstTouch && !lastTouch) return null;
    if (lastTouch) lastTouch.timestamp = submittedAt;
    return { version: 1, firstTouch, lastTouch };
  } catch {
    return null;
  }
}
export function captureTouch(url: string, referrer: string, timestamp: string) {
  let external = cleanUrl(referrer);
  try {
    if (new URL(url).origin === new URL(external).origin) external = '';
  } catch {
    /* No referrer. */
  }
  const utms = readUtms(url);
  return sanitizeTouch({
    ...utms,
    source: utms.source || host(external),
    rawReferrer: external,
    referringUrl: referrer,
    page: url,
    timestamp,
    currentUtms: utms,
  });
}
