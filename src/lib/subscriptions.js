// AGAPAY charges no donation fee on any tier -- transactionRateLabel
// reflects Stripe's own standard processing cost only, which AGAPAY does
// not collect or mark up. AGAPAY's revenue is the monthly subscription.
//
// modules mirrors src/lib/entitlements.js's TIER_MODULES -- kept as a
// separate, display-only copy here (rather than importing entitlements.js)
// so this file has no dependency on registration-shaped input; it only
// describes what each tier includes, not whether any particular parish
// currently has access (that's what entitlementsSummary() is for).
export const subscriptionTiers = [
  {
    id: "starter",
    label: "Starter",
    monthlyCents: 900,
    transactionRateLabel: "No AGAPAY donation fee (Stripe processing only)",
    stripePriceEnv: "AGAPAY_STRIPE_PRICE_STARTER_MONTHLY",
    description: "Simple online and recurring giving for Orthodox churches.",
    modules: { givingPlus: false, stewardshipHealth: false, sacraments: false, directory: false, bookstore: false, textToGive: false, accounting: false, accountingTier: "unavailable" }
  },
  {
    id: "giving",
    label: "Giving Plus",
    monthlyCents: 4900,
    transactionRateLabel: "No AGAPAY donation fee (Stripe processing only)",
    stripePriceEnv: "AGAPAY_STRIPE_PRICE_GIVING_MONTHLY",
    description: "Essential online giving tools for Orthodox churches.",
    modules: { givingPlus: true, stewardshipHealth: false, sacraments: false, directory: false, bookstore: false, textToGive: false, accounting: false, accountingTier: "unavailable" }
  },
  {
    id: "stewardship",
    label: "Stewardship",
    monthlyCents: 9900,
    transactionRateLabel: "No AGAPAY donation fee (Stripe processing only)",
    stripePriceEnv: "AGAPAY_STRIPE_PRICE_STEWARDSHIP_MONTHLY",
    description: "Giving plus pledge, donor, and Stewardship Health tools.",
    modules: { givingPlus: true, stewardshipHealth: true, sacraments: false, directory: false, bookstore: true, textToGive: false, accounting: false, accountingTier: "unavailable" }
  },
  {
    id: "parish",
    label: "Parish",
    monthlyCents: 14900,
    transactionRateLabel: "No AGAPAY donation fee (Stripe processing only)",
    // Version the binding when the published price changes so an older
    // Cloudflare secret can never silently charge the previous $199 rate.
    stripePriceEnv: "AGAPAY_STRIPE_PRICE_PARISH_149_MONTHLY",
    description: "Monthly AGAPAY platform subscription for established parishes.",
    modules: { givingPlus: true, stewardshipHealth: true, sacraments: true, directory: true, bookstore: true, textToGive: true, accounting: true, accountingTier: "advanced_operations" }
  },
  {
    id: "diocese",
    label: "Cathedral / Diocese",
    monthlyCents: null,
    transactionRateLabel: "No AGAPAY donation fee (Stripe processing only)",
    stripePriceEnv: "AGAPAY_STRIPE_PRICE_DIOCESE_MONTHLY",
    description: "Custom AGAPAY subscription pricing for cathedrals, dioceses, and multi-parish organizations.",
    modules: { givingPlus: true, stewardshipHealth: true, sacraments: true, directory: true, bookstore: true, textToGive: true, accounting: true, accountingTier: "advanced_operations" }
  },
  {
    id: "monastery_free",
    label: "Monastery / Skete",
    monthlyCents: 0,
    transactionRateLabel: "No AGAPAY donation fee (Stripe processing only)",
    stripePriceEnv: "",
    description: "No monthly subscription fee for Orthodox monasteries and sketes.",
    modules: { givingPlus: true, stewardshipHealth: false, sacraments: false, directory: false, bookstore: false, textToGive: false, accounting: false, accountingTier: "unavailable" }
  }
];

export function publicSubscriptionTiers() {
  return subscriptionTiers.map(({ stripePriceEnv, ...tier }) => tier);
}

export function subscriptionTierFromStripePriceId(env = {}, priceId = "") {
  const matched = subscriptionTiers.find((tier) => tier.stripePriceEnv && env[tier.stripePriceEnv] === priceId);
  return matched || null;
}

export function defaultSubscriptionTier(registration = {}) {
  const type = String(registration.communityType || registration.parishType || "").toLowerCase();
  if (type.includes("cathedral") || type.includes("diocese")) return "diocese";
  if (type.includes("monastery") || type.includes("skete")) return "monastery_free";
  if (type.includes("mission")) return "starter";
  return "parish";
}

export function subscriptionTier(registration = {}) {
  const isTierId = typeof registration === "string";
  const rawSelected = String(isTierId ? registration : registration.subscriptionTier || registration.tier || "").trim().toLowerCase();
  // Existing "mission" records become Giving without requiring a data migration.
  const selected = rawSelected === "mission" ? "giving" : rawSelected;
  return subscriptionTiers.find((tier) => tier.id === selected)
    || (!isTierId ? subscriptionTiers.find((tier) => tier.id === defaultSubscriptionTier(registration)) : null)
    || subscriptionTiers.find((tier) => tier.id === "parish");
}

export function subscriptionReady(registration = {}) {
  const explicitStatus = String(registration.subscriptionStatus || registration.billingStatus || "").toLowerCase();
  if (explicitStatus) return ["active", "trialing", "free_forever"].includes(explicitStatus);
  // Backward compatibility for records created before subscription status
  // was stored. Once an explicit status exists, it is authoritative.
  return Boolean(registration.subscriptionId || registration.stripeSubscriptionId);
}
