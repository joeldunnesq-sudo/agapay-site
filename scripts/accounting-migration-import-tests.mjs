import { readParishDashboardSource } from './lib/parish-dashboard-source.mjs';
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  commitChartOfAccountsImport, commitFundMapping,
  commitOpeningBalanceImport, commitTransactionHistoryImport, createJournalDraft,
  createMigrationSession, initializeLedger, postJournalEntry, postOpeningBalanceBatch,
  previewChartOfAccountsCsv, previewOpeningBalanceCsv, previewTransactionHistoryCsv,
  previewVendorCsv
} from "../src/accounting/index.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const migration = read("accounting-migrations/0023_migration_import_sessions.sql");
const serviceSource = read("src/accounting/migration/service.js");
const handlerSource = read("src/handlers/accounting-migration.js");
const workerSource = `${read("src/worker.js")}\n${read("src/routes/accounting.js")}`;
const uiSource = readParishDashboardSource();
const authorizationSource = read("src/lib/authorization.js");
const reconciliationSource = read("src/accounting/reconciliation/service.js");
const capabilityMigration = read("migrations/0042_accounting_migration_import_capability.sql");

function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of [
    "accounting-migrations/0001_accounting_database_foundation.sql",
    "accounting-migrations/0002_core_ledger.sql",
    "accounting-migrations/0003_phase2a_setup_configuration.sql",
    "accounting-migrations/0008_phase3a_accounts_payable.sql",
    "accounting-migrations/0023_migration_import_sessions.sql"
  ]) sqlite.exec(read(file));
  const prepare = (sql) => ({
    params: [],
    bind(...params) { this.params = params; return this; },
    async first() { return sqlite.prepare(sql).get(...this.params) || null; },
    async all() { return { results: sqlite.prepare(sql).all(...this.params) }; },
    async run() { const result = sqlite.prepare(sql).run(...this.params); return { success:true, meta:{ changes:result.changes } }; }
  });
  return {
    sqlite,
    prepare,
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    }
  };
}

const actor = {
  id: "migration-treasurer", type: "platform_user",
  capabilities: ["accounting.configure", "accounting.migration.import", "accounting.opening_balances.manage", "accounting.journals.create", "accounting.journals.post"]
};
async function initialized() {
  const db = database();
  await initializeLedger(db, { actor, date:new Date("2026-07-15T12:00:00Z") });
  return db;
}

{
  const schema = new DatabaseSync(":memory:");
  schema.exec(read("accounting-migrations/0001_accounting_database_foundation.sql"));
  schema.exec(read("accounting-migrations/0002_core_ledger.sql"));
  schema.exec(migration);
  const names = schema.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name GLOB 'accounting_migration_*' ORDER BY name").all().map((row) => row.name);
  assert.deepEqual(names, ["accounting_migration_account_map", "accounting_migration_fund_map", "accounting_migration_sessions"]);
  for (const value of ["quickbooks", "aplos", "other", "in_progress", "completed", "abandoned", "not_started", "skipped"]) assert.match(migration, new RegExp(`'${value}'`));
  console.log("PASS - migration creates only the session and two mapping tables with constrained states");
}

{
  const platform = new DatabaseSync(":memory:");
  platform.exec(read("migrations/0020_platform_identity.sql"));
  platform.exec(read("migrations/0037_accounting_staff_profiles.sql"));
  platform.exec(`INSERT INTO parish_memberships(id,user_id,parish_id,role_template,status) VALUES
    ('mem_t','user_t','parish','treasurer','active'),('mem_b','user_b','parish','bookkeeper','active');
    INSERT INTO accounting_staff_profiles(id,parish_id,display_name,role_template,capabilities_json,pin_record,created_by_actor_type)
    VALUES('staff_t','parish','Treasurer','treasurer','["accounting.view"]','{}','test'),
          ('staff_b','parish','Bookkeeper','bookkeeper','["accounting.view"]','{}','test');`);
  platform.exec(capabilityMigration);
  assert.equal(platform.prepare("SELECT COUNT(*) count FROM membership_capabilities WHERE membership_id='mem_t' AND capability='accounting.migration.import'").get().count, 1);
  assert.equal(platform.prepare("SELECT COUNT(*) count FROM membership_capabilities WHERE membership_id='mem_b' AND capability='accounting.migration.import'").get().count, 0);
  assert.equal(JSON.parse(platform.prepare("SELECT capabilities_json FROM accounting_staff_profiles WHERE id='staff_t'").get().capabilities_json).includes("accounting.migration.import"), true);
  assert.equal(JSON.parse(platform.prepare("SELECT capabilities_json FROM accounting_staff_profiles WHERE id='staff_b'").get().capabilities_json).includes("accounting.migration.import"), false);
  console.log("PASS - existing treasurer memberships and PIN profiles receive the migration privilege while bookkeepers do not");
}

{
  assert.match(reconciliationSource, /from ['"]\.\.\/csv-utils\.js['"]/);
  for (const helper of ["csvRows", "normalize", "text", "cents", "digest"]) assert.doesNotMatch(reconciliationSource, new RegExp(`function ${helper}\\(`));
  assert.doesNotMatch(serviceSource, /(?:INSERT\s+INTO|UPDATE)\s+accounting_funds/i);
  console.log("PASS - CSV helpers are shared and the migration service never writes accounting_funds directly");
}

const db = await initialized();
const session = await createMigrationSession(db, { actor, entitlementTier:"parish", sourceSystem:"quickbooks" });
const chartCsv = [
  "Account ID,Account Number,Account Name,Account Type,Description",
  "QB-BANK,1010,Operating Checking,Bank,Existing checking",
  "QB-UTIL,6200,Utilities,Expense,Electric and water"
].join("\n");
const chartPreview = await previewChartOfAccountsCsv(db, { actor, entitlementTier:"parish", filename:"chart.csv", csv:chartCsv });
assert.equal(chartPreview.rows[0].action, "willLink");
assert.equal(chartPreview.rows[1].action, "willCreate");
await assert.rejects(
  () => commitChartOfAccountsImport(db, { actor, entitlementTier:"parish", migrationSessionId:session.id, preview:chartPreview, typeMap:{ Bank:"asset" } }),
  /Confirm an AGAPAY account category for: Expense/
);
const chartResult = await commitChartOfAccountsImport(db, {
  actor, entitlementTier:"parish", migrationSessionId:session.id, preview:chartPreview, typeMap:{ Bank:"asset", Expense:"expense" }
});
assert.deepEqual(chartResult, { created:1, linked:1, mapped:2 });
assert.equal(db.sqlite.prepare("SELECT agapay_account_id FROM accounting_migration_account_map WHERE migration_session_id=? AND source_account_ref='QB-BANK'").get(session.id).agapay_account_id, "acct_1010");
assert.equal(db.sqlite.prepare("SELECT COUNT(*) count FROM accounting_accounts WHERE account_number='6200'").get().count, 1);
console.log("PASS - chart import rejects an unconfirmed source type, links an existing account, and creates the new account");

{
  const quickBooksInvoiceCsv = [
    "Vendor,Invoice Date,Due Date,Invoice No,Account,Description,Quantity,Unit Price,Amount",
    "ACME Supplies,7/21/2026,8/8/2026,INV-10020203,Cost of Goods Sold,book,2,50,100",
    "ACME Supplies,7/21/2026,8/8/2026,INV-10020203,Cost of Goods Sold,cross,1,36,36"
  ].join("\n");
  const vendorPreview = await previewVendorCsv(db, {
    actor, entitlementTier:"parish", filename:"quickbooks-invoices.csv", csv:quickBooksInvoiceCsv,
    columnMap:{ displayName:"Vendor Name" }
  });
  assert.equal(vendorPreview.invalidRows, 0);
  assert.equal(vendorPreview.validRows, 2);
  assert.deepEqual(vendorPreview.rows.map((row) => row.displayName), ["ACME Supplies", "ACME Supplies"]);
  assert.deepEqual(vendorPreview.rows.map((row) => row.action), ["willCreate", "willSkip"]);
  console.log("PASS - QuickBooks invoice rows accept Vendor as the display name and flag repeated vendors for skipping");
}

{
  let patchOperation = null;
  const result = await commitFundMapping(db, {
    actor, entitlementTier:"parish", migrationSessionId:session.id, parishId:"parish-test",
    mappings:[{ sourceFundRef:"QB-GENERAL", agapayFundId:"fund_general" }],
    newFunds:[{ sourceFundRef:"QB-BUILDING", displayName:"Building Fund", restrictionType:"donor_restricted_temporary", donorRestricted:true, accountNumber:"BLDG" }],
    loadCurrentRegistration:async () => ({
      funds:[{ id:"general", name:"General Operating Fund" }, { id:"flowers", name:"Flowers" }],
      campaigns:[{ id:"roof", name:"Roof campaign" }],
      feastCampaigns:[{ id:"nativity", name:"Nativity appeal" }]
    }),
    patchParishDashboard:async (operation) => {
      patchOperation = operation;
      db.sqlite.prepare(`INSERT INTO accounting_funds(id,code,name,restriction_type,is_default,is_active,is_system)
        VALUES('fund_building','BLDG','Building Fund','donor_restricted_temporary',0,1,0)`).run();
      return { ok:true, accountingCatalog:{ available:true } };
    }
  });
  assert.equal(patchOperation.method, "PATCH");
  assert.equal(patchOperation.path, "/api/parish/dashboard/parish-test");
  assert.deepEqual(patchOperation.body.funds.map((fund) => fund.name), ["General Operating Fund", "Flowers", "Building Fund"]);
  assert.deepEqual(patchOperation.body.campaigns, [{ id:"roof", name:"Roof campaign" }]);
  assert.deepEqual(patchOperation.body.feastCampaigns, [{ id:"nativity", name:"Nativity appeal" }]);
  assert.equal(result.existingFundCount, 2);
  assert.equal(db.sqlite.prepare("SELECT agapay_fund_id FROM accounting_migration_fund_map WHERE migration_session_id=? AND source_fund_ref='QB-BUILDING'").get(session.id).agapay_fund_id, "fund_building");
  console.log("PASS - fund mapping drives the parish PATCH path with the full current-plus-new catalog union");
}

{
  const unbalanced = await previewOpeningBalanceCsv(db, {
    actor, entitlementTier:"parish", migrationSessionId:session.id, filename:"trial-balance.csv",
    csv:"Account,Debit,Credit\nQB-BANK,100.00,\nQB-UTIL,,90.00"
  });
  assert.equal(unbalanced.balanced, false);
  assert.equal(unbalanced.eligibleToCommit, false);
  const before = db.sqlite.prepare("SELECT COUNT(*) count FROM accounting_opening_balance_batches").get().count;
  await assert.rejects(() => commitOpeningBalanceImport(db, {
    actor, entitlementTier:"parish", migrationSessionId:session.id, preview:unbalanced, effectiveDate:"2026-07-01"
  }), /error-free and balanced/);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) count FROM accounting_opening_balance_batches").get().count, before);
  console.log("PASS - unbalanced opening balances are stopped in preview and never reach posting");
}

{
  const history = await previewTransactionHistoryCsv(db, {
    actor, entitlementTier:"parish", migrationSessionId:session.id, filename:"general-ledger.csv",
    csv:"Date,Account,Debit,Credit,Memo,Description,Fund,Transaction ID\n2026-07-15,QB-BANK,25.00,,Utility refund,Deposit,,TX-1\n2026-07-15,QB-UTIL,,25.00,Utility refund,Expense reversal,,TX-1"
  });
  assert.equal(history.groupingMethod, "explicit_id");
  assert.equal(history.eligibleGroups, 1);
  assert.match(history.accountsPayableLimitation, /does not recreate the accounts-payable subledger/i);
  const firstCommit = await commitTransactionHistoryImport(db, { actor, entitlementTier:"parish", migrationSessionId:session.id, preview:history, advancedOptIn:true });
  const secondCommit = await commitTransactionHistoryImport(db, { actor, entitlementTier:"parish", migrationSessionId:session.id, preview:history, advancedOptIn:true });
  assert.equal(firstCommit.processed, 1, JSON.stringify(firstCommit));
  assert.equal(secondCommit.processed, 1);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) count FROM accounting_journal_entries WHERE source_type='migration_import'").get().count, 1);
  console.log("PASS - advanced transaction history states its limitation and is idempotent across retries");
}

{
  const guardDb = await initialized();
  const guardSession = await createMigrationSession(guardDb, { actor, entitlementTier:"parish", sourceSystem:"aplos" });
  const guardPreview = await previewChartOfAccountsCsv(guardDb, { actor, entitlementTier:"parish", filename:"chart.csv", csv:chartCsv });
  const draft = await createJournalDraft(guardDb, {
    actor, entryDate:"2026-07-15", description:"Existing real activity", sourceType:"manual",
    lines:[{ accountId:"acct_1010", fundId:"fund_general", debitAmount:1000 }, { accountId:"acct_4010", fundId:"fund_general", creditAmount:1000 }]
  });
  await postJournalEntry(guardDb, { actor, journalEntryId:draft.id, idempotencyKey:"existing-post", requestHash:"existing-post", expectedVersion:1 });
  await assert.rejects(() => commitChartOfAccountsImport(guardDb, {
    actor, entitlementTier:"parish", migrationSessionId:guardSession.id, preview:guardPreview, typeMap:{ Bank:"asset", Expense:"expense" }
  }), /already contains posted activity/);
  const acknowledged = await commitChartOfAccountsImport(guardDb, {
    actor, entitlementTier:"parish", migrationSessionId:guardSession.id, preview:guardPreview,
    typeMap:{ Bank:"asset", Expense:"expense" }, acknowledgeExistingActivity:true
  });
  assert.equal(acknowledged.mapped, 2);
  console.log("PASS - double-posting guard blocks by default and requires explicit acknowledgement");
}

{
  const openingDb = await initialized();
  await postOpeningBalanceBatch(openingDb, {
    actor, effectiveDate:"2026-07-15", description:"Existing caller compatibility",
    lines:[{ accountId:"acct_1010", fundId:"fund_general", debitAmount:500 }, { accountId:"acct_3990", fundId:"fund_general", creditAmount:500 }],
    idempotencyKey:"opening-default-source", requestHash:"opening-default-source"
  });
  assert.equal(openingDb.sqlite.prepare("SELECT source_system FROM accounting_opening_balance_batches WHERE id='opening-default-source'").get().source_system, "initialization");
  console.log("PASS - postOpeningBalanceBatch keeps initialization as its default source system");
}

{
  for (const route of [
    "/migration/chart-of-accounts/preview", "/migration/chart-of-accounts/commit", "/migration/vendors/preview", "/migration/vendors/commit",
    "/migration/funds/preview", "/migration/funds/commit", "/migration/opening-balance/preview", "/migration/opening-balance/commit",
    "/migration/transaction-history/preview", "/migration/transaction-history/commit"
  ]) assert.match(handlerSource, new RegExp(route.replaceAll("/", "\\/")));
  assert.match(handlerSource, /accounting\.migration\.import/);
  assert.ok(workerSource.indexOf("actions.handleAccountingMigration") < workerSource.indexOf("actions.handleAccountingLedger"));
  assert.match(handlerSource, /handleParishDashboard/);
  assert.match(handlerSource, /method:\s*"PATCH"/);
  assert.match(authorizationSource, /"accounting\.migration\.import"/);
  assert.match(capabilityMigration, /pm\.role_template='treasurer'/);
  assert.match(capabilityMigration, /accounting_staff_profiles/);
  assert.match(capabilityMigration, /role_template='treasurer'/);
  assert.doesNotMatch(capabilityMigration, /role_template='bookkeeper'/);
  const grants = [...authorizationSource.matchAll(/(\w+): \[([\s\S]*?)\n  \],/g)]
    .filter((match) => match[2].includes("accounting.migration.import")).map((match) => match[1]);
  assert.deepEqual(grants, ["treasurer"]);
  for (const copy of ["Move from QuickBooks or Aplos", "Start clean with an opening balance", "Import full transaction history (advanced)", "does not reconstruct the accounts-payable subledger"]) {
    assert.match(uiSource, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  assert.match(uiSource, /migrationSourceGuide\('aplos',\s*true\)\}\$\{migrationSourceGuide\('quickbooks'\)\}/, "source selection must visibly lead with the expanded Aplos guide while retaining QuickBooks");
  assert.match(uiSource, /const sourceGuides\s*=\s*`[\s\S]*migrationSourceGuide\('aplos',\s*session\.sourceSystem\s*===\s*'aplos'\)[\s\S]*migrationSourceGuide\('quickbooks',\s*session\.sourceSystem\s*===\s*'quickbooks'\)/, "active migration sessions must keep both source guides available");
  console.log("PASS - routes, treasurer-only capability, handler ordering, real PATCH dispatch, and both UI paths are present");
}

console.log("accounting-migration-import-tests.mjs OK");
