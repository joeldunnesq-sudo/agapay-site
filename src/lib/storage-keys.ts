import { normalizeEmail } from './format.js';

export function donorKey(email: unknown): string {
  return `${DONOR_KEY_PREFIX}${normalizeEmail(email)}`;
}

export const ADMIN_PASSWORD_KV_KEY = '__agapay_admin_password';
export const ADMIN_SESSION_STORE_KEY = '__agapay_admin_sessions';
export const COMMEMORATION_KEY_PREFIX = '__agapay_commemoration__';
export const DONOR_KEY_PREFIX = '__agapay_donor__';
export const DONOR_OFFERING_KEY_PREFIX = '__agapay_donor_offering__';
export const DONOR_CHECKOUT_INDEX_PREFIX = '__agapay_checkout_offering__';
export const RATE_LIMIT_PREFIX = '__agapay_rate_limit__';
export const STRIPE_EVENT_PREFIX = '__agapay_stripe_event__';
export const PARISH_ID_INDEX_PREFIX = '__agapay_index_parish_id__';
export const STRIPE_ACCOUNT_INDEX_PREFIX = '__agapay_index_stripe_account__';
export const STRIPE_SUBSCRIPTION_INDEX_PREFIX = '__agapay_index_stripe_subscription__';
export const STRIPE_PAYMENT_INTENT_INDEX_PREFIX = '__agapay_index_payment_intent__';

export function isSystemKvKey(keyName: unknown): boolean {
  const key = String(keyName || '');
  return (
    key === ADMIN_PASSWORD_KV_KEY ||
    key === ADMIN_SESSION_STORE_KEY ||
    key.startsWith(COMMEMORATION_KEY_PREFIX) ||
    key.startsWith(DONOR_KEY_PREFIX) ||
    key.startsWith(DONOR_OFFERING_KEY_PREFIX) ||
    key.startsWith(DONOR_CHECKOUT_INDEX_PREFIX) ||
    key.startsWith(RATE_LIMIT_PREFIX) ||
    key.startsWith(STRIPE_EVENT_PREFIX) ||
    key.startsWith(PARISH_ID_INDEX_PREFIX) ||
    key.startsWith(STRIPE_ACCOUNT_INDEX_PREFIX) ||
    key.startsWith(STRIPE_SUBSCRIPTION_INDEX_PREFIX) ||
    key.startsWith(STRIPE_PAYMENT_INTENT_INDEX_PREFIX)
  );
}

export function parishIdIndexKey(parishId: unknown): string {
  return `${PARISH_ID_INDEX_PREFIX}${parishId}`;
}
