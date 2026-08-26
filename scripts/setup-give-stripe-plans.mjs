// Idempotently creates the shared AGAPAY Give Stripe Product, the published
// early-adopter and standard monthly Prices, and a Customer Portal
// configuration for billing details and cancellation. Plan/band changes stay
// inside AGAPAY so a parish cannot select a smaller household band in Stripe.
//
// Run with STRIPE_SECRET_KEY in the local environment:
//   node scripts/setup-give-stripe-plans.mjs
//
// The script never prints the Stripe secret. It prints the resulting IDs so
// they can be stored as Worker secrets.
const secret = process.env.STRIPE_SECRET_KEY;
if (!secret) throw new Error("STRIPE_SECRET_KEY is required.");

const apiBase = "https://api.stripe.com/v1";
async function stripe(path, { method = "GET", form } = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {})
    },
    body: form
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || `Stripe request failed (${response.status}).`);
  return body;
}

function form(entries) {
  const values = new URLSearchParams();
  for (const [key, value] of entries) values.append(key, String(value));
  return values;
}

const productSearch = await stripe("/products/search?query=" + encodeURIComponent("metadata['agapay_product_key']:'give_platform'"));
let product = productSearch.data?.[0];
if (!product) {
  product = await stripe("/products", {
    method: "POST",
    form: form([
      ["name", "AGAPAY Give"],
      ["description", "Orthodox giving, stewardship, and parish operations platform."],
      ["metadata[agapay_product_key]", "give_platform"]
    ])
  });
}

const plans = [
  { key: "starter", tier: "starter", label: "Give", cents: 900, env: "AGAPAY_STRIPE_PRICE_STARTER_MONTHLY" },
  { key: "giving", tier: "giving", label: "Give +", cents: 7900, env: "AGAPAY_STRIPE_PRICE_GIVING_79_MONTHLY" },
  { key: "parish_early_under_50", tier: "parish", band: "under_50", label: "Parish early adopter · under 50 households", cents: 14900, env: "AGAPAY_STRIPE_PRICE_PARISH_149_MONTHLY" },
  { key: "parish_early_50_149", tier: "parish", band: "50_149", label: "Parish early adopter · 50–149 households", cents: 19900, env: "AGAPAY_STRIPE_PRICE_PARISH_199_MONTHLY" },
  { key: "parish_early_150_299", tier: "parish", band: "150_299", label: "Parish early adopter · 150–299 households", cents: 24900, env: "AGAPAY_STRIPE_PRICE_PARISH_249_EARLY_MONTHLY" },
  { key: "parish_early_300_599", tier: "parish", band: "300_599", label: "Parish early adopter · 300–599 households", cents: 34900, env: "AGAPAY_STRIPE_PRICE_PARISH_349_EARLY_MONTHLY" },
  { key: "parish_standard_under_50", tier: "parish", band: "under_50", label: "Parish standard · under 50 households", cents: 24900, env: "AGAPAY_STRIPE_PRICE_PARISH_249_MONTHLY" },
  { key: "parish_standard_50_149", tier: "parish", band: "50_149", label: "Parish standard · 50–149 households", cents: 34900, env: "AGAPAY_STRIPE_PRICE_PARISH_349_MONTHLY" },
  { key: "parish_standard_150_299", tier: "parish", band: "150_299", label: "Parish standard · 150–299 households", cents: 44900, env: "AGAPAY_STRIPE_PRICE_PARISH_449_MONTHLY" },
  { key: "parish_standard_300_599", tier: "parish", band: "300_599", label: "Parish standard · 300–599 households", cents: 54900, env: "AGAPAY_STRIPE_PRICE_PARISH_549_MONTHLY" },
  { key: "addon_koinonia", tier: "giving", addOn: "koinonia", label: "Koinonia add-on", cents: 2900, env: "AGAPAY_STRIPE_PRICE_ADDON_KOINONIA_29_MONTHLY" },
  { key: "addon_sacraments", tier: "giving", addOn: "sacraments", label: "Sacraments & Services add-on", cents: 1900, env: "AGAPAY_STRIPE_PRICE_ADDON_SACRAMENTS_19_MONTHLY" },
  { key: "addon_bookstore", tier: "giving", addOn: "bookstore", label: "Bookstore add-on", cents: 900, env: "AGAPAY_STRIPE_PRICE_ADDON_BOOKSTORE_9_MONTHLY" },
  { key: "addon_commerce", tier: "giving", addOn: "full_commerce", label: "Full Commerce add-on", cents: 3900, env: "AGAPAY_STRIPE_PRICE_ADDON_COMMERCE_39_MONTHLY" },
  { key: "addon_accounting", tier: "giving", addOn: "accounting", label: "Accounting add-on", cents: 17900, env: "AGAPAY_STRIPE_PRICE_ADDON_ACCOUNTING_179_MONTHLY" }
];

const prices = {};
for (const plan of plans) {
  // Stripe Price amounts are immutable, so amount-versioned lookup keys let a
  // revised catalog coexist with archived or otherwise unused older prices.
  const lookupKey = `agapay_give_${plan.key}_${plan.cents}_monthly`;
  const existing = await stripe(`/prices?product=${encodeURIComponent(product.id)}&active=true&limit=100`);
  let price = existing.data?.find((candidate) =>
    candidate.lookup_key === lookupKey
    && candidate.unit_amount === plan.cents
    && candidate.recurring?.interval === "month"
  );
  if (!price) {
    price = await stripe("/prices", {
      method: "POST",
      form: form([
        ["product", product.id],
        ["currency", "usd"],
        ["unit_amount", plan.cents],
        ["recurring[interval]", "month"],
        ["tax_behavior", "exclusive"],
        ["lookup_key", lookupKey],
        ["nickname", `AGAPAY ${plan.label} — monthly`],
        ["metadata[agapay_subscription_tier]", plan.tier],
        ["metadata[agapay_subscription_add_on]", plan.addOn || ""],
        ["metadata[agapay_household_band]", plan.band || ""],
        ["metadata[agapay_pricing_program]", plan.key.includes("standard") ? "standard" : plan.key.includes("early") ? "founding_20" : "standard"]
      ])
    });
  }
  prices[plan.key] = price.id;
}

const portalConfiguration = await stripe("/billing_portal/configurations", {
  method: "POST",
  form: form([
    ["business_profile[headline]", "Manage your AGAPAY parish subscription."],
    ["business_profile[privacy_policy_url]", "https://agapay.app/privacy"],
    ["business_profile[terms_of_service_url]", "https://agapay.app/terms"],
    ["default_return_url", "https://agapay.app/parish/dashboard"],
    ["features[customer_update][enabled]", "true"],
    ["features[customer_update][allowed_updates][]", "address"],
    ["features[customer_update][allowed_updates][]", "email"],
    ["features[customer_update][allowed_updates][]", "name"],
    ["features[payment_method_update][enabled]", "true"],
    ["features[invoice_history][enabled]", "true"],
    ["features[subscription_cancel][enabled]", "true"],
    ["features[subscription_cancel][mode]", "at_period_end"],
    ["features[subscription_cancel][proration_behavior]", "none"],
    ["features[subscription_update][enabled]", "false"],
    ["metadata[agapay_configuration_key]", "give_self_service_v1"]
  ])
});

console.log(JSON.stringify({
  AGAPAY_STRIPE_PRODUCT_GIVE: product.id,
  ...Object.fromEntries(plans.map((plan) => [plan.env, prices[plan.key]])),
  AGAPAY_STRIPE_BILLING_PORTAL_CONFIGURATION: portalConfiguration.id
}, null, 2));
