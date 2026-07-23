import { AccountingDatabaseError, ValidationError } from "../errors.js";
import { createJournalDraft, postJournalEntry } from "../ledger/service.js";

const DATE=/^\d{4}-\d{2}-\d{2}$/;
const FREQUENCIES=new Set(["weekly","biweekly","monthly","quarterly","annual"]);
const id=(prefix)=>`${prefix}_${crypto.randomUUID()}`;
const text=(value)=>String(value??"").trim();
const first=(db,sql,...params)=>db.prepare(sql).bind(...params).first();
const all=async(db,sql,...params)=>(await db.prepare(sql).bind(...params).all()).results||[];
const run=(db,sql,...params)=>db.prepare(sql).bind(...params).run();

function requireCapability(actor,capability){
  if(!actor?.id||!actor.capabilities?.includes(capability))throw new AccountingDatabaseError("Recurring transaction capability is required.",{details:{capability}});
}
function dto(row){return row&&Object.freeze({
  id:row.id,name:row.name,payee:row.payee,description:row.description||"",
  registerAccountId:row.register_account_id,registerAccount:row.register_account||"",
  expenseAccountId:row.expense_account_id,expenseAccount:row.expense_account||"",
  fundId:row.fund_id,fund:row.fund||"",amount:Number(row.amount),frequency:row.frequency,
  nextPostingDate:row.next_posting_date,endDate:row.end_date||"",status:row.status,
  lastPostedDate:row.last_posted_date||"",lastError:row.last_error||"",version:Number(row.version)
});}
const SELECT=`SELECT r.*,ra.account_number||' · '||ra.name register_account,
  ea.account_number||' · '||ea.name expense_account,f.code||' · '||f.name fund
  FROM accounting_recurring_transactions r
  JOIN accounting_accounts ra ON ra.id=r.register_account_id
  JOIN accounting_accounts ea ON ea.id=r.expense_account_id
  JOIN accounting_funds f ON f.id=r.fund_id`;

async function validateReferences(db,{registerAccountId,expenseAccountId,fundId}){
  const register=await first(db,`SELECT a.id,t.category FROM accounting_accounts a JOIN accounting_account_types t ON t.id=a.account_type_id WHERE a.id=? AND a.is_active=1 AND a.archived_at IS NULL`,registerAccountId);
  const expense=await first(db,`SELECT a.id,t.category FROM accounting_accounts a JOIN accounting_account_types t ON t.id=a.account_type_id WHERE a.id=? AND a.is_active=1 AND a.archived_at IS NULL`,expenseAccountId);
  const fund=await first(db,"SELECT id FROM accounting_funds WHERE id=? AND is_active=1 AND archived_at IS NULL",fundId);
  if(!register||!["asset","liability"].includes(register.category))throw new ValidationError("Choose an active cash, bank, asset, or liability register account.");
  if(!expense||expense.category!=="expense")throw new ValidationError("Choose an active expense account.");
  if(!fund)throw new ValidationError("Choose an active fund.");
}
function validated(input){
  const value={name:text(input.name).slice(0,120),payee:text(input.payee).slice(0,120),description:text(input.description).slice(0,240),registerAccountId:text(input.registerAccountId),expenseAccountId:text(input.expenseAccountId),fundId:text(input.fundId),amount:Number(input.amount),frequency:text(input.frequency),nextPostingDate:text(input.nextPostingDate),endDate:text(input.endDate)};
  if(!value.name||!value.payee||!value.registerAccountId||!value.expenseAccountId||!value.fundId||!Number.isSafeInteger(value.amount)||value.amount<=0||!FREQUENCIES.has(value.frequency)||!DATE.test(value.nextPostingDate)||value.endDate&&!DATE.test(value.endDate))throw new ValidationError("Name, payee, accounts, fund, positive amount, frequency, and next posting date are required.");
  if(value.endDate&&value.endDate<value.nextPostingDate)throw new ValidationError("The end date cannot be before the next posting date.");
  return value;
}
export async function listRecurringTransactions(db,{actor}){
  requireCapability(actor,"accounting.view");
  return Object.freeze((await all(db,`${SELECT} ORDER BY CASE r.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,r.next_posting_date,r.name`)).map(dto));
}
export async function createRecurringTransaction(db,{actor,input}){
  requireCapability(actor,"accounting.journals.create");const value=validated(input);await validateReferences(db,value);const recurringId=id("recurring");
  await run(db,`INSERT INTO accounting_recurring_transactions
    (id,name,payee,description,register_account_id,expense_account_id,fund_id,amount,frequency,next_posting_date,end_date,created_by_actor_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,recurringId,value.name,value.payee,value.description||null,value.registerAccountId,value.expenseAccountId,value.fundId,value.amount,value.frequency,value.nextPostingDate,value.endDate||null,actor.id);
  return dto(await first(db,`${SELECT} WHERE r.id=?`,recurringId));
}
export async function updateRecurringTransaction(db,{actor,recurringId,expectedVersion,patch}){
  requireCapability(actor,"accounting.journals.create");const current=await first(db,"SELECT * FROM accounting_recurring_transactions WHERE id=?",recurringId);if(!current)throw new ValidationError("Recurring transaction was not found.");if(Number(current.version)!==Number(expectedVersion))throw new AccountingDatabaseError("Recurring transaction changed. Reload and try again.",{details:{conflict:true}});
  const status=text(patch.status||current.status);if(!["active","paused","completed"].includes(status))throw new ValidationError("Recurring transaction status is invalid.");
  const value=validated({name:patch.name??current.name,payee:patch.payee??current.payee,description:patch.description??current.description,registerAccountId:patch.registerAccountId??current.register_account_id,expenseAccountId:patch.expenseAccountId??current.expense_account_id,fundId:patch.fundId??current.fund_id,amount:patch.amount??current.amount,frequency:patch.frequency??current.frequency,nextPostingDate:patch.nextPostingDate??current.next_posting_date,endDate:patch.endDate??current.end_date});
  await validateReferences(db,value);
  const result=await run(db,`UPDATE accounting_recurring_transactions SET name=?,payee=?,description=?,register_account_id=?,expense_account_id=?,fund_id=?,amount=?,frequency=?,next_posting_date=?,end_date=?,status=?,last_error=NULL,version=version+1,updated_at=datetime('now') WHERE id=? AND version=?`,value.name,value.payee,value.description||null,value.registerAccountId,value.expenseAccountId,value.fundId,value.amount,value.frequency,value.nextPostingDate,value.endDate||null,status,recurringId,Number(expectedVersion));
  if(!result.meta?.changes)throw new AccountingDatabaseError("Recurring transaction changed. Reload and try again.",{details:{conflict:true}});
  return dto(await first(db,`${SELECT} WHERE r.id=?`,recurringId));
}
function advance(date,frequency){
  const current=new Date(`${date}T00:00:00Z`);
  if(frequency==="weekly"||frequency==="biweekly"){current.setUTCDate(current.getUTCDate()+(frequency==="weekly"?7:14));return current.toISOString().slice(0,10);}
  const months={monthly:1,quarterly:3,annual:12}[frequency],day=current.getUTCDate(),target=new Date(Date.UTC(current.getUTCFullYear(),current.getUTCMonth()+months,1)),last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();target.setUTCDate(Math.min(day,last));return target.toISOString().slice(0,10);
}
export async function processDueRecurringTransactions(db,{asOfDate,actor,maxPostings=100}){
  requireCapability(actor,"accounting.journals.post");if(!DATE.test(asOfDate))throw new ValidationError("A valid recurring-transaction processing date is required.");
  const due=await all(db,"SELECT * FROM accounting_recurring_transactions WHERE status='active' AND next_posting_date<=? ORDER BY next_posting_date,id LIMIT ?",asOfDate,Math.max(1,Math.min(500,Number(maxPostings)||100))),results=[];
  for(const schedule of due){
    const scheduledDate=schedule.next_posting_date,prior=await first(db,"SELECT * FROM accounting_recurring_executions WHERE recurring_transaction_id=? AND scheduled_date=?",schedule.id,scheduledDate);
    if(prior?.status==="posted"){const next=advance(scheduledDate,schedule.frequency);await run(db,"UPDATE accounting_recurring_transactions SET next_posting_date=?,status=CASE WHEN end_date IS NOT NULL AND end_date<? THEN 'completed' ELSE status END,updated_at=datetime('now') WHERE id=?",next,next,schedule.id);continue;}
    try{
      const elevated={...actor,capabilities:[...new Set([...(actor.capabilities||[]),"accounting.journals.create","accounting.journals.post"])]},description=`Recurring · ${schedule.payee} · ${schedule.description||schedule.name}`;
      const lines=[{accountId:schedule.expense_account_id,fundId:schedule.fund_id,description,debitAmount:Number(schedule.amount)},{accountId:schedule.register_account_id,fundId:schedule.fund_id,description,creditAmount:Number(schedule.amount)}];
      const draft=await createJournalDraft(db,{actor:elevated,entryDate:scheduledDate,description,sourceType:"recurring_expense",sourceId:`${schedule.id}:${scheduledDate}`,lines});
      const key=`recurring:${schedule.id}:${scheduledDate}`,posted=await postJournalEntry(db,{actor:elevated,journalEntryId:draft.id,idempotencyKey:key,requestHash:key,expectedVersion:draft.version});
      if(prior)await run(db,"UPDATE accounting_recurring_executions SET journal_entry_id=?,status='posted',error_message=NULL WHERE id=?",posted.id,prior.id);else await run(db,"INSERT INTO accounting_recurring_executions(id,recurring_transaction_id,scheduled_date,journal_entry_id,status) VALUES(?,?,?,?,'posted')",id("recurring_run"),schedule.id,scheduledDate,posted.id);
      const next=advance(scheduledDate,schedule.frequency),completed=Boolean(schedule.end_date&&next>schedule.end_date);
      await run(db,"UPDATE accounting_recurring_transactions SET next_posting_date=?,last_posted_date=?,last_error=NULL,status=?,version=version+1,updated_at=datetime('now') WHERE id=?",next,scheduledDate,completed?"completed":"active",schedule.id);
      results.push({id:schedule.id,scheduledDate,status:"posted",journalEntryId:posted.id});
    }catch(error){
      const message=text(error?.message||error).slice(0,500);if(prior)await run(db,"UPDATE accounting_recurring_executions SET status='failed',error_message=? WHERE id=?",message,prior.id);else await run(db,"INSERT INTO accounting_recurring_executions(id,recurring_transaction_id,scheduled_date,status,error_message) VALUES(?,?,?,'failed',?)",id("recurring_run"),schedule.id,scheduledDate,message);
      await run(db,"UPDATE accounting_recurring_transactions SET last_error=?,updated_at=datetime('now') WHERE id=?",message,schedule.id);results.push({id:schedule.id,scheduledDate,status:"failed",error:message});
    }
  }
  return Object.freeze(results);
}
