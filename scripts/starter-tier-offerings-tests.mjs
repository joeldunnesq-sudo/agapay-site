import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parishFromRegistration, starterFundCatalogError } from "../src/handlers/parish.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const starter = {
  status: "verified",
  givingStatus: "active",
  subscriptionTier: "starter",
  parishId: "mission-starter",
  parishName: "Holy Mission",
  communityType: "mission",
  candlesEnabled: true,
  funds: [
    { id: "general", name: "General Operating Fund" },
    { id: "candle", name: "Candles / Vigil Lights" },
    { id: "mission-development", name: "Mission Development Fund" },
    { id: "extra", name: "Extra Fund", enabled: false }
  ],
  campaigns: [{ id: "campaign", name: "Hidden Campaign" }]
};

const parish = parishFromRegistration(starter);
assert.equal(parish.givingPlusEnabled, false);
assert.equal(parish.candlesEnabled, true);
assert.equal(parish.designatedFundsEnabled, true);
assert.deepEqual(parish.funds.map((fund) => fund.id), ["general", "mission-development"]);
assert.deepEqual(parish.campaigns, []);

const legacyMission = parishFromRegistration({
  ...starter,
  parishId: "test-lubbock",
  parishName: "Test Orthodox Mission",
  communityType: "parish",
  imageUrl: "/images/giving/parish-church-square.png",
  imageAlt: "Orthodox parish church sketch"
});
assert.equal(legacyMission.type, "mission");
assert.equal(legacyMission.imageUrl, "/images/giving/mission-church-square.png");
assert.equal(legacyMission.imageAlt, "Orthodox mission church sketch");

assert.equal(starterFundCatalogError(starter.funds), "");
assert.match(starterFundCatalogError([...starter.funds, { id: "second", name: "Second active fund" }]), /one active designated fund/i);
assert.match(starterFundCatalogError(starter.funds.filter((fund) => fund.id !== "general")), /General Operating Fund/i);

const parishHandler = read("src/handlers/parish.js");
const donorApp = read("public/donor/app.js");
const publicForm = read("public/give/form.html");
const parishApp = read("public/parish/app.js");
const pricing = read("public/give/index.html");

assert.match(parishHandler, /requestedGiftType === "fund" && parish\.designatedFundsEnabled/);
assert.match(parishHandler, /requestedGiftType === "candles" && parish\.candlesEnabled/);
assert.match(parishHandler, /starterFundCatalogError\(body\.funds\)/);
assert.match(donorApp, /function parishCanUseGiftType/);
assert.match(publicForm, /type === 'funds' \? !parish\.designatedFundsEnabled/);
assert.match(parishApp, /Give offers your mission three clear destinations/);
assert.match(parishApp, /class="starter-tier-upgrade-card"/);
assert.match(parishApp, /Your current plan remains fully usable with General Operating, one designated fund, and candles/);
assert.doesNotMatch(parishApp, /renderGivingOptionsEditor[\s\S]*?: '<div class="starter-tier-paywall">[\s\S]*?Save giving options/);
assert.match(pricing, /General Operating and one designated fund/);
assert.match(pricing, /Candles, memorials, and commemorations/);
assert.match(pricing, /Unlimited funds, campaigns, and pledge tracking/);

console.log("PASS - Give includes General Operating, one designated fund, and candles while Give + retains advanced giving");
