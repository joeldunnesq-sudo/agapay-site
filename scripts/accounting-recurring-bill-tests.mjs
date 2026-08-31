import { readParishDashboardSource } from './lib/parish-dashboard-source.mjs';
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createRecurringBillSchedule,
  createVendor,
  initializeLedger,
  listRecurringBillSchedules,
  processDueRecurringBills,
  updateRecurringBillSchedule
} from "../src/accounting/index.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const sqlite = new DatabaseSync(":memory:");
for (const file of [
  "accounting-migrations/0001_accounting_database_foundation.sql",
  "accounting-migrations/0002_core_ledger.sql",
  "accounting-migrations/0003_phase2a_setup_configuration.sql",
  "accounting-migrations/0008_phase3a_accounts_payable.sql",
  "accounting-migrations/0024_recurring_vendor_bills.sql"
]) sqlite.exec(read(file));

const prepare = (sql) => ({
  params: [],
  bind(...params) { this.params = params; return this; },
  async first() { return sqlite.prepare(sql).get(...this.params) || null; },
  async all() { return { results: sqlite.prepare(sql).all(...this.params) }; },
  async run() {
    const result = sqlite.prepare(sql).run(...this.params);
    return { success: true, meta: { changes: result.changes } };
  }
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
  }
};
const actor = {
  id: "bookkeeper",
  type: "platform_user",
  capabilities: ["accounting.configure", "accounting.view", "ap.view", "ap.enter"]
};
await initializeLedger(db, { actor, date: new Date("2026-07-30T00:00:00Z") });
const vendor = await createVendor(db, {
  actor,
  entitlementTier: "parish",
  input: {
    displayName: "Spectrum",
    defaultExpenseAccountId: "acct_5830",
    defaultFundId: "fund_general"
  }
});
const schedule = await createRecurringBillSchedule(db, {
  actor,
  entitlementTier: "parish",
  input: {
    vendorId: vendor.id,
    name: "Monthly internet",
    description: "Spectrum internet service",
    accountId: "acct_5830",
    fundId: "fund_general",
    amount: 12900,
    frequency: "monthly",
    nextBillDate: "2026-07-30"
  }
});
assert.equal(schedule.vendorName, "Spectrum");
assert.equal(schedule.status, "active");
assert.equal((await listRecurringBillSchedules(db, { actor, entitlementTier: "parish" })).length, 1);

const created = await processDueRecurringBills(db, {
  asOfDate: "2026-07-30",
  actor,
  entitlementTier: "parish"
});
assert.equal(created.length, 1);
assert.equal(created[0].status, "created");
const bill = sqlite.prepare(`SELECT b.status,b.bill_date,b.total_amount,l.account_id,l.fund_id
  FROM accounting_bills b JOIN accounting_bill_lines l ON l.bill_id=b.id`).get();
assert.deepEqual({ ...bill }, {
  status: "draft",
  bill_date: "2026-07-30",
  total_amount: 12900,
  account_id: "acct_5830",
  fund_id: "fund_general"
});
assert.equal(sqlite.prepare("SELECT next_bill_date FROM accounting_recurring_bill_schedules").get().next_bill_date, "2026-08-30");
assert.equal((await processDueRecurringBills(db, { asOfDate: "2026-07-30", actor, entitlementTier: "parish" })).length, 0);

const current = (await listRecurringBillSchedules(db, { actor, entitlementTier: "parish" }))[0];
await updateRecurringBillSchedule(db, {
  actor,
  entitlementTier: "parish",
  scheduleId: current.id,
  expectedVersion: current.version,
  patch: { status: "paused" }
});
assert.equal((await processDueRecurringBills(db, { asOfDate: "2026-08-30", actor, entitlementTier: "parish" })).length, 0);
console.log("PASS - recurring vendor schedules create reviewable draft bills idempotently and can be paused");

const app = readParishDashboardSource();
assert.match(app, /onchange="applyAccountingBillVendorDefaults\(this\)"/);
assert.match(app, /if \(vendor\.defaultExpenseAccountId.*form\.elements\.accountId/);
assert.match(app, /if \(vendor\.defaultFundId.*form\.elements\.fundId/);
assert.match(app, /Recurring bills/);
assert.match(app, /Nothing is approved, posted, or paid automatically/);
console.log("PASS - bill entry applies vendor defaults and Payables exposes recurring draft-bill schedules");

