import { readParishDashboardSource } from './lib/parish-dashboard-source.mjs';
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const migration = read("migrations/0049_authoritative_stewardship_financial_snapshots.sql");
const externalAssetsMigration = read("migrations/0050_financial_snapshot_external_assets.sql");
const restrictedAdjustmentsMigration = read("migrations/0052_restricted_fund_snapshot_adjustments.sql");
const worker = read("src/worker.js");
const handler = read("src/handlers/stewardship.js");
const app = readParishDashboardSource();
const dashboard = read("public/parish/dashboard.html");
const css = read("public/parish/style.css");
const stewardshipCss = read("public/styles/stewardship.css");

const db = new DatabaseSync(":memory:");
db.exec(read("migrations/0016_manual_income_entries.sql"));
db.prepare(`INSERT INTO manual_income_entries
  (id,parish_id,entry_date,source,source_label,amount_cents,fund_code,notes,entered_by,created_at,updated_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
    "legacy-cash", "parish-1", "2026-01-04", "cash_and_checks", null, 10000,
    "General", null, null, "2026-01-04T00:00:00Z", "2026-01-04T00:00:00Z"
  );
db.prepare(`INSERT INTO manual_income_entries
  (id,parish_id,entry_date,source,source_label,amount_cents,fund_code,notes,entered_by,created_at,updated_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
    "legacy-other", "parish-1", "2026-01-05", "other", "Bookstore", 50000,
    null, "Book sales", null, "2026-01-05T00:00:00Z", "2026-01-05T00:00:00Z"
  );
db.exec(migration);
db.prepare(`INSERT INTO stewardship_authoritative_financial_snapshots
  (id,parish_id,fiscal_year,title,restricted_funds_json,created_at,updated_at)
  VALUES(?,?,?,?,?,?,?)`).run(
    "legacy-snapshot", "legacy-parish", 2025, "Legacy snapshot",
    JSON.stringify([{ fundName: "Legacy Endowment", endingBalanceCents: 250000 }]),
    "2026-07-29", "2026-07-29"
  );
db.exec(externalAssetsMigration);
db.exec(restrictedAdjustmentsMigration);

assert.equal(
  db.prepare("SELECT contribution_eligible FROM manual_income_entries WHERE id='legacy-cash'").get().contribution_eligible,
  1,
  "known outside-giving sources should remain contribution-qualified"
);
assert.match(
  db.prepare("SELECT external_assets_json FROM stewardship_authoritative_financial_snapshots WHERE id='legacy-snapshot'").get().external_assets_json,
  /Legacy Endowment/,
  "legacy manually maintained fund records should be preserved as external assets"
);
assert.equal(
  db.prepare("SELECT contribution_eligible FROM manual_income_entries WHERE id='legacy-other'").get().contribution_eligible,
  0,
  "legacy catch-all Other entries must fail closed so commerce/rental revenue cannot inflate giving health"
);

const snapshotInsert = db.prepare(`INSERT INTO stewardship_authoritative_financial_snapshots
  (id,parish_id,fiscal_year,title,created_at,updated_at)
  VALUES(?,?,?,?,?,?)`);
snapshotInsert.run("snapshot-1", "parish-1", 2026, "2026 Financial Snapshot", "2026-07-29", "2026-07-29");
assert.throws(
  () => snapshotInsert.run("snapshot-2", "parish-1", 2026, "Duplicate", "2026-07-29", "2026-07-29"),
  /UNIQUE constraint failed/,
  "a parish must have only one authoritative snapshot per fiscal year"
);

assert.match(migration, /stewardship_financial_snapshot_revisions/);
assert.match(externalAssetsMigration, /external_assets_json/);
assert.match(restrictedAdjustmentsMigration, /restricted_fund_adjustments_json/);
assert.match(restrictedAdjustmentsMigration, /restricted_fund_balances_json/);
assert.match(handler, /export async function handleStewardshipFinancials/);
assert.match(handler, /authoritativeContributionTotals/);
assert.match(handler, /automaticRestrictedFunds/);
assert.match(handler, /trackingBasis: "fiscal_year_inflows"/);
assert.match(handler, /normalizeExternalAssets/);
assert.match(handler, /normalizeRestrictedFundAdjustments/);
assert.match(handler, /openingBalanceCents \+ receivedCents - deductionsCents/);
assert.match(handler, /restrictedFundBalancesTotalCents/);
assert.match(handler, /agapayContributionsCents \+ contributions\.outsideContributionsCents \+ otherRevenue/);
assert.match(handler, /version=version\+1/);
assert.match(handler, /INSERT INTO stewardship_financial_snapshot_revisions/);
assert.equal((handler.match(/export async function handleStewardshipFinancials/g) || []).length, 1);

assert.match(worker, /other_giving_platform/);
assert.match(worker, /contribution_eligible = 1/);
assert.match(worker, /batch_reference/);
assert.doesNotMatch(worker, /MANUAL_INCOME_SOURCES = new Set\(\[[^\]]*"other"/);
assert.match(worker, /if \(!fundCode\)/);
assert.match(worker, /handleStewardshipMonthlyFinancialReport/);
assert.match(worker, /stewardship\/report\/monthly-financial/);
assert.match(worker, /Ending balance = opening balance \+ contributions received/);

assert.match(dashboard, /Record outside-AGAPAY giving/);
assert.match(dashboard, /One authoritative fiscal-year view/);
assert.match(dashboard, /Generate Monthly Financial Report/);
assert.doesNotMatch(dashboard, />Other Income</);
assert.match(app, /Fund\/designation/);
assert.match(app, /Deposit or batch reference/);
assert.match(app, /AGAPAY contributions/);
assert.match(app, /Outside-AGAPAY contributions/);
assert.match(app, /Revision history/);
assert.match(app, /Restricted Fund Balances/);
assert.match(app, /restrictedFundAdjustments/);
assert.match(app, /recalculateRestrictedFundRow/);
assert.match(app, /openStewardshipMonthlyFinancialReport/);
assert.match(app, /Externally Held Assets/);
assert.match(app, /Investment/);
assert.match(app, /Endowment/);
assert.match(app, /Real property/);
assert.doesNotMatch(app, /name="restrictedFunds"/);
assert.doesNotMatch(app, /name="totalIncomeDollars"/);
assert.match(css, /\.sw-outside-giving-panel/);
assert.match(css, /\.sw-fin-derived-grid/);
assert.match(stewardshipCss, /\.sw-fin-asset-row-edit/);
assert.match(stewardshipCss, /\.sw-fin-restricted-adjustment-row/);
assert.match(stewardshipCss, /\.sw-report-card-header/);
assert.match(dashboard, /sw-report-card-header[\s\S]*openStewardshipMonthlyFinancialReport\(\)[\s\S]*sw-financials-secondary-actions/);
assert.ok(
  dashboard.indexOf('openFinancialsEditor()') < dashboard.indexOf('id="financialsYearSelect"')
    && dashboard.indexOf('id="financialsYearSelect"') < dashboard.indexOf('openOutsideAgapayGiving()'),
  'Financial snapshot secondary controls should appear below the report action in edit, year, outside-AGAPAY order'
);

console.log("PASS - outside giving classification and authoritative fiscal-year snapshot lifecycle");
