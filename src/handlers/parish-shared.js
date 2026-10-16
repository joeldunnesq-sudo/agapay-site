// Generated from src/handlers/parish-shared.ts by npm run build:server. Do not edit.
import '../portability/closure.js';
import './parish-commemorations.js';
import '../lib/core.js';
import '../lib/mfa.js';
import '../lib/stewardship-funds.js';
import './parish-donor-offerings.js';
import './parish-giving-read-models.js';
import './parish-checkout.js';
import { parishDashboardPayload } from './parish-dashboard-handler.js';
import '../lib/entitlements.js';
import '../lib/subscriptions.js';
import '../lib/format.js';
import '../lib/audit-log.js';
import '../lib/registration-intake.js';
import '../lib/payment-fees.js';
import { loadParishPricingUsage } from '../lib/parish-pricing-usage.js';
import '../lib/stripe-fees.js';
import '../lib/stripe-connect.js';
import '../lib/parish-notifications.js';
import './parish.js';
import './parish-authentication.js';
import './parish-registration-storage.js';
const BOOKSTORE_CATEGORIES = /* @__PURE__ */ new Set([
  'book',
  'prayer_rope',
  'icon',
  'candle',
  'jewelry',
  'incense',
  'cd_dvd',
  'other',
]);
function d1(env) {
  return env.AGAPAY_DB || env.DB || null;
}
async function parishDashboardPayloadWithPricingUsage(env, parishId, registration) {
  return {
    ...parishDashboardPayload(parishId, registration),
    parishPricingUsage: await loadParishPricingUsage(env, parishId, registration),
  };
}
function isCommunitySketchImage(value) {
  return [
    '/images/giving/monastery-square.png',
    '/images/giving/mission-church-square.png',
    '/images/giving/parish-church-square.png',
  ].includes(String(value || '').trim());
}
export { BOOKSTORE_CATEGORIES, d1, isCommunitySketchImage, parishDashboardPayloadWithPricingUsage };
