// Generated from src/lib/storage-keys.ts by npm run build:server. Do not edit.
import { normalizeEmail } from './format.js';
function donorKey(email) {
  return `${DONOR_KEY_PREFIX}${normalizeEmail(email)}`;
}
const ADMIN_PASSWORD_KV_KEY = '__agapay_admin_password';
const ADMIN_SESSION_STORE_KEY = '__agapay_admin_sessions';
const COMMEMORATION_KEY_PREFIX = '__agapay_commemoration__';
const DONOR_KEY_PREFIX = '__agapay_donor__';
const DONOR_OFFERING_KEY_PREFIX = '__agapay_donor_offering__';
const DONOR_CHECKOUT_INDEX_PREFIX = '__agapay_checkout_offering__';
const RATE_LIMIT_PREFIX = '__agapay_rate_limit__';
const STRIPE_EVENT_PREFIX = '__agapay_stripe_event__';
const PARISH_ID_INDEX_PREFIX = '__agapay_index_parish_id__';
const STRIPE_ACCOUNT_INDEX_PREFIX = '__agapay_index_stripe_account__';
const STRIPE_SUBSCRIPTION_INDEX_PREFIX = '__agapay_index_stripe_subscription__';
const STRIPE_PAYMENT_INTENT_INDEX_PREFIX = '__agapay_index_payment_intent__';
function isSystemKvKey(keyName) {
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
function parishIdIndexKey(parishId) {
  return `${PARISH_ID_INDEX_PREFIX}${parishId}`;
}
export {
  ADMIN_PASSWORD_KV_KEY,
  ADMIN_SESSION_STORE_KEY,
  COMMEMORATION_KEY_PREFIX,
  DONOR_CHECKOUT_INDEX_PREFIX,
  DONOR_KEY_PREFIX,
  DONOR_OFFERING_KEY_PREFIX,
  PARISH_ID_INDEX_PREFIX,
  RATE_LIMIT_PREFIX,
  STRIPE_ACCOUNT_INDEX_PREFIX,
  STRIPE_EVENT_PREFIX,
  STRIPE_PAYMENT_INTENT_INDEX_PREFIX,
  STRIPE_SUBSCRIPTION_INDEX_PREFIX,
  donorKey,
  isSystemKvKey,
  parishIdIndexKey,
};
