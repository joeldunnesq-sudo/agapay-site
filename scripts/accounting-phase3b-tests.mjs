import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  approveBudget,
  budgetReportCsv,
  budgetVsActual,
  copyBudget,
  councilBudgetPacket,
  createBudget,
  createJournalDraft,
  forecastBudget,
  initializeLedger,
  listBudgets,
  lockBudget,
  postJournalEntry,
  submitBudget,
  updateBudgetLine,
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
    id: "treasurer",
    type: "platform_user",
    capabilities: [
      "accounting.configure",
      "accounting.journals.create",
      "accounting.journals.post",
    "budgets.view",
    "budgets.manage",
    "budgets.approve",
    ],
  },
  approver = {
    id: "rector",
    type: "platform_user",
    capabilities: ["budgets.view", "budgets.approve", "budgets.lock"],
  };
await initializeLedger(db, {
  actor: creator,
  date: new Date("2026-01-15T00:00:00Z"),
});
s.exec(
  readFileSync(
    path.join(root, "accounting-migrations", "0009_phase3b_budgeting.sql"),
    "utf8",
  ),
);
let budget = await createBudget(db, {
  actor: creator,
  entitlementTier: "parish",
  input: {
    name: "2026 Operating Budget",
    fiscalYearId: "fy_2026",
    description: "Council operating plan",
    assumptions: [
      { title: "Utilities", description: "Expected seasonal increase" },
    ],
    lines: [
      {
        accountId: "acct_4010",
        fundId: "fund_general",
        annualAmount: 12000,
        allocationStrategy: "even_monthly",
      },
      {
        accountId: "acct_5830",
        fundId: "fund_general",
        annualAmount: 12000,
        monthlyAmounts: [
          1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000,
          1000,
        ],
        allocationStrategy: "manual",
      },
    ],
  },
});
assert.equal(budget.versionNumber, 1);
const lines = s
  .prepare("SELECT * FROM accounting_budget_lines ORDER BY account_id")
  .all();
assert.equal(
  lines[0].annual_amount,
  lines[0].january_amount +
    lines[0].february_amount +
    lines[0].march_amount +
    lines[0].april_amount +
    lines[0].may_amount +
    lines[0].june_amount +
    lines[0].july_amount +
    lines[0].august_amount +
    lines[0].september_amount +
    lines[0].october_amount +
    lines[0].november_amount +
    lines[0].december_amount,
);
await assert.rejects(
  () =>
    createBudget(db, {
      actor: creator,
      entitlementTier: "mission",
      input: { name: "No", fiscalYearId: "fy_2026" },
    }),
  /Parish Accounting/,
);
budget = await submitBudget(db, {
  actor: creator,
  entitlementTier: "parish",
  budgetId: budget.id,
  expectedVersion: 1,
});
await assert.rejects(
  () =>
    approveBudget(db, {
      actor: creator,
      entitlementTier: "parish",
      budgetId: budget.id,
      expectedVersion: 2,
    }),
  /sole approver/,
);
budget = await approveBudget(db, {
  actor: approver,
  entitlementTier: "parish",
  budgetId: budget.id,
  expectedVersion: 2,
});
budget = await lockBudget(db, {
  actor: approver,
  entitlementTier: "parish",
  budgetId: budget.id,
  expectedVersion: 3,
});
assert.equal(budget.status, "locked");
await assert.rejects(
  () =>
    updateBudgetLine(db, {
      actor: creator,
      entitlementTier: "parish",
      budgetId: budget.id,
      lineId: lines[0].id,
      expectedVersion: 1,
      input: { annualAmount: 13000 },
    }),
  /locked/,
);
const draft = await createJournalDraft(db, {
  actor: creator,
  entryDate: "2026-01-15",
  description: "January actuals",
  lines: [
    { accountId: "acct_1010", fundId: "fund_general", debitAmount: 1500 },
    { accountId: "acct_4010", fundId: "fund_general", creditAmount: 1500 },
    { accountId: "acct_5830", fundId: "fund_general", debitAmount: 800 },
    { accountId: "acct_1010", fundId: "fund_general", creditAmount: 800 },
  ],
});
await postJournalEntry(db, {
  actor: creator,
  journalEntryId: draft.id,
  idempotencyKey: "budget-actuals",
  requestHash: "h",
  expectedVersion: 1,
});
const report = await budgetVsActual(db, {
    actor: creator,
    entitlementTier: "parish",
    budgetId: budget.id,
    throughMonth: 1,
  }),
  revenue = report.rows.find((r) => r.accountId === "acct_4010"),
  expense = report.rows.find((r) => r.accountId === "acct_5830");
assert.equal(revenue.variance, 500);
assert.equal(revenue.varianceLabel, "favorable");
assert.equal(expense.variance, -200);
assert.equal(expense.varianceLabel, "favorable");
const forecast = await forecastBudget(db, {
  actor: creator,
  entitlementTier: "parish",
  budgetId: budget.id,
  throughMonth: 1,
});
assert.equal(forecast.forecastDoesNotModifyBudget, true);
assert.equal(revenue.forecast, 18000);
assert.match(budgetReportCsv(report), /Assessment/);
const packet = await councilBudgetPacket(db, {
  actor: creator,
  entitlementTier: "parish",
  budgetId: budget.id,
  throughMonth: 1,
});
assert.equal(packet.printReady, true);
assert.equal(packet.assumptions.length, 1);
const copied = await copyBudget(db, {
  actor: creator,
  entitlementTier: "parish",
  sourceBudgetId: budget.id,
  name: "2026 Revised",
});
assert.equal(copied.versionNumber, 2);
assert.equal(copied.status, "draft");
assert.equal(
  (
    await listBudgets(db, {
      actor: creator,
      entitlementTier: "parish",
      fiscalYearId: "fy_2026",
    })
  ).length,
  2,
);
assert.equal(
  s
    .prepare(
      "SELECT COUNT(*) count FROM accounting_budget_events WHERE event_type='budget_locked'",
    )
    .get().count,
  1,
);
console.log(
  "PASS - Phase 3B Parish budgets, versions, allocation, approval, locking, actuals, nonprofit variance, forecast, export, and council packet",
);
