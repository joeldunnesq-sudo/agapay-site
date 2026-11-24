import assert from "node:assert/strict";import{DatabaseSync}from"node:sqlite";import{readFileSync}from"node:fs";import path from"node:path";import{fileURLToPath}from"node:url";
import{commitBankImport,completeReconciliation,confirmReconciliationMatch,createBankAccount,createJournalDraft,createReconciliation,eligibleLedgerItems,initializeLedger,listBankAccounts,postJournalEntry,previewBankCsv,reconciliationCsv,reopenReconciliation,suggestMatches,validateReconciliation}from"../src/accounting/index.js";
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),".."),s=new DatabaseSync(":memory:");for(const f of["0001_accounting_database_foundation.sql","0002_core_ledger.sql","0003_phase2a_setup_configuration.sql","0005_phase2c_reporting_indexes.sql"]){s.exec(readFileSync(path.join(root,"accounting-migrations",f),"utf8"));}const prepare=q=>({_p:[],bind(...p){this._p=p;return this},async first(){return s.prepare(q).get(...this._p)||null},async all(){return{results:s.prepare(q).all(...this._p)}},async run(){const i=s.prepare(q).run(...this._p);return{meta:{changes:i.changes}}}}),db={prepare,async batch(a){s.exec("BEGIN");try{const r=[];for(const x of a)r.push(await x.run());s.exec("COMMIT");return r}catch(e){s.exec("ROLLBACK");throw e}}},actor={id:"treasurer",type:"platform_user",capabilities:["accounting.configure","accounting.journals.create","accounting.journals.post","accounting.bank_accounts.view","accounting.bank_accounts.manage","accounting.bank_imports.manage","accounting.reconciliation.view","accounting.reconciliation.create","accounting.reconciliation.match","accounting.reconciliation.complete","accounting.reconciliation.reopen"]};
await initializeLedger(db,{actor,date:new Date("2026-07-20T00:00:00Z")});s.exec(readFileSync(path.join(root,"accounting-migrations","0006_phase2d_give_stripe_integration.sql"),"utf8"));s.exec(readFileSync(path.join(root,"accounting-migrations","0007_phase2e_bank_reconciliation.sql"),"utf8"));
const bank=await createBankAccount(db,{actor,entitlementTier:"mission",input:{name:"Operating Checking",ledgerAccountId:"acct_1010",accountType:"checking",institutionName:"Community Bank",maskedLast4:"1234",currency:"USD",isDefault:true}});assert.equal(bank.maskedLast4,"1234");assert.equal((await listBankAccounts(db,{actor,entitlementTier:"parish"})).length,1);await assert.rejects(()=>createBankAccount(db,{actor,entitlementTier:"mission",input:{name:"Unsafe 123456789",ledgerAccountId:"acct_1110"}}),/Full bank account/);
const draft=await createJournalDraft(db,{actor,entryDate:"2026-07-20",description:"Stripe payout po_1",sourceType:"integration.stripe_payout_paid",sourceId:"payout_source",lines:[{accountId:"acct_1010",fundId:"fund_general",debitAmount:10000},{accountId:"acct_1110",fundId:"fund_general",creditAmount:10000}]});await postJournalEntry(db,{actor,journalEntryId:draft.id,idempotencyKey:"payout-post",requestHash:"h",expectedVersion:1});
const csv="date,description,amount,reference\n2026-07-20,STRIPE PAYOUT PO_1,100.00,po_1\n";const preview=await previewBankCsv({actor,entitlementTier:"mission",filename:"statement.csv",csv});assert.equal(preview.totalCredits,10000);assert.equal(preview.validRows,1);assert.equal(s.prepare("SELECT COUNT(*) count FROM accounting_bank_transactions").get().count,0);const imported=await commitBankImport(db,{actor,entitlementTier:"mission",bankAccountId:bank.id,preview});assert.equal(imported.importedCount,1);assert.equal((await commitBankImport(db,{actor,entitlementTier:"parish",bankAccountId:bank.id,preview})).duplicateFile,true);
const recon=await createReconciliation(db,{actor,entitlementTier:"mission",input:{bankAccountId:bank.id,startDate:"2026-07-01",endDate:"2026-07-31",beginningBalance:0,endingBalance:10000}});assert.equal(recon.difference,10000);const ledger=await eligibleLedgerItems(db,{actor,entitlementTier:"mission",reconciliationId:recon.id}),txn=s.prepare("SELECT id FROM accounting_bank_transactions").get();assert.equal(ledger.length,1);const suggestions=await suggestMatches(db,{actor,entitlementTier:"mission",reconciliationId:recon.id});assert.equal(suggestions[0].confidence,100);await confirmReconciliationMatch(db,{actor,entitlementTier:"mission",reconciliationId:recon.id,bankTransactionIds:[txn.id],journalLineIds:[ledger[0].journalLineId],matchType:"stripe_payout"});const validated=await validateReconciliation(db,{actor,entitlementTier:"parish",reconciliationId:recon.id});assert.equal(validated.difference,0);const complete=await completeReconciliation(db,{actor,entitlementTier:"mission",reconciliationId:recon.id,expectedVersion:1});assert.equal(complete.status,"completed");assert.match(reconciliationCsv(complete),/Difference/);assert.equal(s.prepare("SELECT COUNT(*) count FROM accounting_reconciliation_snapshots").get().count,1);const reopened=await reopenReconciliation(db,{actor,entitlementTier:"parish",reconciliationId:recon.id,expectedVersion:2,reason:"Statement correction"});assert.equal(reopened.status,"reopened");assert.equal(s.prepare("SELECT COUNT(*) count FROM accounting_reconciliation_snapshots").get().count,1);await assert.rejects(()=>listBankAccounts(db,{actor,entitlementTier:"core"}),/not included/);console.log("PASS - Phase 2E safe bank accounts, CSV preview/import dedupe, Stripe payout matching, zero-difference completion, snapshot, reopen, and tier parity");
const savingsInput = { name: 'Parish Savings', ledgerAccountId: 'new', accountType: 'savings' };
await assert.rejects(
  () => createBankAccount(db, { actor, entitlementTier: 'mission', input: savingsInput }),
  /accounting.accounts.manage|capability/i,
);
const savingsActor = { ...actor, capabilities: [...actor.capabilities, 'accounting.accounts.manage'] };
const savingsBank = await createBankAccount(db, { actor: savingsActor, entitlementTier: 'mission', input: savingsInput });
assert.equal(savingsBank.accountType, 'savings');
assert.notEqual(savingsBank.ledgerAccountId, bank.ledgerAccountId);
const savingsLedger = s.prepare('SELECT account_number, name, normal_balance FROM accounting_accounts WHERE id=?').get(savingsBank.ledgerAccountId);
assert.equal(savingsLedger.name, 'Parish Savings');
assert.equal(savingsLedger.normal_balance, 'debit');
assert.match(savingsLedger.account_number, /^10[3-9]\d$/);
const { recordSimpleDeposit } = await import('../src/accounting/index.js');
await recordSimpleDeposit(db, {
  actor: savingsActor, entryDate: '2026-07-22', description: 'Parish savings check deposit',
  depositAccountId: savingsBank.ledgerAccountId, revenueAccountId: 'acct_4010', fundId: 'fund_general', amount: 2500,
});
const savingsSession = await createReconciliation(db, {
  actor: savingsActor, entitlementTier: 'mission',
  input: { bankAccountId: savingsBank.id, startDate: '2026-07-01', endDate: '2026-07-31', beginningBalance: 0, endingBalance: 2500 },
});
const savingsItems = await eligibleLedgerItems(db, { actor: savingsActor, entitlementTier: 'mission', reconciliationId: savingsSession.id });
assert.equal(savingsItems.length, 1);
assert.equal(savingsItems[0].netEffect, 2500);
console.log('PASS - authorized savings setup creates a separate cash ledger and the deposited check appears in its reconciliation');
const { recordSplitDeposit } = await import('../src/accounting/index.js');
const splitCheck = {
  actor: savingsActor,
  entryDate: '2026-07-23',
  description: 'Check split between checking and savings',
  depositAccountId: bank.ledgerAccountId,
  secondDepositAccountId: savingsBank.ledgerAccountId,
  secondDepositAmount: 4000,
  amount: 10000,
  splits: [{ revenueAccountId: 'acct_4010', fundId: 'fund_general', amount: 10000 }],
};
const entriesBefore = s.prepare('SELECT COUNT(*) AS count FROM accounting_journal_entries').get().count;
await assert.rejects(() => recordSplitDeposit(db, { ...splitCheck, secondDepositAccountId: bank.ledgerAccountId }), /two different bank accounts/);
await assert.rejects(() => recordSplitDeposit(db, { ...splitCheck, secondDepositAmount: 10000 }), /less than the check total/);
await assert.rejects(() => recordSplitDeposit(db, { ...splitCheck, secondDepositAccountId: 'acct_1100' }), /active bank accounts/);
assert.equal(s.prepare('SELECT COUNT(*) AS count FROM accounting_journal_entries').get().count, entriesBefore);
const checkEntry = await recordSplitDeposit(db, splitCheck);
assert.equal(checkEntry.status, 'posted');
const lines = s.prepare('SELECT account_id, debit_amount, credit_amount FROM accounting_journal_lines WHERE journal_entry_id=? ORDER BY line_number')
  .all(checkEntry.id).map((line) => [line.account_id, line.debit_amount, line.credit_amount]);
assert.deepEqual(lines, [[bank.ledgerAccountId, 6000, 0], [savingsBank.ledgerAccountId, 4000, 0], ['acct_4010', 0, 10000]]);
for (const [reconciliationId, netEffect] of [[reopened.id, 6000], [savingsSession.id, 4000]]) {
  const entries = await eligibleLedgerItems(db, { actor: savingsActor, entitlementTier: 'mission', reconciliationId });
  assert.equal(entries.find((entry) => entry.journalEntryId === checkEntry.id)?.netEffect, netEffect);
}
console.log('PASS - one check posts income once and exposes only each bank account’s portion for reconciliation');
