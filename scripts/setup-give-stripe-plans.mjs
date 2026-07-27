// Idempotently creates the shared AGAPAY Give Stripe Product, its three
// monthly Prices, and a Customer Portal configuration that permits plan
// changes and end-of-period cancellation.
//
// Run with STRIPE_SECRET_KEY in the local environment:
//   node scripts/setup-give-stripe-plans.mjs
//
// The script never prints the Stripe secret. It prints the four resulting
// IDs so they can be stored as Worker secrets.
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
  { key: "starter", label: "Starter", cents: 900 },
  { key: "giving", label: "Giving Plus", cents: 4900 },
  { key: "stewardship", label: "Stewardship", cents: 9900 },
  { key: "parish", label: "Parish", cents: 19900 }
];

const prices = {};
for (const plan of plans) {
  const existing = await stripe(`/prices?product=${encodeURIComponent(product.id)}&active=true&limit=100`);
  let price = existing.data?.find((candidate) =>
    candidate.lookup_key === `agapay_give_${plan.key}_monthly`
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
        ["lookup_key", `agapay_give_${plan.key}_monthly`],
        ["nickname", `AGAPAY ${plan.label} — monthly`],
        ["metadata[agapay_subscription_tier]", plan.key]
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
    ["features[subscription_update][enabled]", "true"],
    ["features[subscription_update][default_allowed_updates][]", "price"],
    ["features[subscription_update][proration_behavior]", "create_prorations"],
    ["features[subscription_update][products][0][product]", product.id],
    ["features[subscription_update][products][0][prices][]", prices.starter],
    ["features[subscription_update][products][0][prices][]", prices.giving],
    ["features[subscription_update][products][0][prices][]", prices.stewardship],
    ["features[subscription_update][products][0][prices][]", prices.parish],
    ["metadata[agapay_configuration_key]", "give_self_service_v1"]
  ])
});

console.log(JSON.stringify({
  AGAPAY_STRIPE_PRODUCT_GIVE: product.id,
  AGAPAY_STRIPE_PRICE_STARTER_MONTHLY: prices.starter,
  AGAPAY_STRIPE_PRICE_GIVING_MONTHLY: prices.giving,
  AGAPAY_STRIPE_PRICE_STEWARDSHIP_MONTHLY: prices.stewardship,
  AGAPAY_STRIPE_PRICE_PARISH_MONTHLY: prices.parish,
  AGAPAY_STRIPE_BILLING_PORTAL_CONFIGURATION: portalConfiguration.id
}, null, 2));
