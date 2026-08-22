import { d1, d1First } from "./core.js";
import { normalizeParishHouseholdBand, parishPricingUsageStatus } from "./subscriptions.js";

export async function loadParishPricingUsage(env, parishId, registration = {}) {
  if (!d1(env)) return { ...parishPricingUsageStatus(registration, 0, 0), trackingAvailable: false };
  try {
    const row = await d1First(
      env,
      `SELECT
         COUNT(DISTINCT links.external_id) AS linked_users,
         COUNT(DISTINCT COALESCE(households.id, 'person:' || people.id)) AS represented_households
       FROM directory_parish_affiliations affiliations
       JOIN directory_people people
         ON people.id = affiliations.person_id AND people.active = 1
       JOIN directory_person_links links
         ON links.person_id = people.id AND links.link_type = 'platform_user' AND links.active = 1
       LEFT JOIN directory_household_members members
         ON members.person_id = people.id AND members.active = 1
       LEFT JOIN directory_households households
         ON households.id = members.household_id AND households.parish_id = ?1 AND households.active = 1
       WHERE affiliations.parish_id = ?1
         AND affiliations.active = 1
         AND affiliations.status != 'former_member'`,
      parishId
    );
    return {
      ...parishPricingUsageStatus(registration, row?.represented_households, row?.linked_users),
      trackingAvailable: true
    };
  } catch {
    return { ...parishPricingUsageStatus(registration, 0, 0), trackingAvailable: false };
  }
}

export async function validateParishCheckoutBand(env, parishId, registration, body = {}) {
  if (String(body.subscriptionTier || registration.subscriptionTier || "").toLowerCase() !== "parish") return null;
  const parishHouseholdBand = normalizeParishHouseholdBand(body.parishHouseholdBand ?? registration.parishHouseholdBand);
  const usage = await loadParishPricingUsage(env, parishId, { ...registration, parishHouseholdBand });
  return usage.trackingAvailable && usage.upgradeRequired ? usage : null;
}
