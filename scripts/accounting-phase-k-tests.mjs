#!/usr/bin/env node
import { readParishDashboardSource } from './lib/parish-dashboard-source.mjs';
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  archiveAccount,
  archiveVendor,
  createBillDraft,
  createVendor,
  initializeLedger,
  unarchiveAccount,
  unarchiveVendor,
  updateVendor,
} from "../src/accounting/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const payablesHandler = read("src/handlers/accounting-payables-budgets.js");
const setupHandler = read("src/handlers/accounting-setup-reports.js");
const payablesService = read("src/accounting/payables/service.js");
const setupService = read("src/accounting/setup/service.js");
const parishApp = readParishDashboardSource();
const has = (source, needles, label) => needles.forEach((needle) => assert.ok(source.includes(needle), `${label} must include ${needle}`));

has(payablesHandler, ["/payables/vendors", "updateVendor", "archiveVendor", "unarchiveVendor", '"ap.enter"'], "vendor lifecycle routes");
has(setupHandler, ["archive|unarchive", "archiveAccount", "unarchiveAccount", '"accounting.configure"'], "account lifecycle routes");
has(payablesService, ["export async function updateVendor", "export async function archiveVendor", "export async function unarchiveVendor", "status NOT IN('paid','voided','rejected')"], "vendor lifecycle service");
has(setupService, ["export async function archiveAccount", "export async function unarchiveAccount", "default_expense_account_id", "p.status='open'", "accounting_bill_lines"], "account lifecycle service");
has(parishApp, ["showAccountingVendorForm", "beginAccountingVendorLifecycle", "changeAccountingVendorLifecycle", "beginAccountingAccountLifecycle", "changeAccountingAccountLifecycle", "accountCatalog", "vendor.status === 'active'"], "master-data lifecycle UI");

const sqlite = new DatabaseSync(":memory:");
for (const file of ["0001_accounting_database_foundation.sql", "0002_core_ledger.sql", "0003_phase2a_setup_configuration.sql"]) sqlite.exec(read(path.join("accounting-migrations", file)));
const prepare = (sql) => ({
  params: [],
  bind(...params) { this.params = params; return this; },
  async first() { return sqlite.prepare(sql).get(...this.params) || null; },
  async all() { return { results: sqlite.prepare(sql).all(...this.params) }; },
  async run() { const result = sqlite.prepare(sql).run(...this.params); return { meta: { changes: result.changes } }; },
});
const db = {
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
  },
};
const actor = { id: "phase-k-bookkeeper", type: "platform_user", capabilities: ["accounting.configure", "ap.view", "ap.enter"] };
await initializeLedger(db, { actor, date: new Date("2026-07-20T00:00:00Z") });
for (const file of ["0005_phase2c_reporting_indexes.sql", "0006_phase2d_give_stripe_integration.sql", "0007_phase2e_bank_reconciliation.sql", "0008_phase3a_accounts_payable.sql"]) sqlite.exec(read(path.join("accounting-migrations", file)));

const freeVendor = await createVendor(db, { actor, entitlementTier: "parish", input: { displayName: "Lifecycle Vendor" } });
const editedVendor = await updateVendor(db, { actor, entitlementTier: "parish", vendorId: freeVendor.id, expectedVersion: freeVendor.version, patch: { displayName: "Lifecycle Vendor Updated", taxIdLast4: "1234" } });
assert.equal(editedVendor.displayName, "Lifecycle Vendor Updated");
let archivedVendor = await archiveVendor(db, { actor, entitlementTier: "parish", vendorId: editedVendor.id, expectedVersion: editedVendor.version });
assert.equal(archivedVendor.status, "archived");
archivedVendor = await unarchiveVendor(db, { actor, entitlementTier: "parish", vendorId: archivedVendor.id, expectedVersion: archivedVendor.version });
assert.equal(archivedVendor.status, "active");

const openVendor = await createVendor(db, { actor, entitlementTier: "parish", input: { displayName: "Open Bill Vendor" } });
await createBillDraft(db, { actor, entitlementTier: "parish", input: { vendorId: openVendor.id, billDate: "2026-07-20", description: "Open lifecycle bill", lines: [{ description: "Open line", accountId: "acct_5830", fundId: "fund_general", quantity: 1, unitAmount: 1000 }] } });
await assert.rejects(() => archiveVendor(db, { actor, entitlementTier: "parish", vendorId: openVendor.id, expectedVersion: openVendor.version }), /open bill/i);

const insertAccount = (id, number) => sqlite.prepare(`INSERT INTO accounting_accounts(id,account_number,name,account_type_id,normal_balance,is_posting_account,is_active) VALUES(?,?,?,'type_expense','debit',1,1)`).run(id, number, `Lifecycle ${number}`);
insertAccount("acct_phase_k_free", "K900");
let account = await archiveAccount(db, { actor, entitlementTier: "parish", accountId: "acct_phase_k_free", expectedVersion: 1 });
assert.equal(account.isActive, false);
account = await unarchiveAccount(db, { actor, entitlementTier: "parish", accountId: account.id, expectedVersion: account.version });
assert.equal(account.isActive, true);

insertAccount("acct_phase_k_vendor", "K901");
sqlite.prepare("UPDATE accounting_vendors SET default_expense_account_id=? WHERE id=?").run("acct_phase_k_vendor", openVendor.id);
await assert.rejects(() => archiveAccount(db, { actor, entitlementTier: "parish", accountId: "acct_phase_k_vendor", expectedVersion: 1 }), /active vendor/i);

insertAccount("acct_phase_k_bill", "K902");
const billId = sqlite.prepare("SELECT id FROM accounting_bills WHERE vendor_id=?").get(openVendor.id).id;
sqlite.prepare("UPDATE accounting_bill_lines SET account_id=? WHERE bill_id=?").run("acct_phase_k_bill", billId);
await assert.rejects(() => archiveAccount(db, { actor, entitlementTier: "parish", accountId: "acct_phase_k_bill", expectedVersion: 1 }), /open bill/i);

insertAccount("acct_phase_k_posted", "K903");
const periodId = sqlite.prepare("SELECT id FROM accounting_periods WHERE status='open' LIMIT 1").get().id;
sqlite.prepare(`INSERT INTO accounting_journal_entries(id,entry_number,entry_date,posting_date,description,status,source_type,accounting_period_id,created_by_actor_type,created_by_actor_id,total_debits,total_credits) VALUES('journal_phase_k','JE-K','2026-07-20','2026-07-20','Phase K posted activity','draft','manual',?,'platform_user','phase-k-bookkeeper',100,100)`).run(periodId);
sqlite.prepare("INSERT INTO accounting_journal_lines(id,journal_entry_id,line_number,account_id,fund_id,debit_amount,credit_amount) VALUES('line_phase_k_1','journal_phase_k',1,'acct_phase_k_posted','fund_general',100,0)").run();
sqlite.prepare("INSERT INTO accounting_journal_lines(id,journal_entry_id,line_number,account_id,fund_id,debit_amount,credit_amount) VALUES('line_phase_k_2','journal_phase_k',2,'acct_1010','fund_general',0,100)").run();
sqlite.prepare("UPDATE accounting_journal_entries SET status='posted' WHERE id='journal_phase_k'").run();
await assert.rejects(() => archiveAccount(db, { actor, entitlementTier: "parish", accountId: "acct_phase_k_posted", expectedVersion: 1 }), /open fiscal period/i);

console.log("Accounting Phase K vendor and account lifecycle checks passed.");
