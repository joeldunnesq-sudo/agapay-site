// AGAPAY charges no donation fee on any tier -- transactionRateLabel
// reflects Stripe's own standard processing cost only, which AGAPAY does
// not collect or mark up. AGAPAY's revenue is the monthly subscription.
//
// modules mirrors src/lib/entitlements.js's TIER_MODULES -- kept as a
// separate, display-only copy here (rather than importing entitlements.js)
// so this file has no dependency on registration-shaped input; it only
// describes what each tier includes, not whether any particular parish
// currently has access (that's what entitlementsSummary() is for).
export const EARLY_ADOPTER_LIMIT = 20;
export const EARLY_ADOPTER_PROGRAM_ID = "founding_20";

export const parishHouseholdBands = Object.freeze([
  { id: "under_50", label: "Fewer than 50 households", minHouseholds: 0, maxHouseholds: 49, earlyAdopterMonthlyCents: 14900, standardMonthlyCents: 24900, earlyStripePriceEnv: "AGAPAY_STRIPE_PRICE_PARISH_149_MONTHLY", standardStripePriceEnv: "AGAPAY_STRIPE_PRICE_PARISH_249_MONTHLY" },
  { id: "50_149", label: "50–149 households", minHouseholds: 50, maxHouseholds: 149, earlyAdopterMonthlyCents: 19900, standardMonthlyCents: 34900, earlyStripePriceEnv: "AGAPAY_STRIPE_PRICE_PARISH_199_MONTHLY", standardStripePriceEnv: "AGAPAY_STRIPE_PRICE_PARISH_349_MONTHLY" },
  { id: "150_299", label: "150–299 households", minHouseholds: 150, maxHouseholds: 299, earlyAdopterMonthlyCents: 24900, standardMonthlyCents: 44900, earlyStripePriceEnv: "AGAPAY_STRIPE_PRICE_PARISH_249_EARLY_MONTHLY", standardStripePriceEnv: "AGAPAY_STRIPE_PRICE_PARISH_449_MONTHLY" },
  { id: "300_599", label: "300–599 households", minHouseholds: 300, maxHouseholds: 599, earlyAdopterMonthlyCents: 34900, standardMonthlyCents: 54900, earlyStripePriceEnv: "AGAPAY_STRIPE_PRICE_PARISH_349_EARLY_MONTHLY", standardStripePriceEnv: "AGAPAY_STRIPE_PRICE_PARISH_549_MONTHLY" },
  { id: "600_plus", label: "600+ households", minHouseholds: 600, maxHouseholds: null, earlyAdopterMonthlyCents: null, standardMonthlyCents: null, earlyStripePriceEnv: "", standardStripePriceEnv: "" }
]);

export const subscriptionAddOns = Object.freeze([
  { id: "koinonia", label: "Koinonia", description: "Parish life, communications, ministries, prayer requests, signups, and Exchange.", earlyAdopterMonthlyCents: 2900, standardMonthlyCents: 2900, earlyStripePriceEnv: "AGAPAY_STRIPE_PRICE_ADDON_KOINONIA_29_MONTHLY", standardStripePriceEnv: "AGAPAY_STRIPE_PRICE_ADDON_KOINONIA_29_MONTHLY", modules: ["communications"] },
  { id: "sacraments", label: "Sacraments & Services", description: "Parishioner requests, scheduling, priest workflows, and calendar connections.", earlyAdopterMonthlyCents: 1900, standardMonthlyCents: 1900, earlyStripePriceEnv: "AGAPAY_STRIPE_PRICE_ADDON_SACRAMENTS_19_MONTHLY", standardStripePriceEnv: "AGAPAY_STRIPE_PRICE_ADDON_SACRAMENTS_19_MONTHLY", modules: ["sacraments"] },
  { id: "bookstore", label: "Bookstore", description: "A focused parish storefront for books, icons, candles, and parish goods.", earlyAdopterMonthlyCents: 900, standardMonthlyCents: 900, earlyStripePriceEnv: "AGAPAY_STRIPE_PRICE_ADDON_BOOKSTORE_9_MONTHLY", standardStripePriceEnv: "AGAPAY_STRIPE_PRICE_ADDON_BOOKSTORE_9_MONTHLY", modules: ["bookstore"] },
  { id: "full_commerce", label: "Full Commerce", description: "Bookstore, events, meals, orders, tax, and connected accounting workflows.", earlyAdopterMonthlyCents: 3900, standardMonthlyCents: 3900, earlyStripePriceEnv: "AGAPAY_STRIPE_PRICE_ADDON_COMMERCE_39_MONTHLY", standardStripePriceEnv: "AGAPAY_STRIPE_PRICE_ADDON_COMMERCE_39_MONTHLY", modules: ["bookstore", "commerceSuite"] },
  { id: "accounting", label: "Accounting", description: "Full Commerce and Bookstore, plus fund accounting, reconciliation, reporting, statements, and operational accounting tools.", earlyAdopterMonthlyCents: 17900, standardMonthlyCents: 17900, earlyStripePriceEnv: "AGAPAY_STRIPE_PRICE_ADDON_ACCOUNTING_179_MONTHLY", standardStripePriceEnv: "AGAPAY_STRIPE_PRICE_ADDON_ACCOUNTING_179_MONTHLY", modules: ["bookstore", "commerceSuite", "accounting", "accountingAdvancedOperations"] }
]);

export function normalizeSubscriptionAddOns(value = [], tierId = "giving") {
  if (String(tierId || "").toLowerCase() !== "giving") return [];
  let entries = value;
  if (typeof entries === "string") {
    try { entries = JSON.parse(entries); }
    catch { entries = entries.split(","); }
  }
  const allowed = new Set(subscriptionAddOns.map((addOn) => addOn.id));
  const selected = [...new Set((Array.isArray(entries) ? entries : []).map((entry) => String(entry || "").trim().toLowerCase()).filter((entry) => allowed.has(entry)))];
  if (selected.includes("accounting")) return selected.filter((entry) => entry !== "bookstore" && entry !== "full_commerce");
  return selected.includes("full_commerce") ? selected.filter((entry) => entry !== "bookstore") : selected;
}

export function subscriptionAddOnsFor(registration = {}) {
  const tierId = typeof registration === "string" ? registration : registration.subscriptionTier || registration.tier;
  return normalizeSubscriptionAddOns(typeof registration === "object" ? registration.subscriptionAddOns : [], tierId);
}

export function subscriptionAddOnPricing(addOn, pricingProgram = "founding_20") {
  const definition = typeof addOn === "string" ? subscriptionAddOns.find((candidate) => candidate.id === addOn) : addOn;
  if (!definition) return null;
  const standard = String(pricingProgram || "").toLowerCase() === "standard";
  return {
    ...definition,
    pricingProgram: standard ? "standard" : "early_adopter",
    monthlyCents: standard ? definition.standardMonthlyCents : definition.earlyAdopterMonthlyCents,
    stripePriceEnv: standard ? definition.standardStripePriceEnv : definition.earlyStripePriceEnv
  };
}

export function publicSubscriptionAddOns() {
  return subscriptionAddOns.map(({ earlyStripePriceEnv, standardStripePriceEnv, ...addOn }) => addOn);
}

export function normalizeParishHouseholdBand(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const aliases = { under50: "under_50", fewer_than_50: "under_50", "50_149_households": "50_149", "150_299_households": "150_299", "300_599_households": "300_599", "600_households": "600_plus" };
  const id = aliases[normalized] || normalized;
  return parishHouseholdBands.some((band) => band.id === id) ? id : "";
}

export function parishHouseholdPricing(registration = {}) {
  const bandId = normalizeParishHouseholdBand(registration.parishHouseholdBand || registration.householdBand) || "under_50";
  const band = parishHouseholdBands.find((candidate) => candidate.id === bandId) || parishHouseholdBands[0];
  const pricingProgram = String(registration.subscriptionPricingProgram || "").toLowerCase() === "standard" ? "standard" : "early_adopter";
  const monthlyCents = pricingProgram === "standard" ? band.standardMonthlyCents : band.earlyAdopterMonthlyCents;
  const stripePriceEnv = pricingProgram === "standard" ? band.standardStripePriceEnv : band.earlyStripePriceEnv;
  return { ...band, pricingProgram, monthlyCents, stripePriceEnv };
}

export function parishHouseholdBandForCount(value = 0) {
  const count = Math.max(0, Math.trunc(Number(value) || 0));
  return parishHouseholdBands.find((band) => band.maxHouseholds === null || count <= band.maxHouseholds)
    || parishHouseholdBands[parishHouseholdBands.length - 1];
}

export function parishPricingUsageStatus(registration = {}, representedHouseholds = 0, linkedUsers = 0) {
  const householdCount = Math.max(0, Math.trunc(Number(representedHouseholds) || 0));
  const userCount = Math.max(0, Math.trunc(Number(linkedUsers) || 0));
  const selectedBandId = normalizeParishHouseholdBand(registration.parishHouseholdBand || registration.householdBand);
  const selectedBandIndex = parishHouseholdBands.findIndex((band) => band.id === selectedBandId);
  const selectedBand = selectedBandIndex >= 0 ? parishHouseholdBands[selectedBandIndex] : null;
  const recommendedBand = parishHouseholdBandForCount(householdCount);
  const recommendedBandIndex = parishHouseholdBands.findIndex((band) => band.id === recommendedBand.id);
  const nextBand = selectedBandIndex >= 0 ? parishHouseholdBands[selectedBandIndex + 1] || null : parishHouseholdBands[0];
  const nextThreshold = nextBand?.minHouseholds ?? null;
  const remainingUntilNextBand = nextThreshold === null ? null : Math.max(0, nextThreshold - householdCount);
  return {
    linkedUsers: userCount,
    representedHouseholds: householdCount,
    selectedBandId,
    selectedBandLabel: selectedBand?.label || "",
    recommendedBandId: recommendedBand.id,
    recommendedBandLabel: recommendedBand.label,
    nextBandId: nextBand?.id || "",
    nextBandLabel: nextBand?.label || "",
    nextThreshold,
    remainingUntilNextBand,
    needsBandSelection: !selectedBand,
    upgradeRequired: selectedBandIndex >= 0 && recommendedBandIndex > selectedBandIndex
  };
}

export const subscriptionTiers = [
  {
    id: "starter",
    label: "Starter",
    monthlyCents: 900,
    standardMonthlyCents: 900,
    transactionRateLabel: "No AGAPAY donation fee (Stripe processing only)",
    stripePriceEnv: "AGAPAY_STRIPE_PRICE_STARTER_MONTHLY",
    description: "Mission-ready recurring giving, commemorations, General Operating, one designated fund, and candles.",
    modules: { givingPlus: false, stewardshipHealth: false, sacraments: false, directory: false, bookstore: false, commerceSuite: false, textToGive: false, accounting: false, accountingTier: "unavailable" }
  },
  {
    id: "giving",
    label: "Giving Plus",
    monthlyCents: 7900,
    standardMonthlyCents: 7900,
    transactionRateLabel: "No AGAPAY donation fee (Stripe processing only)",
    stripePriceEnv: "AGAPAY_STRIPE_PRICE_GIVING_79_MONTHLY",
    standardStripePriceEnv: "AGAPAY_STRIPE_PRICE_GIVING_79_MONTHLY",
    description: "Giving, pledges, Stewardship Health, and the Parish Directory in one connected foundation.",
    modules: { givingPlus: true, stewardshipHealth: true, sacraments: false, directory: true, bookstore: false, commerceSuite: false, textToGive: false, accounting: false, accountingTier: "unavailable" }
  },
  {
    id: "parish",
    label: "Parish",
    monthlyCents: 14900,
    standardMonthlyCents: 24900,
    earlyAdopterMonthlyCents: 14900,
    transactionRateLabel: "No AGAPAY donation fee (Stripe processing only)",
    // Version the binding when the published price changes so an older
    // Cloudflare secret can never silently charge the previous $199 rate.
    stripePriceEnv: "AGAPAY_STRIPE_PRICE_PARISH_149_MONTHLY",
    description: "Monthly AGAPAY platform subscription for established parishes.",
    modules: { givingPlus: true, stewardshipHealth: true, sacraments: true, directory: true, bookstore: true, commerceSuite: true, textToGive: true, accounting: true, accountingTier: "advanced_operations" }
  },
  {
    id: "diocese",
    label: "Cathedral / Diocese",
    monthlyCents: null,
    transactionRateLabel: "No AGAPAY donation fee (Stripe processing only)",
    stripePriceEnv: "AGAPAY_STRIPE_PRICE_DIOCESE_MONTHLY",
    description: "Custom AGAPAY subscription pricing for cathedrals, dioceses, and multi-parish organizations.",
    modules: { givingPlus: true, stewardshipHealth: true, sacraments: true, directory: true, bookstore: true, commerceSuite: true, textToGive: true, accounting: true, accountingTier: "advanced_operations" }
  },
  {
    id: "monastery_free",
    label: "Monastery / Skete",
    monthlyCents: 0,
    transactionRateLabel: "No AGAPAY donation fee (Stripe processing only)",
    stripePriceEnv: "",
    description: "No monthly subscription fee for Orthodox monasteries and sketes.",
    modules: { givingPlus: true, stewardshipHealth: false, sacraments: false, directory: false, bookstore: false, commerceSuite: false, textToGive: false, accounting: false, accountingTier: "unavailable" }
  }
];

export const PARISH_INTRO_DEMO_DAYS = 30;

// The public offer is available once to each verified canonical community.
// Pending or abandoned Checkout Sessions do not consume it; activation is
// recorded only after Stripe creates the subscription.
export function parishIntroDemoEligible(registration = {}) {
  return !registration.stripeSubscriptionId
    && !registration.subscriptionActivatedAt
    && !registration.subscriptionTrialStartedAt
    && !registration.subscriptionTrialEndsAt
    && !registration.subscriptionIntroDemoRedeemedAt;
}

export function publicSubscriptionTiers() {
  return subscriptionTiers.map(({ stripePriceEnv, standardStripePriceEnv, ...tier }) => tier.id === "parish"
    ? { ...tier, householdPriced: true, householdBands: parishHouseholdBands.map(({ earlyStripePriceEnv, standardStripePriceEnv, ...band }) => band) }
    : tier);
}

export function subscriptionTierFromStripePriceId(env = {}, priceId = "") {
  const matched = subscriptionTiers.find((tier) => tier.id !== "parish" && tier.stripePriceEnv && env[tier.stripePriceEnv] === priceId);
  if (matched) return matched;
  const standardMatched = subscriptionTiers.find((tier) => tier.id !== "parish" && tier.standardStripePriceEnv && env[tier.standardStripePriceEnv] === priceId);
  if (standardMatched) return { ...standardMatched, monthlyCents: standardMatched.standardMonthlyCents, stripePriceEnv: standardMatched.standardStripePriceEnv, pricingProgram: "standard" };
  for (const band of parishHouseholdBands) {
    if (band.earlyStripePriceEnv && env[band.earlyStripePriceEnv] === priceId) {
      const parish = subscriptionTiers.find((tier) => tier.id === "parish");
      return { ...parish, ...band, id: parish.id, monthlyCents: band.earlyAdopterMonthlyCents, stripePriceEnv: band.earlyStripePriceEnv, pricingProgram: "early_adopter", parishHouseholdBand: band.id };
    }
    if (band.standardStripePriceEnv && env[band.standardStripePriceEnv] === priceId) {
      const parish = subscriptionTiers.find((tier) => tier.id === "parish");
      return { ...parish, ...band, id: parish.id, monthlyCents: band.standardMonthlyCents, stripePriceEnv: band.standardStripePriceEnv, pricingProgram: "standard", parishHouseholdBand: band.id };
    }
  }
  return null;
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
  const selected = rawSelected === "mission" ? "starter" : rawSelected;
  const matched = subscriptionTiers.find((tier) => tier.id === selected)
    || (!isTierId ? subscriptionTiers.find((tier) => tier.id === defaultSubscriptionTier(registration)) : null)
    || subscriptionTiers.find((tier) => tier.id === "parish");
  if (matched?.id !== "parish") {
    if (!isTierId && String(registration.subscriptionPricingProgram || "").toLowerCase() === "standard" && Number.isFinite(matched?.standardMonthlyCents)) {
      return { ...matched, monthlyCents: matched.standardMonthlyCents, stripePriceEnv: matched.standardStripePriceEnv || "", pricingProgram: "standard" };
    }
    return { ...matched, pricingProgram: matched?.earlyAdopterMonthlyCents ? "early_adopter" : "standard" };
  }
  const pricing = parishHouseholdPricing(isTierId ? {} : registration);
  return { ...matched, ...pricing, id: matched.id, parishHouseholdBand: pricing.id };
}

export function subscriptionReady(registration = {}) {
  const explicitStatus = String(registration.subscriptionStatus || registration.billingStatus || "").toLowerCase();
  if (explicitStatus) return ["active", "trialing", "free_forever"].includes(explicitStatus);
  // Backward compatibility for records created before subscription status
  // was stored. Once an explicit status exists, it is authoritative.
  return Boolean(registration.subscriptionId || registration.stripeSubscriptionId);
}
