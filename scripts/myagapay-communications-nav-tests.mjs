import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/myagapay/index.html", import.meta.url), "utf8");
const shell = await readFile(new URL("../public/myagapay-shell.js", import.meta.url), "utf8");

const desktopNav = html.match(/<nav class="nav unified-product-nav"[\s\S]*?<\/nav>/)?.[0] || "";
const parishLifeSection = html.match(/<section class="mobile-section" data-parish-life-section[\s\S]*?<\/section>/)?.[0] || "";
const mobileTabbar = html.match(/<nav class="my-agapay-tabbar"[\s\S]*?<\/nav>/)?.[0] || "";

assert.match(desktopNav, /href="\/myagapay\/parish-life"[^>]*data-parish-life-link[^>]*hidden/, "desktop navigation should expose only the gated Parish Life front door");
assert.doesNotMatch(desktopNav, /href="\/myagapay\/(?:feed|groups)"/, "Feed and Groups should no longer be top-level desktop destinations");
assert.match(parishLifeSection, /hidden[\s\S]*href="\/myagapay\/parish-life"/, "the home Parish Life card should remain hidden until the staging capability loads");
assert.doesNotMatch(parishLifeSection, /href="\/myagapay\/(?:feed|groups)"/, "the home page should point to the Parish Life hub rather than its spokes");

assert.doesNotMatch(mobileTabbar, /data-static-nav/, "the home bottom bar must be normalized from live parish capabilities");
const mobileProducts = shell.match(/function mobileProducts\(\) \{[\s\S]*?\n  \}/)?.[0] || "";
assert.match(mobileProducts, /byId\.get\("giving"\)[\s\S]*featureOrFallback\("bookstore", "settings"\)[\s\S]*byId\.get\("today"\)[\s\S]*featureOrFallback\("directory", "learn"\)[\s\S]*featureOrFallback\("commemorations", "history"\)/,
  "the Parish-tier bottom bar should be Home, Bookstore, Today, Directory, and Sacraments in that order");
assert.doesNotMatch(mobileProducts, /"feed"|"groups"/, "Feed and Groups must not crowd the mobile bottom bar");
assert.match(shell, /mobileLabel: "Home"/);
assert.match(shell, /id: "parish-life", href: "\/myagapay\/parish-life"[^\n]+parishFeature: "parishLifeAvailable"/);
assert.doesNotMatch(shell.match(/function products\(\) \{[\s\S]*?return items;/)?.[0] || "", /id: "(?:feed|groups)"/, "Feed and Groups should be hub spokes, not global products");
assert.match(shell, /data-parish-life-link hidden>Parish Life<\/a>/, "Parish Life should replace Feed and Groups in the top menu and start hidden");
assert.match(shell, /parishLifeAvailable: Boolean\(parish\?\.parishLifeAvailable\)/);
assert.match(shell, /element\.hidden = !parishCapabilities\.parishLifeAvailable/);
assert.match(html, /data-parish-life-unread/);
assert.doesNotMatch(html, /loadHubCommunicationsUnread/, "the home page should not duplicate the hub's read-count requests");
assert.match(shell, /\.my-agapay-tabbar:not\(\[data-static-nav\]\)/);

console.log("My AGAPAY Parish Life navigation tests: PASS");
