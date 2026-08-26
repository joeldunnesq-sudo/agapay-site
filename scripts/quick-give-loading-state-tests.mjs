import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const donorApp = read("public/donor/app.js");
const donorStyle = read("public/donor/style.css");
const home = read("public/myagapay/index.html");
const legacyHome = read("public/donor/index.html");
const feedPage = read("public/myagapay/feed.html");
const groupsPage = read("public/myagapay/groups.html");

assert.match(home, /<body class="[^"]*giving-tier-pending[^"]*">/, "the first HTML paint must declare tier-dependent controls pending");
assert.match(home, /class="quick-give-grid" data-giving-tier-region aria-busy="true"/, "mobile Quick Give must expose its neutral loading state");
assert.match(home, /class="desktop-quick-grid" data-giving-tier-region aria-busy="true"/, "desktop Quick Give must expose its neutral loading state");
assert.match(donorStyle, /\.giving-tier-pending \[data-giving-plus-gift\][\s\S]*content: "Loading"/, "pending controls must look like loading, never an upgrade lock");
assert.match(donorApp, /function primeDonorDashboardParishUi\(\)[\s\S]*setGivingTierTilesLoading\(\)[\s\S]*renderHomeParishWidgetsLoading\(\)/, "home must start from neutral parish UI");
assert.doesNotMatch(donorApp.match(/async function loadDonorDashboardPage\(\)[\s\S]*?\n}/)?.[0] || "", /readDonorCache\("dashboard"\)|renderDonorDashboardPayload\(cached/, "home must not visibly paint cached personalized data before the live dashboard");
assert.match(donorApp, /function renderActiveCampaigns\(parish, \{ confirmed = false \} = \{\}\)[\s\S]*if \(!confirmed\) return/);
assert.match(donorApp, /function renderNextFeast\(parish, \{ confirmed = false \} = \{\}\)[\s\S]*if \(!confirmed\) return/);
assert.match(donorApp, /function renderActiveFunds\(parish, \{ confirmed = false \} = \{\}\)[\s\S]*if \(!confirmed\) return/);
assert.doesNotMatch(home, /<h3>No Active (?:Campaigns|Funds)<\/h3>/, "unknown home widgets must not claim that parish content is absent");
assert.match(home, /Loading parish campaigns…[\s\S]*Loading parish feast…[\s\S]*Loading parish funds…/);
assert.match(legacyHome, /data-giving-plus-gift="candles"[\s\S]*data-giving-plus-gift="commemoration"[\s\S]*data-giving-plus-gift="feast"[\s\S]*data-giving-plus-gift="campaign"/, "legacy donor home must use the same tier-state contract");
for (const page of [feedPage, groupsPage]) {
  assert.match(page, /class="push-notification-actions" aria-busy="true"[\s\S]*data-push-enable hidden[\s\S]*data-push-disable hidden/, "notification actions must remain neutral until device subscription state resolves");
}

function fakeClassList(initial = []) {
  const values = new Set(initial);
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    toggle: (name, force) => force ? values.add(name) : values.delete(name),
    contains: (name) => values.has(name),
  };
}

function fakeTile(giftType) {
  const attributes = new Map([["data-giving-plus-gift", giftType]]);
  return {
    classList: fakeClassList(),
    textContent: giftType,
    href: `/initial/${giftType}`,
    onclick: null,
    getAttribute: (name) => attributes.get(name) || "",
    setAttribute: (name, value) => attributes.set(name, String(value)),
    removeAttribute: (name) => attributes.delete(name),
    attribute: (name) => attributes.get(name),
  };
}

const tiles = ["candles", "commemoration", "feast", "campaign"].map(fakeTile);
const bodyClassList = fakeClassList(["giving-tier-pending"]);
const regionAttributes = new Map([["aria-busy", "true"]]);
const context = {
  document: {
    body: { classList: bodyClassList },
    querySelectorAll(selector) {
      if (selector === "[data-giving-plus-gift]") return tiles;
      if (selector === "[data-giving-tier-region]") return [{
        setAttribute: (name, value) => regionAttributes.set(name, String(value)),
        removeAttribute: (name) => regionAttributes.delete(name),
      }];
      return [];
    },
  },
  window: {},
  quickDonorGiftUrl: (giftType, parish) => `/give/${parish?.id || "none"}/${giftType}`,
  openGivingPlusPaywall: () => false,
  console,
};

const start = donorApp.indexOf("function normalizeDonorGiftType");
const end = donorApp.indexOf("const donorGiftTypeCopy", start);
assert.ok(start >= 0 && end > start, "Quick Give state functions must remain testable as one browser-safe unit");
vm.runInNewContext(donorApp.slice(start, end), context);

// Genuine first visit: pending is neutral, then fresh Give + data resolves
// directly to allowed. At no point may an allowed tile carry the locked class.
context.setGivingTierTilesLoading();
for (const tile of tiles) {
  assert.equal(tile.classList.contains("giving-tier-locked"), false);
  assert.equal(tile.classList.contains("giving-tier-loading"), true);
  assert.equal(tile.attribute("aria-busy"), "true");
}
const givingPlusParish = {
  id: "giving-plus-parish",
  givingPlusEnabled: true,
  candlesEnabled: true,
  designatedFundsEnabled: true,
  funds: [{ id: "building", name: "Building Fund" }],
};
context.updateGivingTierTiles(givingPlusParish);
for (const tile of tiles) {
  assert.equal(tile.classList.contains("giving-tier-locked"), false, `${tile.textContent} must not lock when freshly fetched data permits it`);
  assert.equal(tile.classList.contains("giving-tier-loading"), false);
  assert.equal(tile.attribute("aria-busy"), undefined);
}

// A live arrival resolves the server-rendered pending state directly without
// passing through a locked frame.
bodyClassList.add("giving-tier-pending");
tiles.forEach((tile) => tile.classList.remove("giving-tier-locked", "giving-tier-loading"));
context.updateGivingTierTiles(givingPlusParish);
assert.equal(bodyClassList.contains("giving-tier-pending"), false);
assert.ok(tiles.every((tile) => !tile.classList.contains("giving-tier-locked")), "live permissions must resolve directly to allowed");

// A real locked answer is still rendered after authoritative parish data says
// the feature is unavailable; neutral loading is not a permanent bypass.
context.setGivingTierTilesLoading();
context.updateGivingTierTiles({ id: "starter-parish", givingPlusEnabled: false, candlesEnabled: false });
assert.ok(tiles.every((tile) => tile.classList.contains("giving-tier-locked")));

console.log("PASS - Quick Give is neutral without tier data and never locks freshly permitted gift types");
