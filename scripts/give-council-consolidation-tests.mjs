import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const overview = read("public/give/index.html");
const styles = read("public/styles/give.css");
const server = read("server.mjs");
const worker = read("src/worker.js");
const sitemap = read("public/sitemap.xml");

// Retired add-on checkout routes cannot create a second subscription or Customer.
const stewardshipSource = read("src/handlers/stewardship.js");
for (const name of ["handleParishStewardshipSubscribe", "handleStewardshipSubscribe"]) {
  const handler = stewardshipSource.slice(stewardshipSource.indexOf("export async function " + name)).split("\n}")[0];
  assert.match(handler, /subscription_option_retired/);
  assert.match(handler, /status: 410/);
  assert.doesNotMatch(handler, /stripePlatformPost|applyApprovedExemptionIfExists/);
}

for (const id of ["pricing", "security", "platform", "giving-app", "koinonia", "app-features", "campaigns", "reporting", "automated-reports", "how-it-works", "why", "parish-council", "faq", "install-app"]) {
  assert.match(overview, new RegExp(`id=["']${id}["']`), `the consolidated Give page must expose #${id}`);
}
for (const id of ["pricing", "security", "platform", "giving-app", "koinonia", "app-features", "campaigns", "reporting", "how-it-works", "faq", "install-app"]) {
  assert.match(overview, new RegExp(`href=["']#${id}["']`), `the in-page navigation must link to #${id}`);
}

assert.match(overview, /<title>Custom-Built Orthodox Church Management Software \| AGAPAY<\/title>/, "the page title must target the custom-built Orthodox CMS intent");
assert.match(overview, /name="description" content="Custom-built Orthodox church management software[^\"]+Orthodox tithing app[^\"]+Plans start at \$9 per month\./, "the search description must connect tithing and parish management with actual pricing");
assert.match(overview, /rel="canonical" href="https:\/\/agapay\.app\/give"/, "the consolidated page must be canonical");
assert.match(overview, /hreflang="x-default"/, "the canonical page must provide a default language target");
assert.match(overview, /fetchpriority="high"/, "the hero image must be prioritized for rendering");
assert.match(overview, /loading="lazy" width="720" height="1560"/, "below-fold app screenshots must be lazy and dimensioned");

const structuredData = overview.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] || "";
const graph = JSON.parse(structuredData)["@graph"];
assert.ok(graph.some((item) => item["@type"] === "WebPage"), "structured data must identify the canonical WebPage");
assert.ok(graph.some((item) => Array.isArray(item["@type"]) && item["@type"].includes("SoftwareApplication")), "structured data must describe the software application");
assert.ok(graph.some((item) => item["@type"] === "BreadcrumbList"), "structured data must expose breadcrumbs");
assert.ok(graph.some((item) => item["@type"] === "FAQPage"), "structured data must mirror the visible FAQ");
const software = graph.find((item) => Array.isArray(item["@type"]) && item["@type"].includes("SoftwareApplication"));
assert.deepEqual([software.offers.lowPrice, software.offers.highPrice], ["9", "209"], "aggregate offers must match the published monthly ladder");
const homepageGraph = JSON.parse(read("public/index.html").match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])["@graph"];
assert.deepEqual(homepageGraph.find((item) => item["@id"] === software["@id"]), software, "homepage and Give must describe one software entity with consistent pricing and features");
assert.equal(software.isAccessibleForFree, false, "free registration must not mark the paid parish software as free");
const escapeText = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const faqSection = overview.match(/<section[^>]+id="faq"[\s\S]*?<\/section>/)[0];
const visibleFaqs = [...faqSection.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)].map((match) => ({ name: match[1], text: match[2] }));
const structuredFaqs = graph.find((item) => item["@type"] === "FAQPage").mainEntity.map((item) => ({ name: escapeText(item.name), text: escapeText(item.acceptedAnswer.text) }));
assert.deepEqual(structuredFaqs, visibleFaqs, "every structured FAQ must match an actual visible question and answer");

const planCards = [...overview.matchAll(/<article class="give-plan-card[^\"]*">([\s\S]*?)<\/article>/g)].map((match) => match[1]);
assert.equal(planCards.length, 3, "the pricing comparison must retain Give, Give +, and Parish");
assert.match(planCards[0], /<span class="give-plan-name">Give<\/span>/);
assert.match(planCards[0], /<strong>\$9<\/strong>/);
assert.match(planCards[0], /<li>Basic pledge tracking<\/li>/, "Give must explicitly include basic pledge tracking");
assert.match(planCards[1], /Everything in Give/, "Give + must inherit basic pledge tracking");
assert.match(planCards[1], /Stewardship Health analytics and annual statements/, "advanced stewardship reporting must remain in Give +");
assert.doesNotMatch(planCards[1], /<li>[^<]*pledge tracking/i, "pledge tracking must not be listed as an upgrade-only feature");
assert.ok(software.featureList.includes("Basic pledge tracking included in Give at $9 per month"), "search metadata must reflect the base-tier feature");
const pledgeFaq = graph.find((item) => item["@type"] === "FAQPage").mainEntity.find((item) => item.name === "Is pledge tracking included in Give?");
assert.ok(pledgeFaq, "structured FAQ must answer which tier includes pledges");
assert.ok(overview.includes(`<summary>${pledgeFaq.name}</summary><p>${pledgeFaq.acceptedAnswer.text.replaceAll("Give Plus", "Give +")}</p>`), "visible and structured pledge FAQs must agree");
assert.match(read("public/index.html"), /Give includes[^<]*basic pledge tracking for \$9 per month\. Give \+ adds campaigns and Stewardship Health analytics/, "the homepage must distinguish basic pledges from advanced analytics");
assert.match(read("public/give/request-demo.html"), /basic pledge tracking — included in Give/, "the demo-page feature summary must include base-tier pledges");

for (const copy of [
  "$0 AGAPAY donation fee",
  "Give + is $79",
  "Under 50 households</th><td>$149/mo",
  "50-149 households</th><td>$179/mo",
  "150-299 households</th><td>$199/mo",
  "300-599 households</th><td>$209/mo",
  "Sacraments &amp; Services</span><strong>$9/mo",
  "Full Commerce</span><strong>$29/mo",
  "Accounting Suite</span><strong>$129/mo",
  "Koinonia is included in Give +"
]) assert.ok(overview.includes(copy), `the proposal-aligned page must include ${copy}`);

for (const securityBoundary of [
  "Stripe-hosted Checkout",
  "PBKDF2-SHA256",
  "cryptographic signature and timestamp",
  "Cross-parish requests are denied",
  "automatically encrypted at rest with AES-256",
  "tokens expire after five minutes and can be used only once",
  "No responsible online service can promise zero risk"
]) assert.ok(overview.includes(securityBoundary), `the consolidated security section must retain: ${securityBoundary}`);

assert.match(styles, /\.give-section-nav\s*\{[^}]*position:\s*sticky/, "the section navigator must remain sticky");
assert.match(styles, /@media \(max-width: 560px\)/, "the consolidated page must have a phone layout");
assert.match(styles, /prefers-reduced-motion: reduce/, "the page must respect reduced-motion preferences");
assert.equal((overview.match(/class="give-koinonia-phone"/g) || []).length, 1, "Koinonia must present one phone viewport instead of three separate phones");
assert.equal((overview.match(/class="give-koinonia-slide"/g) || []).length, 3, "Koinonia should scroll through three unique screens");
const previewScript = read("public/koinonia-preview.js");
assert.match(previewScript, /image\.decode\(\)/, "Koinonia should wait for images before advancing");
assert.match(previewScript, /IntersectionObserver/, "Koinonia should advance only while visible");
assert.match(previewScript, /paused = reducedMotion\.matches/, "Koinonia should start paused for reduced motion");
assert.match(overview, /data-koinonia-pause[\s\S]*data-koinonia-next/, "Koinonia should provide pause and manual next controls");

for (const retiredFile of ["features", "how-it-works", "pricing", "security", "get-agapay", "recurring-donations", "fundraising", "event-payments", "parish-giving"]) {
  assert.equal(existsSync(path.join(root, `public/give/${retiredFile}.html`)), false, `${retiredFile}.html must be removed after consolidation`);
  assert.ok(!sitemap.includes(`https://agapay.app/give/${retiredFile}`), `${retiredFile} must not remain in the sitemap`);
}
assert.ok(sitemap.includes("<loc>https://agapay.app/give</loc>"), "the sitemap must retain the one canonical Give page");
assert.equal(existsSync(path.join(root, "public/downloads/agapay-parish-council-overview.pdf")), true, "the council proposal download must remain public");

for (const index of [1, 2, 3]) {
  const assetPath = path.join(root, `public/images/app/screenshots/koinonia-give-${index}.jpg`);
  assert.equal(existsSync(assetPath), true, `Koinonia screenshot ${index} must remain available`);
  assert.ok(statSync(assetPath).size < 200_000, `Koinonia screenshot ${index} must remain optimized`);
}

function filesUnder(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry);
    return statSync(fullPath).isDirectory() ? filesUnder(fullPath) : [fullPath];
  });
}
const retiredHref = /href=["']\/give\/(?:features|how-it-works|pricing|security|get-agapay|recurring-donations|fundraising|event-payments|parish-giving)(?:["'#?])/i;
const staleInternalReferences = filesUnder(path.join(root, "public"))
  .filter((file) => /\.(?:html|js|xml)$/i.test(file))
  .filter((file) => retiredHref.test(readFileSync(file, "utf8")));
assert.deepEqual(staleInternalReferences, [], "public pages and navigation must link directly to consolidated anchors");

assert.match(worker, /GIVE_MARKETING_SECTION_REDIRECTS/, "the Worker must own the production consolidation redirects");
assert.match(server, /consolidatedGiveSections/, "the local server must mirror consolidation redirects");

const redirects = new Map([
  ["features", "platform"],
  ["pricing", "pricing"],
  ["how-it-works", "how-it-works"],
  ["security", "security"],
  ["get-agapay", "parish-council"],
  ["recurring-donations", "recurring-donations"],
  ["fundraising", "fundraising"],
  ["event-payments", "event-payments"],
  ["parish-giving", "giving"],
  ["why", "why"]
]);

const { server: localServer } = await import("../server.mjs");
await new Promise((resolve, reject) => {
  localServer.once("error", reject);
  localServer.listen(0, "127.0.0.1", resolve);
});
try {
  const origin = `http://127.0.0.1:${localServer.address().port}`;
  for (const [page, anchor] of redirects) {
    for (const suffix of ["", "/", ".html"]) {
      const response = await fetch(`${origin}/give/${page}${suffix}?source=legacy`, { redirect: "manual" });
      assert.equal(response.status, 301, `/give/${page}${suffix} must permanently redirect`);
      assert.equal(response.headers.get("location"), `${origin}/give?source=legacy#${anchor}`, `the ${page} redirect must preserve its section and query`);
    }
  }
  for (const pathName of ["/give", "/give/"]) {
    const response = await fetch(`${origin}${pathName}`, { redirect: "manual" });
    assert.equal(response.status, 200, `${pathName} must serve the consolidated overview`);
  }
  assert.equal((await fetch(`${origin}/give/request-demo`, { redirect: "manual" })).status, 200, "the demo workflow must remain a distinct route");
} finally {
  await new Promise((resolve) => localServer.close(resolve));
}

console.log("PASS - one canonical Give page, proposal-aligned SEO, pricing, security, and permanent section redirects");
