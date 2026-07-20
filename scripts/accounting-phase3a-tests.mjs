import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  accountsPayableAging,
  approveBill,
  createBankAccount,
  createBillDraft,
  createPayment,
  createVendor,
  initializeLedger,
  listVendors,
  payablesOverview,
  postBill,
  postPayment,
  statementOfActivities,
  submitBill,
} from "../src/accounting/index.js";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), ".."),
  s = new DatabaseSync(":memory:");
for (const f of [
  "0001_accounting_database_foundation.sql",
  "0002_core_ledger.sql",
  "0003_phase2a_setup_configuration.sql",
  "0005_phase2c_reporting_indexes.sql",
]) {
  s.exec(readFileSync(path.join(root, "accounting-migrations", f), "utf8"));
}
const prepare = (q) => ({
    _p: [],
    bind(...p) {
      this._p = p;
      return this;
    },
    async first() {
      return s.prepare(q).get(...this._p) || null;
    },
    async all() {
      return { results: s.prepare(q).all(...this._p) };
    },
    async run() {
      const i = s.prepare(q).run(...this._p);
      return { meta: { changes: i.changes } };
    },
  }),
  db = {
    prepare,
    async batch(a) {
      s.exec("BEGIN");
      try {
        const r = [];
        for (const x of a) r.push(await x.run());
        s.exec("COMMIT");
        return r;
      } catch (e) {
        s.exec("ROLLBACK");
        throw e;
      }
    },
  },
  creator = {
    id: "bookkeeper",
    type: "platform_user",
    capabilities: [
    "accounting.configure",
    "ap.view",
    "ap.enter",
    "ap.approve",
    "ap.pay",
      "accounting.bank_accounts.manage",
    ],
  },
  approver = {
    id: "treasurer",
    type: "platform_user",
    capabilities: ["ap.view", "ap.approve", "ap.pay", "accounting.view"],
  };
await initializeLedger(db, {
  actor: creator,
  date: new Date("2026-07-20T00:00:00Z"),
});
for (const f of [
  "0006_phase2d_give_stripe_integration.sql",
  "0007_phase2e_bank_reconciliation.sql",
  "0008_phase3a_accounts_payable.sql",
])
  s.exec(readFileSync(path.join(root, "accounting-migrations", f), "utf8"));
const bank = await createBankAccount(db, {
    actor: creator,
    entitlementTier: "mission",
    input: {
      name: "Operating Checking",
      ledgerAccountId: "acct_1010",
      accountType: "checking",
      maskedLast4: "1234",
      isDefault: true,
    },
  }),
  vendor = await createVendor(db, {
    actor: creator,
    entitlementTier: "parish",
    input: {
      displayName: "City Electric",
      vendorType: "utility",
      defaultExpenseAccountId: "acct_5830",
      defaultFundId: "fund_general",
      taxIdLast4: "9876",
    },
  });
assert.equal(
  (await listVendors(db, { actor: creator, entitlementTier: "parish" })).length,
  1,
);
await assert.rejects(
  () => listVendors(db, { actor: creator, entitlementTier: "mission" }),
  /Parish Accounting/,
);
let bill = await createBillDraft(db, {
  actor: creator,
  entitlementTier: "parish",
  input: {
    vendorId: vendor.id,
    vendorInvoiceNumber: "INV-100",
    billDate: "2026-07-20",
    description: "Electric service",
    lines: [
      {
        description: "Utilities",
        accountId: "acct_5830",
        fundId: "fund_general",
        quantity: 1,
        unitAmount: 10000,
      },
    ],
  },
});
bill = await submitBill(db, {
  actor: creator,
  entitlementTier: "parish",
  billId: bill.id,
  expectedVersion: 1,
});
await assert.rejects(
  () =>
    approveBill(db, {
      actor: creator,
      entitlementTier: "parish",
      billId: bill.id,
      expectedVersion: 2,
    }),
  /sole approver/,
);
bill = await approveBill(db, {
  actor: approver,
  entitlementTier: "parish",
  billId: bill.id,
  expectedVersion: 2,
});
bill = await postBill(db, {
  actor: approver,
  entitlementTier: "parish",
  billId: bill.id,
  expectedVersion: 3,
  idempotencyKey: "post",
});
assert.equal(bill.status, "posted");
const activity = await statementOfActivities(db, {
  actor: approver,
  startDate: "2026-07-01",
  endDate: "2026-07-31",
});
assert.equal(activity.totals.expenses, 10000);
let payment = await createPayment(db, {
  actor: creator,
  entitlementTier: "parish",
  input: {
    vendorId: vendor.id,
    paymentDate: "2026-07-20",
    paymentMethod: "check",
    bankAccountId: bank.id,
    checkNumber: "1001",
    applications: [{ billId: bill.id, amountApplied: 4000 }],
  },
});
payment = await postPayment(db, {
  actor: creator,
  entitlementTier: "parish",
  paymentId: payment.id,
  expectedVersion: 1,
  idempotencyKey: "pay",
});
assert.equal(payment.status, "posted");
const paidBill = s
  .prepare(
    "SELECT status,amount_paid,amount_due FROM accounting_bills WHERE id=?",
  )
  .get(bill.id);
assert.equal(paidBill.status, "partially_paid");
assert.equal(paidBill.amount_paid, 4000);
assert.equal(paidBill.amount_due, 6000);
const aging = await accountsPayableAging(db, {
  actor: approver,
  entitlementTier: "parish",
  asOfDate: "2026-08-31",
});
assert.equal(aging.totalDue, 6000);
assert.equal(
  (
    await payablesOverview(db, {
      actor: approver,
      entitlementTier: "parish",
      asOfDate: "2026-08-31",
    })
  ).openPayables,
  6000,
);
assert.equal(
  s
    .prepare(
      "SELECT COUNT(*) count FROM accounting_journal_entries WHERE status='posted'",
    )
    .get().count,
  2,
);
console.log(
  "PASS - Phase 3A Parish-only vendors, accrual bills, approval separation, AP posting, partial payments, bank integration, and aging",
);
