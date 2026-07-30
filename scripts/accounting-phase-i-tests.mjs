#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>readFileSync(path.join(root,file),"utf8");
const ledger=read("src/handlers/accounting-ledger.js");
const adjustments=read("src/handlers/accounting-adjustments.js");
const close=read("src/handlers/accounting-close.js");
const reconciliation=read("src/handlers/accounting-reconciliation-commerce.js");
const budgets=read("src/handlers/accounting-payables-budgets.js");
const worker=read("src/worker.js");
const app=read("public/parish/app.js");
const dashboard=read("public/parish/dashboard.html");
const has=(source,needles,label)=>needles.forEach(needle=>assert.ok(source.includes(needle),`${label} must include ${needle}`));

has(ledger,["reverseJournalEntry","action===\"reverse\"","accounting.journals.reverse","voidJournalDraft","action===\"void\"","accounting.journals.create","/ledger/opening-balances","accounting.opening_balances.manage","/ledger/initialize","accounting.configure","/ledger/status","/ledger/validate"],"ledger handler");
has(adjustments,["createAdjustment","postAdjustment","createAdjustmentTemplate","/adjustments","/adjustments/templates","accounting.close.adjust","accounting.close.view","accounting_adjustments","accounting_adjustment_templates"],"adjustments handler");
has(close,["archiveFiscalYear","reopenYearEndClose","accounting.year_end.execute","accounting.close.reopen","accountant-export|archive|reopen"],"close handler");
has(reconciliation,["updateBankAccount","/bank\\/accounts\\/([^/]+)","accounting.bank_accounts.manage","eligibleLedgerItems","eligible-items","accounting.reconciliation.view","postReconciliationAdjustment","adjustments","accounting.reconciliation.adjust","configureCommerceItem","/commerce/items","accounting.commerce.configure","previewCommerceBackfill","/commerce/backfill-preview","accounting.commerce.backfill"],"reconciliation and commerce handler");
has(budgets,["updateBudgetLine","/budgets\\/([^/]+)\\/lines\\/([^/]+)","budgets.manage"],"budgets handler");
has(worker,["import { handleAccountingAdjustments }","handleAccountingAdjustments(request, env, accountingParishId)"],"worker");
assert.ok(worker.indexOf("handleAccountingAdjustments(request, env, accountingParishId)")<worker.indexOf("handleAccountingLedger(request, env, accountingParishId)"),"adjustments must dispatch before the ledger fallback");
has(app,["reverseAccountingJournal","voidAccountingJournal","/ledger/opening-balances","/ledger/validate","createAccountingAdjustment","/adjustments/templates","editAccountingBankAccount","eligible-items","postAccountingReconciliationAdjustment","configureAccountingCommerceItem","previewAccountingCommerceBackfill","updateAccountingBudgetLine","archiveAccountingFiscalYear","reopenAccountingFiscalYear"],"Accounting UI");
has(dashboard,["data-accounting-view=\"banking\"","data-accounting-view=\"budgets\"","data-accounting-view=\"close\"","data-accounting-view=\"setup\""],"Accounting dashboard navigation");
console.log("Accounting Phase I route exposure checks passed.");
