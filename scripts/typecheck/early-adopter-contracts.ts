import {
  claimEarlyAdopterPricing,
  activateEarlyAdopterPricing,
  releaseEarlyAdopterReservation,
  retireEarlyAdopterPricing,
} from '../../src/lib/early-adopter-pricing.js';
void claimEarlyAdopterPricing({}, 'reference', { subscriptionPricingProgram: 'standard' });
void activateEarlyAdopterPricing({}, null);
void releaseEarlyAdopterReservation({}, undefined);
void retireEarlyAdopterPricing({}, 'reference');
// @ts-expect-error reference is required
void claimEarlyAdopterPricing({});
// @ts-expect-error reference must be text
void claimEarlyAdopterPricing({}, 123);
// @ts-expect-error platform bindings must provide real database methods
void claimEarlyAdopterPricing({ AGAPAY_DB: {} }, 'reference');
// @ts-expect-error lifecycle reference must be text or absent
void retireEarlyAdopterPricing({}, {});
