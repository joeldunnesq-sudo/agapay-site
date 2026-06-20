export const subscriptionTiers = [
  {
    id: "mission",
    label: "Mission",
    monthlyCents: 4900,
    transactionRateLabel: "5% + $0.30 per transaction",
    stripePriceEnv: "AGAPAY_STRIPE_PRICE_MISSION_MONTHLY",
    description: "Monthly AGAPAY platform subscription for missions."
  },
  {
    id: "parish",
    label: "Parish",
    monthlyCents: 9900,
    transactionRateLabel: "5% + $0.30 per transaction",
    stripePriceEnv: "AGAPAY_STRIPE_PRICE_PARISH_MONTHLY",
    description: "Monthly AGAPAY platform subscription for established parishes."
  },
  {
    id: "diocese",
    label: "Cathedral / Diocese",
    monthlyCents: null,
    transactionRateLabel: "Negotiated transaction rate",
    stripePriceEnv: "AGAPAY_STRIPE_PRICE_DIOCESE_MONTHLY",
    description: "Custom AGAPAY pricing for cathedrals, dioceses, and multi-parish organizations."
  },
  {
    id: "monastery_free",
    label: "Monastery / Skete",
    monthlyCents: 0,
    transactionRateLabel: "5% + $0.30 per transaction",
    stripePriceEnv: "",
    description: "AGAPAY transaction pricing for Orthodox monasteries and sketes."
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
