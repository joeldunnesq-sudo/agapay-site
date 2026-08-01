import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/myagapay/index.html", import.meta.url), "utf8");
const shell = await readFile(new URL("../public/myagapay-shell.js", import.meta.url), "utf8");

const desktopNav = html.match(/<nav class="nav unified-product-nav"[\s\S]*?<\/nav>/)?.[0] || "";
const mobileCommunicationsNav = html.match(/<section class="mobile-section" data-mobile-communications-nav[\s\S]*?<\/section>/)?.[0] || "";
const mobileTabbar = html.match(/<nav class="my-agapay-tabbar"[\s\S]*?<\/nav>/)?.[0] || "";

for (const href of ["/myagapay/feed", "/myagapay/groups"]) {
  assert.match(desktopNav, new RegExp(`href="${href}"`), `desktop navigation should link to ${href}`);
  assert.match(mobileCommunicationsNav, new RegExp(`href="${href}"`), `mobile home navigation should link to ${href}`);
}

assert.doesNotMatch(mobileTabbar, /data-static-nav/, "the home bottom bar must be normalized from live parish capabilities");
const mobileProducts = shell.match(/function mobileProducts\(\) \{[\s\S]*?\n  \}/)?.[0] || "";
assert.match(mobileProducts, /byId\.get\("giving"\)[\s\S]*featureOrFallback\("bookstore", "settings"\)[\s\S]*byId\.get\("today"\)[\s\S]*featureOrFallback\("directory", "learn"\)[\s\S]*featureOrFallback\("commemorations", "history"\)/,
  "the Parish-tier bottom bar should be Home, Bookstore, Today, Directory, and Sacraments in that order");
assert.doesNotMatch(mobileProducts, /"feed"|"groups"/, "Feed and Groups must not crowd the mobile bottom bar");
assert.match(shell, /mobileLabel: "Home"/);
assert.match(shell, /<a href="\/myagapay\/feed" role="menuitem">Parish Feed<\/a>[\s\S]*<a href="\/myagapay\/groups" role="menuitem">Groups<\/a>/,
  "communications should remain reachable from the top account menu");
assert.match(html, /data-hub-unread="feed"/);
assert.match(html, /data-hub-unread="groups"/);
assert.match(html, /fetch\("\/api\/donor\/feed"/);
assert.match(html, /fetch\("\/api\/donor\/groups"/);
assert.match(shell, /item\.id === "groups"[\s\S]*groupsUnreadCount/);
assert.match(shell, /\.my-agapay-tabbar:not\(\[data-static-nav\]\)/);
assert.match(shell, /id: "feed", href: "\/myagapay\/feed"[^\n]+icon: icons\.feed }/, "Feed should remain reachable even when the parish has no published communications yet");

console.log("My AGAPAY communications navigation tests: PASS");
