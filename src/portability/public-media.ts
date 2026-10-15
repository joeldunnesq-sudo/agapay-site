import type { PortabilityConfiguration } from './contracts.js';
import { POLICY_VERSION } from './catalog.js';

export const PUBLIC_MEDIA_BINDINGS = Object.freeze({
  campaign: 'CAMPAIGN_ASSETS',
  announcement: 'ANNOUNCEMENT_ASSETS',
  teaching: 'TEACHING_ASSETS',
});

export const PUBLIC_MEDIA_PATH = '/api/public/parish-assets/';

export function publicMediaBase(env: PortabilityConfiguration, binding: string) {
  const entry = Object.entries(PUBLIC_MEDIA_BINDINGS).find(([, value]) => value === binding);
  if (!entry) return '';
  try {
    const root = new URL(env.AGAPAY_PUBLIC_URL!);
    if (root.protocol !== 'https:' || root.search || root.hash || root.username || root.password) return '';
    return root.origin + PUBLIC_MEDIA_PATH + entry[0];
  } catch {
    return '';
  }
}

export function workerPublicMediaDeliveryEnabled(env: PortabilityConfiguration) {
  if (env.PARISH_PUBLIC_MEDIA_DELIVERY_ENABLED !== POLICY_VERSION) return false;
  return Object.values(PUBLIC_MEDIA_BINDINGS).every((binding) => {
    const expected = publicMediaBase(env, binding);
    return (
      expected && String((env as Record<string, unknown>)[binding + '_URL'] || '').replace(/\/+$/, '') === expected
    );
  });
}

// Closure/cache disposal may rely on Worker delivery only after the historical
// public origins have also been disabled and independently attested.
export function workerPublicMediaVerified(env: PortabilityConfiguration) {
  return workerPublicMediaDeliveryEnabled(env) && env.PARISH_R2_DEV_PUBLIC_ACCESS_DISABLED === POLICY_VERSION;
}

export function parsePublicMediaPath(pathname: unknown) {
  if (!String(pathname).startsWith(PUBLIC_MEDIA_PATH)) return null;
  const parts = String(pathname).slice(PUBLIC_MEDIA_PATH.length).split('/');
  const binding = PUBLIC_MEDIA_BINDINGS[parts.shift() as keyof typeof PUBLIC_MEDIA_BINDINGS];
  if (!binding || !parts.length) return null;
  try {
    const decoded = parts.map((part) => decodeURIComponent(part));
    if (
      decoded.some(
        (part) =>
          !part || part === '.' || part === '..' || part.includes('/') || part.includes('\\') || part.includes('\0')
      )
    )
      return null;
    const key = decoded.join('/');
    return key.length <= 1024 ? { binding, key } : null;
  } catch {
    return null;
  }
}
