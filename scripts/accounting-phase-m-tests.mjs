#!/usr/bin/env node
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { handleAccountingPayablesBudgets, parishCheckPayerIdentity } from "../src/handlers/accounting-payables-budgets.js";
import { reserveCheckNumbers, seedCheckPayerIdentity, vendor1099Summary, vendor1099SummaryCsv } from "../src/accounting/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const migration = read("accounting-migrations/0020_phase_m_payment_runs.sql");
const service = read("src/accounting/payables/service.js");
const handler = read("src/handlers/accounting-payables-budgets.js");
const parishApp = read("public/parish/app.js");
const has = (source, needles, label) => needles.forEach((needle) => assert.ok(source.includes(needle), `${label} must include ${needle}`));

has(migration, [
  "CREATE TABLE IF NOT EXISTS accounting_payment_runs",
  "CREATE TABLE IF NOT EXISTS accounting_payment_run_items",
  "CHECK(status IN('draft','posted','voided'))",
  "UNIQUE(payment_run_id, sequence)",
  "UNIQUE(payment_id)"
], "Phase M migration");
has(service, [
  "export async function reserveCheckNumbers",
  "export async function seedCheckPayerIdentity",
  "WHERE bank_account_id=? AND next_check_number=?",
  "export async function createPaymentRun",
  "export async function postPaymentRun",
  "export async function listPaymentRuns",
  "export async function paymentRunDetail",
  "export async function printPaymentRun",
  "export async function vendor1099Summary",
  "payment_method NOT IN ('debit_card','credit_card')",
  "60000"
], "Phase M payables service");
has(handler, [
  'path === "/payables/payment-runs"',
  "payment-runs\\/([^/]+)",
  'action === "post"',
  'action === "print"',
  'path === "/payables/1099-summary"',
  'path.startsWith("/payables/payment-runs") && method !== "GET"',
  '"ap.pay"',
  '"ap.view"',
  "parishCheckPayerIdentity",
  "seedParishCheckPayer"
], "Phase M routes and capabilities");
has(parishApp, [
  "function renderAccountingPaymentRuns",
  "function showAccountingPaymentRunForm",
  "function renderAccounting1099Review",
  "function downloadAccounting1099Review",
  "Checks ${start}",
  "not a filed or filing-ready"
], "Phase M Payables UI");

const unmatched = await handleAccountingPayablesBudgets(new Request("https://example.test/api/parish/dashboard/demo/accounting/not-phase-m"), {}, "demo");
assert.equal(unmatched, null, "payables/budgets handler must return null for unmatched paths");

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`
  CREATE TABLE accounting_bank_accounts(id TEXT PRIMARY KEY,name TEXT,is_active INTEGER,status TEXT);
  CREATE TABLE accounting_check_settings(
    bank_account_id TEXT PRIMARY KEY,
    next_check_number INTEGER NOT NULL DEFAULT 1000,
    check_style TEXT NOT NULL DEFAULT 'top_check_two_stubs',
    payer_name TEXT,
    payer_address TEXT,
    signature_line_1 TEXT,
    signature_line_2 TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT
  );
  CREATE TABLE accounting_vendors(id TEXT PRIMARY KEY,display_name TEXT,legal_name TEXT,tax_id_last4 TEXT,tax_classification TEXT,requires_1099_review INTEGER);
  CREATE TABLE accounting_payments(id TEXT PRIMARY KEY,vendor_id TEXT,payment_date TEXT,payment_method TEXT,status TEXT,total_amount INTEGER);
  INSERT INTO accounting_bank_accounts VALUES('bank_phase_m','Operating',1,'active');
`);
sqlite.exec(migration);
const prepare = (sql) => ({
  params: [],
  bind(...params) { this.params = params; return this; },
  async first() { return sqlite.prepare(sql).get(...this.params) || null; },
  async all() { return { results: sqlite.prepare(sql).all(...this.params) }; },
  async run() { const result = sqlite.prepare(sql).run(...this.params); return { meta: { changes: result.changes } }; }
});
const db = { prepare };
const payActor = { id: "phase-m-treasurer", type: "platform_user", capabilities: ["ap.pay", "ap.view"] };

const parishPayer = parishCheckPayerIdentity({
  parishName: "St. Fiacre Orthodox Church",
  addressLine1: "123 Parish Way",
  addressLine2: "Office 2",
  city: "Madison",
  state: "WI",
  postalCode: "53703",
  country: "US"
});
assert.deepEqual(parishPayer, {
  payerName: "St. Fiacre Orthodox Church",
  payerAddress: "123 Parish Way\nOffice 2\nMadison, WI 53703"
}, "check payer defaults must come from Parish Settings");

const seededSettings = await seedCheckPayerIdentity(db, {
  actor: payActor,
  entitlementTier: "parish",
  bankAccountId: "bank_phase_m",
  ...parishPayer
});
assert.equal(seededSettings.payerName, parishPayer.payerName);
assert.equal(seededSettings.payerAddress, parishPayer.payerAddress);
const preservedSettings = await seedCheckPayerIdentity(db, {
  actor: payActor,
  entitlementTier: "parish",
  bankAccountId: "bank_phase_m",
  payerName: "A renamed parish",
  payerAddress: "A different address"
});
assert.equal(preservedSettings.payerName, parishPayer.payerName, "a bank-specific payer name must not be overwritten");
assert.equal(preservedSettings.payerAddress, parishPayer.payerAddress, "a bank-specific payer address must not be overwritten");

const reservations = await Promise.all([
  reserveCheckNumbers(db, { actor: payActor, entitlementTier: "parish", bankAccountId: "bank_phase_m", count: 3 }),
  reserveCheckNumbers(db, { actor: payActor, entitlementTier: "parish", bankAccountId: "bank_phase_m", count: 2 })
]);
const ranges = [new Set(Array.from({ length: 3 }, (_, index) => reservations[0] + index)), new Set(Array.from({ length: 2 }, (_, index) => reservations[1] + index))];
assert.equal([...ranges[0]].some((number) => ranges[1].has(number)), false, "concurrent check reservations must not overlap");
assert.equal(sqlite.prepare("SELECT next_check_number FROM accounting_check_settings WHERE bank_account_id='bank_phase_m'").get().next_check_number, 1005);

sqlite.exec(`
  INSERT INTO accounting_vendors VALUES('vendor_threshold','Threshold Vendor','Threshold Vendor LLC','4321','llc',1);
  INSERT INTO accounting_vendors VALUES('vendor_close','Close Vendor',NULL,'9876','individual',1);
  INSERT INTO accounting_payments VALUES('payment_check','vendor_threshold','2026-02-01','check','posted',50000);
  INSERT INTO accounting_payments VALUES('payment_cash','vendor_threshold','2026-06-01','cash','cleared',15000);
  INSERT INTO accounting_payments VALUES('payment_card','vendor_threshold','2026-08-01','credit_card','posted',100000);
  INSERT INTO accounting_payments VALUES('payment_debit','vendor_threshold','2026-09-01','debit_card','posted',100000);
  INSERT INTO accounting_payments VALUES('payment_prior','vendor_threshold','2025-12-31','check','posted',100000);
  INSERT INTO accounting_payments VALUES('payment_close','vendor_close','2026-03-01','check','posted',59999);
`);
const report = await vendor1099Summary(db, { actor: payActor, entitlementTier: "parish", calendarYear: "2026" });
assert.equal(report.vendors.length, 2, "vendors below the threshold must remain visible");
assert.equal(report.vendors.find((vendor) => vendor.vendorId === "vendor_threshold").totalPaid, 65000, "card payments must be excluded");
assert.equal(report.vendors.find((vendor) => vendor.vendorId === "vendor_threshold").meetsThreshold, true);
assert.equal(report.vendors.find((vendor) => vendor.vendorId === "vendor_close").meetsThreshold, false);
assert.match(vendor1099SummaryCsv(report), /not a filed or filing-ready Form 1099-NEC/i);

console.log("Accounting Phase M payment-run and 1099 checks passed.");
