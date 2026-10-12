// Generated from src/lib/early-adopter-pricing.ts by npm run build:server. Do not edit.
import { d1, d1First, d1Run } from './core.js';
import { loadAllRegistrations } from './registrations.js';
import { EARLY_ADOPTER_LIMIT, EARLY_ADOPTER_PROGRAM_ID } from './subscriptions.js';
const EARLY_ADOPTER_RESERVATION_DAYS = 45;
function activeClaim(registration = {}, cutoff = '') {
  if (registration.earlyAdopterActivatedAt) return true;
  if (registration.subscriptionPricingProgram !== EARLY_ADOPTER_PROGRAM_ID) return false;
  if (String(registration.subscriptionStatus || '').toLowerCase() === 'cancelled') return false;
  if (String(registration.subscriptionStatus || '').toLowerCase() === 'active') return true;
  return Boolean(registration.earlyAdopterReservedAt && registration.earlyAdopterReservedAt >= cutoff);
}
async function claimEarlyAdopterPricing(env, reference, registration = {}) {
  if (registration.subscriptionPricingProgram === 'standard') return { program: 'standard', slot: null };
  const now = /* @__PURE__ */ new Date().toISOString();
  const cutoff = new Date(Date.now() - EARLY_ADOPTER_RESERVATION_DAYS * 864e5).toISOString();
  if (d1(env)) {
    try {
      const existing2 = await d1First(
        env,
        `SELECT slot, status, reserved_at FROM subscription_early_adopter_slots
         WHERE registration_reference = ?1 AND status IN ('reserved', 'active')`,
        reference
      );
      if (existing2 && (existing2.status === 'active' || String(existing2.reserved_at || '') >= cutoff)) {
        return {
          program: EARLY_ADOPTER_PROGRAM_ID,
          slot: Number(existing2.slot),
          reservedAt: existing2.reserved_at || now,
        };
      }
      const claimed2 = await d1First(
        env,
        `UPDATE subscription_early_adopter_slots
         SET registration_reference = ?1, status = 'reserved', reserved_at = ?2, activated_at = NULL, updated_at = ?2
         WHERE slot = (
           SELECT slot FROM subscription_early_adopter_slots
           WHERE status = 'available' OR (status = 'reserved' AND reserved_at < ?3)
           ORDER BY slot LIMIT 1
         )
         RETURNING slot, reserved_at`,
        reference,
        now,
        cutoff
      );
      return claimed2
        ? { program: EARLY_ADOPTER_PROGRAM_ID, slot: Number(claimed2.slot), reservedAt: claimed2.reserved_at || now }
        : { program: 'standard', slot: null };
    } catch {}
  }
  const registrations = await loadAllRegistrations(env, { hardLimit: 25e3 });
  const existing = registrations.find(
    (candidate) => candidate.reference === reference && activeClaim(candidate, cutoff)
  );
  if (existing)
    return {
      program: EARLY_ADOPTER_PROGRAM_ID,
      slot: Number(existing.earlyAdopterSlot || 0) || null,
      reservedAt: existing.earlyAdopterReservedAt || now,
    };
  const claimed = registrations.filter((candidate) => activeClaim(candidate, cutoff));
  if (claimed.length >= EARLY_ADOPTER_LIMIT) return { program: 'standard', slot: null };
  return { program: EARLY_ADOPTER_PROGRAM_ID, slot: claimed.length + 1, reservedAt: now };
}
async function activateEarlyAdopterPricing(env, reference) {
  if (!reference || !d1(env)) return;
  const now = /* @__PURE__ */ new Date().toISOString();
  await d1Run(
    env,
    `UPDATE subscription_early_adopter_slots
     SET status = 'active', activated_at = COALESCE(activated_at, ?2), updated_at = ?2
     WHERE registration_reference = ?1 AND status IN ('reserved', 'active')`,
    reference,
    now
  ).catch(() => {});
}
async function releaseEarlyAdopterReservation(env, reference) {
  if (!reference || !d1(env)) return;
  const now = /* @__PURE__ */ new Date().toISOString();
  await d1Run(
    env,
    `UPDATE subscription_early_adopter_slots
     SET registration_reference = NULL, status = 'available', reserved_at = NULL, activated_at = NULL, updated_at = ?2
     WHERE registration_reference = ?1 AND status = 'reserved'`,
    reference,
    now
  ).catch(() => {});
}
async function retireEarlyAdopterPricing(env, reference) {
  if (!reference || !d1(env)) return;
  const now = /* @__PURE__ */ new Date().toISOString();
  await d1Run(
    env,
    `UPDATE subscription_early_adopter_slots
     SET status = 'retired', updated_at = ?2
     WHERE registration_reference = ?1 AND status = 'active'`,
    reference,
    now
  ).catch(() => {});
}
export {
  EARLY_ADOPTER_RESERVATION_DAYS,
  activateEarlyAdopterPricing,
  claimEarlyAdopterPricing,
  releaseEarlyAdopterReservation,
  retireEarlyAdopterPricing,
};
