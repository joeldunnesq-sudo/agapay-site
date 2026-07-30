import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { mergeStewardshipFundsIntoRegistration, STEWARDSHIP_FUND_DEFAULTS } from "../src/lib/stewardship-funds.js";
import { accountingFund } from "../src/accounting/source-wiring.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const db = new DatabaseSync(":memory:");
db.exec(read("accounting-migrations/0001_accounting_database_foundation.sql"));
db.exec(read("accounting-migrations/0002_core_ledger.sql"));
db.exec(read("accounting-migrations/0018_giving_fund_catalog.sql"));
db.exec("CREATE TABLE registrations(reference TEXT PRIMARY KEY,parish_id TEXT,updated_at TEXT,data TEXT NOT NULL)");
db.exec("CREATE TABLE giving_funds(id TEXT PRIMARY KEY,parish_id TEXT,name TEXT,code TEXT,is_default INTEGER DEFAULT 0,sort_order INTEGER DEFAULT 0,UNIQUE(parish_id,code))");
db.exec(`CREATE TABLE donor_offerings(
  id TEXT PRIMARY KEY,donor_email TEXT,parish_id TEXT,payment_intent_id TEXT,
  status TEXT,payment_status TEXT,created_at TEXT,updated_at TEXT,data TEXT NOT NULL
)`);
db.exec(`CREATE TABLE household_pledges(
  donor_email TEXT NOT NULL,parish_id TEXT NOT NULL,fiscal_year INTEGER NOT NULL,
  target_amount_cents INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(donor_email,parish_id,fiscal_year)
)`);
db.prepare("INSERT INTO registrations(reference,parish_id,updated_at,data) VALUES(?,?,?,?)").run(
  "demo-st-fiacre",
  "st-fiacre",
  "2026-01-01T00:00:00Z",
  JSON.stringify({
    funds: [
      { id: "general", name: "General Fund", restrictionType: "unrestricted" },
      { id: "benevolence-fund", name: "Benevolence Fund", accountNumber: "GIV-507346B3", accountingFundId: "fund_operational_507346b39f44e02ecd15", restrictionType: "unrestricted" }
    ],
    campaigns: [{ id: "alms", slug: "roof-campaign", name: "Church Roof Restoration", goalCents: 1000000, raisedCents: 7500, giftCount: 1 }],
    feastCampaigns: [{ id: "nativity-christ", name: "Nativity of Christ", enabled: true }]
  })
);
db.exec(read("migrations/0045_st_fiacre_benevolence_restriction.sql"));
db.exec(read("migrations/0046_st_fiacre_stewardship_fund_catalog.sql"));
db.exec(read("migrations/0047_st_fiacre_stewardship_accounting_links.sql"));
db.exec(read("migrations/0048_st_fiacre_preserve_posted_fund_ids.sql"));
db.exec(read("migrations/0049_st_fiacre_merge_alms_into_benevolence.sql"));
db.prepare("INSERT INTO giving_funds(id,parish_id,name,code,is_default,sort_order) VALUES(?,?,?,?,?,?)")
  .run("legacy-stewardship", "st-fiacre", "General Stewardship", "stewardship", 1, 0);
db.prepare("INSERT INTO giving_funds(id,parish_id,name,code,is_default,sort_order) VALUES(?,?,?,?,?,?)")
  .run("legacy-campaign", "st-fiacre", "Campaign / Appeal", "campaign", 0, 4);
db.prepare("INSERT INTO donor_offerings(id,parish_id,updated_at,data) VALUES(?,?,?,?)")
  .run("legacy-gift", "st-fiacre", "2026-01-01", JSON.stringify({ giftType: "stewardship", fund: "stewardship" }));
db.prepare("INSERT INTO donor_offerings(id,parish_id,updated_at,data) VALUES(?,?,?,?)")
  .run("off_jul_stew_2026", "st-fiacre", "2026-07-01", JSON.stringify({
    donorName: "Joel Dunn", giftType: "stewardship", giftAmountCents: 15000,
    amountCents: 15000, chargeCents: 15000, parishNetCents: 15000
  }));
db.prepare("INSERT INTO donor_offerings(id,parish_id,updated_at,data) VALUES(?,?,?,?)")
  .run("off_jul_campaign_2026", "st-fiacre", "2026-07-02", JSON.stringify({
    donorName: "Joel Dunn", amountCents: 7500, campaign: "Church Roof Restoration", campaignId: "alms"
  }));
db.prepare("INSERT INTO household_pledges(donor_email,parish_id,fiscal_year,target_amount_cents) VALUES(?,?,?,?)")
  .run("joeldunnesq@gmail.com", "st-fiacre", 2026, 250000);
db.exec(read("migrations/0055_merge_stewardship_into_general_operating.sql"));
db.exec(read("migrations/0056_st_fiacre_roof_campaign_demo_gifts.sql"));
db.exec(read("migrations/0057_st_fiacre_roof_campaign_preserve_existing_demo_gift.sql"));
db.exec(read("migrations/0058_st_fiacre_joel_stewardship_demo_amount.sql"));
db.exec(read("migrations/0059_st_fiacre_2026_demo_received_total.sql"));
db.exec(read("migrations/0060_st_fiacre_2026_nudge_demo.sql"));
db.exec(read("migrations/0062_st_fiacre_joel_givers_nudge_demo.sql"));
const correctedRegistration = JSON.parse(db.prepare("SELECT data FROM registrations WHERE parish_id='st-fiacre'").get().data);
assert.equal(correctedRegistration.funds[1].restrictionType, "donor_restricted_temporary", "St. Fiacre Benevolence must be restricted");
for (const expected of STEWARDSHIP_FUND_DEFAULTS) {
  const correctedFund = correctedRegistration.funds.find((fund) => fund.id === expected.id);
  assert.ok(correctedFund, `St. Fiacre is missing ${expected.name}`);
  assert.ok(correctedFund.accountNumber, `${expected.name} needs an accounting number`);
  if (expected.id === "general") {
    assert.equal(correctedFund.accountingFundId, "fund_general", "General Operating must use the system accounting fund");
  } else {
    assert.match(correctedFund.accountingFundId, /^fund_(?:giving|operational)_/, `${expected.name} must preserve its accounting link`);
  }
}
assert.ok(!correctedRegistration.funds.some((fund) => fund.id === "alms"), "Poor Box / Alms must not remain a separate fund");
assert.equal(correctedRegistration.funds.filter((fund) => fund.id === "benevolence-fund").length, 1, "Benevolence must be the single alms fund");
assert.ok(!correctedRegistration.funds.some((fund) => fund.id === "stewardship"), "General Stewardship must not remain a separate fund");
assert.ok(!correctedRegistration.funds.some((fund) => fund.id === "campaign"), "Campaign / Appeal must not remain a generic fund");
assert.equal(correctedRegistration.funds.find((fund) => fund.id === "general")?.accountingFundId, "fund_general", "stewardship must use the canonical General Operating accounting fund");
assert.equal(JSON.parse(db.prepare("SELECT data FROM donor_offerings WHERE id='legacy-gift'").get().data).fundId, "general", "historical stewardship donations must normalize to General Operating");
assert.equal(db.prepare("SELECT COUNT(*) count FROM giving_funds WHERE code IN ('stewardship','campaign')").get().count, 0, "legacy central catalog rows must be retired");
assert.equal(correctedRegistration.feastCampaigns[0].destinationFundId, "benevolence-fund", "existing feast campaigns must default to Benevolence");
assert.equal(db.prepare(`SELECT SUM(CAST(json_extract(data,'$.amountCents') AS INTEGER)) total
  FROM donor_offerings WHERE parish_id='st-fiacre' AND json_extract(data,'$.campaignId')='alms'`).get().total, 557500, "St. Fiacre roof demo gifts must total 55.75% of the goal");
assert.equal(correctedRegistration.campaigns[0].giftCount, 8, "St. Fiacre roof campaign must display eight demo gifts");
assert.equal(JSON.parse(db.prepare("SELECT data FROM donor_offerings WHERE id='off_jul_stew_2026'").get().data).giftAmountCents, 150000, "Joel's demo stewardship gift must be $1,500");
const receivedDemo = db.prepare(`SELECT
    COUNT(*) count,
    COUNT(DISTINCT donor_email) donors,
    SUM(CAST(json_extract(data,'$.giftAmountCents') AS INTEGER)) total
  FROM donor_offerings
  WHERE id LIKE 'demo_st_fiacre_2026_received_%'`).get();
assert.equal(receivedDemo.count, 23, "the received-total demo must add 23 gifts");
assert.equal(receivedDemo.donors, 23, "the received-total demo must use 23 existing donor identities");
assert.equal(receivedDemo.total, 3304000, "the received-total demo gifts must add exactly $33,040");
assert.equal(db.prepare(`SELECT SUM(CAST(json_extract(data,'$.giftAmountCents') AS INTEGER)) total
  FROM donor_offerings WHERE id LIKE 'demo_st_fiacre_2026_received_%'`).get().total, 3304000, "nudge setup must not change total received");
const nudgeDemo = db.prepare(`WITH stewardship AS (
    SELECT donor_email, SUM(COALESCE(
      json_extract(data,'$.giftAmountCents'),
      json_extract(data,'$.amountCents'),
      0
    )) given_cents
    FROM donor_offerings
    WHERE parish_id='st-fiacre'
      AND lower(COALESCE(json_extract(data,'$.giftType'),'stewardship')) IN ('stewardship','general')
    GROUP BY donor_email
  )
  SELECT COUNT(*) count
  FROM household_pledges p
  LEFT JOIN stewardship s ON s.donor_email=p.donor_email
  WHERE p.parish_id='st-fiacre' AND p.fiscal_year=2026
    AND COALESCE(s.given_cents,0) < ROUND(p.target_amount_cents * 117.0 / 365.0)`).get();
assert.equal(nudgeDemo.count, 5, "St. Fiacre must have five behind-pace demo households");
assert.equal(db.prepare(`SELECT target_amount_cents FROM household_pledges
  WHERE donor_email='joeldunnesq@gmail.com' AND parish_id='st-fiacre' AND fiscal_year=2026`).get().target_amount_cents, 600000, "Joel's demo pledge must qualify for the nudge preview");
const joelGiversNudge = db.prepare(`SELECT
    MAX(json_extract(data,'$.createdAt')) AS last_gift_at,
    MAX(CASE WHEN COALESCE(json_extract(data,'$.frequency'),'once') != 'once' THEN 1 ELSE 0 END) AS recurring,
    CAST(julianday('2026-07-29') - julianday(MAX(json_extract(data,'$.createdAt'))) AS INTEGER) AS days_quiet
  FROM donor_offerings
  WHERE parish_id='st-fiacre'
    AND lower(COALESCE(json_extract(data,'$.donorEmail'),''))='joeldunnesq@gmail.com'`).get();
assert.equal(joelGiversNudge.last_gift_at, "2026-06-11T10:00:00.000Z", "Joel's latest locally seeded demo gift should be moved into June");
assert.equal(joelGiversNudge.recurring, 1, "Joel must have a recurring demo gift for the Givers-page nudge card");
assert.ok(joelGiversNudge.days_quiet >= 30, "Joel's latest demo gift must be at least 30 days old on the demo date");
const firstMerge = mergeStewardshipFundsIntoRegistration({ funds: [{ id: "general", name: "General Operating Fund" }] });
assert.equal(firstMerge.added.length, STEWARDSHIP_FUND_DEFAULTS.length - 1, "activation must retain General Operating and add the remaining reporting funds");
const secondMerge = mergeStewardshipFundsIntoRegistration(firstMerge.registration);
assert.equal(secondMerge.added.length, 0, "Stewardship fund reconciliation must be idempotent");
assert.equal(secondMerge.registration.funds.length, firstMerge.registration.funds.length, "reconciliation must not duplicate funds");
const patronalMerge = mergeStewardshipFundsIntoRegistration({
  funds: [{ id: "general", name: "General Operating Fund" }],
  patronalFeast: "st-nicholas-the-wonderworker",
  patronalFeastName: "St. Nicholas the Wonderworker",
  patronalFeastDate: "12-19",
  feastCampaigns: []
});
assert.equal(patronalMerge.registration.feastCampaigns[0].enabled, true, "the parish feast campaign must be on by default");
assert.equal(patronalMerge.registration.feastCampaigns[0].patronal, true, "the parish feast campaign must retain its patronal identity");
const legacyMerge = mergeStewardshipFundsIntoRegistration({ funds: [
  { id: "benevolence-fund", name: "Benevolence Fund" },
  { id: "alms", name: "Poor Box / Alms" }
] });
assert.equal(legacyMerge.removed.length, 1, "legacy Poor Box / Alms must be removed");
assert.equal(legacyMerge.registration.funds.filter((fund) => fund.id === "benevolence-fund").length, 1, "legacy alms must merge into Benevolence");
assert.ok(!legacyMerge.registration.funds.some((fund) => fund.id === "alms"), "legacy alms ID must not survive reconciliation");
const duplicateGeneralMerge = mergeStewardshipFundsIntoRegistration({ funds: [
  { id: "general", name: "General Operating Fund" },
  { id: "stewardship", name: "General Stewardship" },
  { id: "campaign", name: "Campaign / Appeal" }
] });
assert.deepEqual(duplicateGeneralMerge.registration.funds.map((fund) => fund.id).filter((id) => ["general", "stewardship", "campaign"].includes(id)), ["general"], "General Stewardship and generic Campaign / Appeal must collapse into the canonical General Operating fund");

const fundColumns = db.prepare("PRAGMA table_info(accounting_funds)").all().map((row) => row.name);
for (const column of ["giving_source_type", "giving_source_id", "giving_enabled", "giving_slug", "giving_goal_cents", "giving_metadata_json"]) {
  assert.ok(fundColumns.includes(column), `missing giving catalog column ${column}`);
}
const accountColumns = db.prepare("PRAGMA table_info(accounting_accounts)").all().map((row) => row.name);
assert.ok(accountColumns.includes("account_number"), "every ledger account must retain an account number");

const asyncDb = {
  prepare(sql) {
    let params = [];
    return {
      bind(...values) { params = values; return this; },
      async first() { return db.prepare(sql).get(...params) || null; },
      async run() { return db.prepare(sql).run(...params); }
    };
  }
};
db.prepare(`INSERT OR IGNORE INTO accounting_funds
  (id,code,name,restriction_type,purpose,is_default,is_active,is_system)
  VALUES('fund_general','GENERAL','General Operating Fund','unrestricted','Parish operations',1,1,1)`).run();
db.prepare(`INSERT INTO accounting_funds
  (id,code,name,restriction_type,purpose,is_default,is_active,is_system,giving_source_type,giving_source_id,giving_enabled)
  VALUES('fund_general_legacy','OLD-GENERAL','General Operating Fund (Legacy)','unrestricted','Legacy',0,0,0,'fund','general',0)`).run();
await accountingFund(asyncDb, {
  sourceType: "fund",
  sourceId: "general",
  name: "General Operating Fund",
  accountingFundId: "fund_general",
  publish: true
});
assert.equal(
  db.prepare("SELECT id FROM accounting_funds WHERE giving_source_type='fund' AND giving_source_id='general'").get().id,
  "fund_general",
  "catalog saves must reclaim the General Operating publishing identity from an archived legacy fund"
);
db.prepare(`INSERT INTO accounting_funds
  (id,code,name,restriction_type,purpose,is_default,is_active,is_system,giving_source_type,giving_source_id,giving_enabled)
  VALUES('fund_catalog_old','OLD-CATALOG','Old catalog fund','unrestricted','Legacy',0,0,0,'fund','catalog-test',0)`).run();
db.prepare(`INSERT INTO accounting_funds
  (id,code,name,restriction_type,purpose,is_default,is_active,is_system)
  VALUES('fund_catalog_linked','LINKED-CATALOG','Linked catalog fund','unrestricted','Linked',0,1,0)`).run();
await accountingFund(asyncDb, {
  sourceType: "fund",
  sourceId: "catalog-test",
  name: "Updated catalog fund",
  accountingFundId: "fund_catalog_linked",
  publish: true
});
assert.equal(
  db.prepare("SELECT id FROM accounting_funds WHERE giving_source_type='fund' AND giving_source_id='catalog-test'").get().id,
  "fund_catalog_linked",
  "an explicitly linked ledger fund must reclaim its publishing identity without deleting the historical fund"
);
assert.ok(db.prepare("SELECT id FROM accounting_funds WHERE id='fund_catalog_old'").get(), "historical ledger funds must remain intact");

const wiring = read("src/accounting/source-wiring.js");
const parish = read("src/handlers/parish.js");
const accountingRoutes = read("src/handlers/accounting-setup-reports.js");
const app = read("public/parish/app.js");

assert.match(wiring, /giving_source_type/);
assert.match(wiring, /let id = text\(accountingFundId\)/, "catalog publishing must preserve an existing ledger fund ID");
assert.match(wiring, /restrictionType/);
assert.match(wiring, /giving_goal_cents/);
assert.match(wiring, /loadGivingCatalogFromAccounting/);
assert.match(wiring, /return "fund_general"/, "stewardship accounting wiring must use the system General Operating fund");
assert.match(wiring, /stewardshipGift \? "general"/, "new stewardship source events must resolve to the General Operating identity");
assert.match(wiring, /campaignGift = Boolean\(campaignId\) && !festalAlmsGift/, "feast appeals must post to their chosen fund instead of creating campaign funds");
assert.match(wiring, /WHERE is_system=0 AND is_default=0/, "Funds & Alms must retire parallel accounting-only funds");
assert.match(wiring, /releaseConflictingGivingIdentity/, "catalog saves must release stale unique publishing identities before republishing");
assert.match(parish, /accounting_catalog_unavailable/);
const worker = read("src/worker.js");
const stewardship = read("src/handlers/stewardship.js");
const donorApp = read("public/donor/app.js");
assert.match(worker, /mergeStewardshipFundsIntoRegistration/, "manual activation must update Funds & Alms");
assert.match(stewardship, /mergeStewardshipFundsIntoRegistration/, "Stripe activation must update Funds & Alms");
assert.match(stewardship, /giftType'\), 'stewardship'\)\) IN \('stewardship','general'\)/, "pledge nudges must count stewardship/general gifts only");
assert.match(parish, /\["stewardship", "general"\]\.includes/, "My AGAPAY must use the same stewardship/general gift types");
assert.match(donorApp, /renderDonorDashboardPayload\(cachedDashboard, \{ renderPledge: false \}\)/, "cached dashboards must not paint stale pledge progress");
assert.match(donorApp, /clearDonorCache\("dashboard"\)/, "failed dashboard refreshes must discard stale financial cache");
assert.match(worker, /f\.reportCode \|\| f\.id/, "reporting aliases must not create duplicate accounting funds");
assert.match(worker, /IN \('stewardship','general','general stewardship','general operating fund'\)[\s\S]*THEN 'general'/, "legacy and new stewardship reporting must aggregate into General Operating");
assert.match(parish, /isGeneralStewardship \? "General Operating Fund"/, "checkout must store stewardship donations in General Operating");
assert.match(parish, /isGeneralStewardship \? "general"/, "checkout must store the canonical General Operating fund ID");
assert.doesNotMatch(read("src/lib/stewardship-funds.js"), /name: "Poor Box \/ Alms"/, "Poor Box / Alms must not be a default fund");
assert.doesNotMatch(read("src/lib/stewardship-funds.js"), /name: "Campaign \/ Appeal"/, "campaigns must publish their own individual funds");
assert.doesNotMatch(read("src/lib/stewardship-funds.js"), /name: "General Stewardship"/, "General Stewardship must not be a parallel fund");
assert.doesNotMatch(worker, /const defaults = \[\s*\{ name: "General Stewardship"/, "worker must not maintain a parallel default-fund list");
assert.doesNotMatch(stewardship, /const defaults = \[\s*\{ name: "General Stewardship"/, "webhook must not maintain a parallel default-fund list");
assert.ok(parish.indexOf("synchronizeGivingCatalogWithAccounting") < parish.indexOf("saveRegistrationRecord(env, found.key, updated, current)"), "accounting catalog must save before the central registration");
assert.match(accountingRoutes, /fund_catalog_managed_in_parish_dashboard/);
assert.doesNotMatch(accountingRoutes, /INSERT INTO accounting_funds[\s\S]*VALUES\(\?,\?,\?,\?,\?,\?,0,1,0\)/);
assert.doesNotMatch(accountingRoutes, /current\.category !== "expense"/);
assert.match(app, /function showAccountingAccountForm\b/);
assert.match(app, /id="fundAccountNumber"/);
assert.match(app, /id="campaignAccountNumber"/);
assert.match(app, /id="fundRestriction"/);
assert.match(app, /Custom fund — name it yourself/);
assert.match(app, /function updateGivingOption\b/, "existing funds must support editing after creation");
assert.match(app, /name="accountNumber"/, "the fund editor must allow account-number changes");
assert.match(app, /name="restrictionType"/, "the fund editor must allow restriction changes");
assert.match(app, /options-summary-builder/, "the Active giving options card must retain the add-fund workflow");
assert.match(app, /onclick="editGivingOption\('fund',\$\{row\.index\}\)"/, "fund rows in Active giving options must expose inline editing");
assert.match(app, /class="options-summary-action"/, "active-fund edit buttons must sit in the far-right action column");
assert.match(app, /function updateFeastCampaignFund\b/, "Major Feast Alms campaigns must expose a destination-fund selector");
assert.match(app, /destinationFundId:'benevolence-fund'/, "new Major Feast Alms campaigns must default to Benevolence");
assert.match(app, /Parish feast day/, "Funds & Alms must label the feast configured in Parish Settings");
assert.doesNotMatch(app, /<h3 class="option-group-title">Designated funds<\/h3>/, "Funds & Alms must not render a duplicate Designated funds card");
assert.match(app, /Benevolence Fund'[^}\n]+restrictionType:'donor_restricted_temporary'/, "new Benevolence funds must default to donor restricted");
assert.match(app, /Funds &amp; Alms is the source of truth/);
assert.match(app, /funds: editableFunds,[\s\S]*campaigns: editableCampaigns,[\s\S]*feastCampaigns: editableFeastCampaigns/, "saving another dashboard tab must retain Funds & Alms state");
assert.doesNotMatch(app, /Advanced edit \(JSON\)|fundsJson|campaignsJson/, "Funds & Alms must not expose an internal JSON editor");

console.log("PASS - Funds & Alms accounting catalog, restrictions, metadata, failure safety, and account numbers");
