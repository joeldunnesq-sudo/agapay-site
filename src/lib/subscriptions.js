// AGAPAY charges no donation fee on any tier -- transactionRateLabel
// reflects Stripe's own standard processing cost only, which AGAPAY does
// not collect or mark up. AGAPAY's revenue is the monthly subscription.
export const subscriptionTiers = [
  {
    id: "mission",
    label: "Mission",
    monthlyCents: 4900,
    transactionRateLabel: "No AGAPAY donation fee (Stripe processing only)",
    stripePriceEnv: "AGAPAY_STRIPE_PRICE_MISSION_MONTHLY",
    description: "Monthly AGAPAY platform subscription for missions."
  },
  {
    id: "parish",
    label: "Parish",
    monthlyCents: 9900,
    transactionRateLabel: "No AGAPAY donation fee (Stripe processing only)",
    stripePriceEnv: "AGAPAY_STRIPE_PRICE_PARISH_MONTHLY",
    description: "Monthly AGAPAY platform subscription for established parishes."
  },
  {
    id: "diocese",
    label: "Cathedral / Diocese",
    monthlyCents: null,
    transactionRateLabel: "No AGAPAY donation fee (Stripe processing only)",
    stripePriceEnv: "AGAPAY_STRIPE_PRICE_DIOCESE_MONTHLY",
    description: "Custom AGAPAY subscription pricing for cathedrals, dioceses, and multi-parish organizations."
  },
  {
    id: "monastery_free",
    label: "Monastery / Skete",
    monthlyCents: 0,
    transactionRateLabel: "No AGAPAY donation fee (Stripe processing only)",
    stripePriceEnv: "",
    description: "No monthly subscription fee for Orthodox monasteries and sketes."
  }
];

export function publicSubscriptionTiers() {
  return subscriptionTiers.map(({ stripePriceEnv, ...tier }) => tier);
}

export function defaultSubscriptionTier(registration = {}) {
  const type = String(registration.communityType || registration.parishType || "").toLowerCase();
  if (type.includes("cathedral") || type.includes("diocese")) return "diocese";
  if (type.includes("monastery") || type.includes("skete")) return "monastery_free";
  if (type.includes("mission")) return "mission";
  return "parish";
}

export function subscriptionTier(registration = {}) {
  const isTierId = typeof registration === "string";
  const selected = String(isTierId ? registration : registration.subscriptionTier || registration.tier || "").trim().toLowerCase();
  return subscriptionTiers.find((tier) => tier.id === selected)
    || (!isTierId ? subscriptionTiers.find((tier) => tier.id === defaultSubscriptionTier(registration)) : null)
    || subscriptionTiers[1];
}

export function subscriptionReady(registration = {}) {
  return Boolean(
    registration.subscriptionId ||
    registration.stripeSubscriptionId ||
    registration.subscriptionStatus === "active" ||
    registration.billingStatus === "active"
  );
}
