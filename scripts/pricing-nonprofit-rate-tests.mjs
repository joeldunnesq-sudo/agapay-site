import assert from "node:assert/strict";
import fs from "node:fs";

const pricing = fs.readFileSync(new URL("../public/give/pricing.html", import.meta.url), "utf8");

const checks = [
  ["standard-card nonprofit rate", pricing.includes("2.2% + $0.30")],
  ["ACH rate and cap", pricing.includes("0.8%") && pricing.includes("Capped at $5")],
  ["American Express exception", pricing.includes("American Express") && pricing.includes("3.5%")],
  ["80 percent donation-volume requirement", pricing.includes("at least 80% of Stripe payment volume")],
  ["nonqualifying payment types", ["ticket sales", "membership dues", "tuition", "registration fees", "auction payments"].every(value => pricing.includes(value))],
  ["Stripe Support application link", pricing.includes("https://support.stripe.com/questions/fee-discount-for-nonprofit-organizations")],
  ["nonprofit team email", pricing.includes("mailto:nonprofit@stripe.com")],
  ["non-retroactive timing guidance", pricing.includes("should not assume Stripe will apply discounted rates retroactively")],
  ["Stripe-controlled eligibility disclaimer", pricing.includes("Rates and eligibility are determined by Stripe and may change")]
];

const failures = checks.filter(([, passed]) => !passed);
if (failures.length) {
  failures.forEach(([label]) => console.error(`FAIL - ${label}`));
  process.exit(1);
}

assert.match(pricing, /aria-labelledby="stripe-nonprofit-title"/, "the pricing explanation should be a labeled page section");
assert.match(pricing, /\.tier-card \{[^}]*display: flex;[^}]*flex-direction: column;/, "pricing cards should use a column flex layout so small badges cannot stretch into grid rows");
assert.match(pricing, /\.early-adopter-badge \{[^}]*align-self: center;[^}]*white-space: nowrap;/, "early-adopter badges should retain their compact pill geometry");
assert.match(pricing, /\.value-card img \{[^}]*clip-path: inset\(0 0 0 10%\);[^}]*translateX\(-5%\)/, "the stewardship sketch should crop out the source image's blank left strip");
console.log("PASS - pricing page explains Stripe nonprofit rates, eligibility, exclusions, and application steps");
