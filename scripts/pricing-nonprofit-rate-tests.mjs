import assert from "node:assert/strict";
import fs from "node:fs";

const pricing = fs.readFileSync(new URL("../public/give/index.html", import.meta.url), "utf8");

const checks = [
  ["zero AGAPAY donation fee", pricing.includes("$0") && pricing.includes("AGAPAY donation fee")],
  ["Stripe processing disclosure", pricing.includes("Card and ACH processing is billed by Stripe")],
  ["Stripe Support application link", pricing.includes("https://support.stripe.com/questions/fee-discount-for-nonprofit-organizations")],
  ["Stripe-controlled eligibility disclaimer", pricing.includes("Stripe controls approval, rates, and continued eligibility")],
  ["donor processing-cost option", pricing.includes("Donors may choose to cover processing fees")]
];

const failures = checks.filter(([, passed]) => !passed);
if (failures.length) {
  failures.forEach(([label]) => console.error(`FAIL - ${label}`));
  process.exit(1);
}

assert.match(pricing, /aria-label="Payment processing costs"/, "the pricing explanation should be a labeled content group");
assert.doesNotMatch(pricing, /2\.2% \+ \$0\.30|3\.5%|at least 80%/, "the marketing page should not hard-code changeable Stripe rates or eligibility rules");
console.log("PASS - consolidated pricing explains AGAPAY fees and routes current nonprofit-rate decisions to Stripe");
