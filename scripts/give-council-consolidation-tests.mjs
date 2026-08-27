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

for (const id of ["pricing", "security", "platform", "koinonia", "reporting", "how-it-works", "why", "parish-council", "faq"]) {
  assert.match(overview, new RegExp(`id=["']${id}["']`), `the consolidated Give page must expose #${id}`);
}
for (const id of ["pricing", "security", "platform", "koinonia", "reporting", "how-it-works", "faq"]) {
  assert.match(overview, new RegExp(`href=["']#${id}["']`), `the in-page navigation must link to #${id}`);
}

assert.match(overview, /<title>Orthodox Church Management Software &amp; Giving \| AGAPAY<\/title>/, "the page title must target the primary Orthodox CMS and giving intent");
assert.match(overview, /name="description" content="Orthodox church management software[^\"]+Plans start at \$9 per month\./, "the search description must be specific and price-aware");
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
