import { AccountingDatabaseError, ValidationError } from "../errors.js";

const REQUIRED_TYPES = Object.freeze([
  ["type_asset","ASSET","Assets","asset","debit","balance_sheet",10],
  ["type_liability","LIABILITY","Liabilities","liability","credit","balance_sheet",20],
  ["type_net_asset","NET_ASSET","Net Assets","net_asset","credit","balance_sheet",30],
  ["type_revenue","REVENUE","Revenue","revenue","credit","activity_statement",40],
  ["type_expense","EXPENSE","Expenses","expense","debit","activity_statement",50]
]);

const DEFAULT_ACCOUNTS = Object.freeze([
  ["acct_1000","1000","Cash and Cash Equivalents","type_asset",0,1],["acct_1010","1010","Operating Checking","type_asset",1,1],
  ["acct_1100","1100","Undeposited Funds","type_asset",1,1],["acct_2000","2000","Accounts Payable","type_liability",1,0],
  ["acct_3000","3000","Net Assets Without Donor Restrictions","type_net_asset",1,1],["acct_3100","3100","Net Assets With Donor Restrictions","type_net_asset",1,0],
  ["acct_3990","3990","Opening Balance Net Assets","type_net_asset",1,1],["acct_4000","4000","Stewardship and Tithes","type_revenue",1,0],
  ["acct_4010","4010","General Donations","type_revenue",1,0],["acct_4030","4030","Candle Donations","type_revenue",1,0],
  ["acct_4040","4040","Commemoration Donations","type_revenue",1,0],["acct_4300","4300","Bookstore Revenue","type_revenue",1,0],
  ["acct_5000","5000","Clergy Compensation","type_expense",1,0],["acct_5100","5100","Liturgical Supplies","type_expense",1,0],
  ["acct_5200","5200","Building and Property","type_expense",1,0],["acct_5300","5300","Diocesan Assessments","type_expense",1,0],
  ["acct_5400","5400","Missions and Charitable Giving","type_expense",1,0],["acct_5500","5500","Education and Church School","type_expense",1,0],
  ["acct_5600","5600","Hospitality and Fellowship","type_expense",1,0],["acct_5700","5700","Bookstore Cost of Goods Sold","type_expense",1,0],
  ["acct_5800","5800","Professional and Administrative","type_expense",0,0],["acct_5810","5810","Accounting","type_expense",1,0],
  ["acct_5830","5830","Software and Technology","type_expense",1,0],["acct_5840","5840","Bank and Payment Processing Fees","type_expense",1,0],
  ["acct_5850","5850","AGAPAY Platform Fees","type_expense",1,1]
]);

function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }
function requireCapability(actor, capability) {
  if (!actor?.id || !Array.isArray(actor.capabilities) || !actor.capabilities.includes(capability)) throw new AccountingDatabaseError("Accounting capability is required.", { details: { capability } });
}
async function first(db, sql, ...params) { return db.prepare(sql).bind(...params).first(); }
async function all(db, sql, ...params) { return (await db.prepare(sql).bind(...params).all()).results || []; }
async function run(db, sql, ...params) { return db.prepare(sql).bind(...params).run(); }
function safeEntry(row) { return row && Object.freeze({ id: row.id, entryNumber: row.entry_number || "", entryDate: row.entry_date, postingDate: row.posting_date || "", description: row.description, status: row.status, sourceType: row.source_type, totalDebits: Number(row.total_debits), totalCredits: Number(row.total_credits), currency: row.currency, version: Number(row.version), postedAt: row.posted_at || "" }); }

export async function initializeLedger(db, { actor, date = new Date(), correlationId = "" } = {}) {
  requireCapability(actor, "accounting.configure");
  const existing = await first(db, "SELECT value FROM accounting_database_metadata WHERE key='ledger_initialization_state'");
  if (existing?.value === "initialized") return ledgerInitializationStatus(db);
  await run(db, "INSERT INTO accounting_database_metadata(key,value) VALUES('ledger_initialization_state','initializing') ON CONFLICT(key) DO UPDATE SET value='initializing',updated_at=datetime('now')");
  try {
    for (const type of REQUIRED_TYPES) await run(db, `INSERT OR IGNORE INTO accounting_account_types(id,code,name,category,normal_balance,statement_type,sort_order,is_system) VALUES(?,?,?,?,?,?,?,1)`, ...type);
    for (const account of DEFAULT_ACCOUNTS) {
      const type = REQUIRED_TYPES.find((item) => item[0] === account[3]);
      await run(db, `INSERT OR IGNORE INTO accounting_accounts(id,account_number,name,account_type_id,normal_balance,is_posting_account,is_system,requires_fund) VALUES(?,?,?,?,?,?,?,1)`, account[0],account[1],account[2],account[3],type[4],account[4],account[5]);
    }
    await run(db, `INSERT OR IGNORE INTO accounting_funds(id,code,name,restriction_type,is_default,is_active,is_system) VALUES('fund_general','GENERAL','General Operating Fund','unrestricted',1,1,1)`);
    const year = date.getUTCFullYear();
    const yearId = `fy_${year}`;
    await run(db, `INSERT OR IGNORE INTO accounting_fiscal_years(id,name,start_date,end_date,status,is_current) VALUES(?,?,?,?, 'open',1)`, yearId,String(year),`${year}-01-01`,`${year}-12-31`);
    for (let month=1; month<=12; month++) {
      const start = `${year}-${String(month).padStart(2,"0")}-01`;
      const endDate = new Date(Date.UTC(year,month,0)).getUTCDate();
      const end = `${year}-${String(month).padStart(2,"0")}-${endDate}`;
      await run(db, `INSERT OR IGNORE INTO accounting_periods(id,fiscal_year_id,period_number,name,start_date,end_date,status,opened_at) VALUES(?,?,?,?,?,?,?,?)`, `period_${year}_${month}`,yearId,month,new Date(Date.UTC(year,month-1,1)).toLocaleString("en",{month:"long",timeZone:"UTC"}),start,end,month === date.getUTCMonth()+1 ? "open" : "future",month === date.getUTCMonth()+1 ? now() : null);
    }
    await run(db, "INSERT INTO accounting_database_metadata(key,value) VALUES('ledger_schema_version','1') ON CONFLICT(key) DO UPDATE SET value='1',updated_at=datetime('now')");
    await run(db, "INSERT INTO accounting_database_metadata(key,value) VALUES('ledger_initialization_state','initialized') ON CONFLICT(key) DO UPDATE SET value='initialized',updated_at=datetime('now')");
    await run(db, `INSERT INTO accounting_ledger_events(id,event_type,actor_type,actor_id,correlation_id) VALUES(?,?,?,?,?)`, id("event"),"ledger.initialized",actor.type || "platform_user",actor.id,correlationId || null);
    return ledgerInitializationStatus(db);
  } catch (error) {
    await run(db, "INSERT INTO accounting_database_metadata(key,value) VALUES('ledger_initialization_state','failed') ON CONFLICT(key) DO UPDATE SET value='failed',updated_at=datetime('now')");
    throw error;
  }
}

export async function ledgerInitializationStatus(db) {
  const state = await first(db, "SELECT value FROM accounting_database_metadata WHERE key='ledger_initialization_state'");
  const version = await first(db, "SELECT value FROM accounting_database_metadata WHERE key='ledger_schema_version'");
  return Object.freeze({ state: state?.value || "not_initialized", schemaVersion: Number(version?.value || 0), operational: state?.value === "initialized" });
}

export async function createJournalDraft(db, { actor, entryDate, description, sourceType = "manual", sourceId = null, lines, correlationId = "" }) {
  requireCapability(actor, "accounting.journals.create");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate || "")) throw new ValidationError("A valid entry date is required.");
  if (!description || !Array.isArray(lines) || lines.length < 2) throw new ValidationError("A description and at least two lines are required.");
  const entryId = id("entry");
  await run(db, `INSERT INTO accounting_journal_entries(id,entry_date,description,status,source_type,source_id,created_by_actor_type,created_by_actor_id,correlation_id) VALUES(?,?,?,'draft',?,?,?,?,?)`, entryId,entryDate,description,sourceType,sourceId,actor.type || "platform_user",actor.id,correlationId || null);
  for (let index=0; index<lines.length; index++) {
    const line=lines[index], debit=Number(line.debitAmount||0), credit=Number(line.creditAmount||0);
    if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit) || debit < 0 || credit < 0 || (debit > 0) === (credit > 0)) throw new ValidationError("Each line must contain one positive integer debit or credit amount.");
    await run(db, `INSERT INTO accounting_journal_lines(id,journal_entry_id,line_number,account_id,fund_id,description,debit_amount,credit_amount) VALUES(?,?,?,?,?,?,?,?)`, id("line"),entryId,index+1,line.accountId,line.fundId,line.description || null,debit,credit);
  }
  await run(db, `INSERT INTO accounting_ledger_events(id,event_type,journal_entry_id,actor_type,actor_id,correlation_id) VALUES(?,?,?,?,?,?)`,id("event"),"journal_entry.created",entryId,actor.type || "platform_user",actor.id,correlationId || null);
  return safeEntry(await first(db,"SELECT * FROM accounting_journal_entries WHERE id=?",entryId));
}

export async function validateJournalEntryForPosting(db, { journalEntryId, expectedVersion }) {
  const entry = await first(db,"SELECT * FROM accounting_journal_entries WHERE id=?",journalEntryId);
  const issues=[];
  if (!entry) return { ok:false, issues:["entry_missing"] };
  if (!['draft','pending'].includes(entry.status)) issues.push("entry_not_postable");
  if (expectedVersion !== undefined && Number(expectedVersion)!==Number(entry.version)) issues.push("stale_version");
  const lines=await all(db,`SELECT l.*,a.is_posting_account,a.is_active account_active,a.archived_at account_archived,f.is_active fund_active,f.archived_at fund_archived FROM accounting_journal_lines l LEFT JOIN accounting_accounts a ON a.id=l.account_id LEFT JOIN accounting_funds f ON f.id=l.fund_id WHERE l.journal_entry_id=? ORDER BY l.line_number`,journalEntryId);
  if(lines.length<2) issues.push("insufficient_lines");
  if(lines.some(l=>!l.account_id||!l.is_posting_account||!l.account_active||l.account_archived)) issues.push("invalid_account");
  if(lines.some(l=>!l.fund_id||!l.fund_active||l.fund_archived)) issues.push("invalid_fund");
  const debits=lines.reduce((sum,l)=>sum+Number(l.debit_amount),0), credits=lines.reduce((sum,l)=>sum+Number(l.credit_amount),0);
  if(debits<=0||debits!==credits) issues.push("entry_unbalanced");
  const period=await first(db,`SELECT p.*,f.status fiscal_status FROM accounting_periods p JOIN accounting_fiscal_years f ON f.id=p.fiscal_year_id WHERE ? BETWEEN p.start_date AND p.end_date`,entry.entry_date);
  if(!period||period.status!=="open"||period.fiscal_status!=="open") issues.push("period_not_open");
  const lock=period && await first(db,"SELECT id FROM accounting_period_locks WHERE accounting_period_id=? AND unlocked_at IS NULL",period.id);
  if(lock) issues.push("period_locked");
  try {
    const protection=await first(db,"SELECT state FROM accounting_protective_state WHERE id='primary'");
    if(protection&&protection.state!=="normal") issues.push(protection.state==="posting_blocked"?"integrity_posting_blocked":"database_read_only");
  } catch(error) {
    // Phase 3E is applied independently to existing parish databases. Before that
    // migration exists, the legacy posting contract remains unchanged.
    if(!String(error?.message||"").includes("no such table")) throw error;
  }
  return {ok:issues.length===0,issues,entry,lines,debits,credits,period};
}

export async function postJournalEntry(db,{actor,journalEntryId,idempotencyKey,requestHash,expectedVersion,correlationId=""}){
  requireCapability(actor,"accounting.journals.post");
  if(!idempotencyKey||!requestHash) throw new ValidationError("Posting idempotency key and request hash are required.");
  const prior=await first(db,"SELECT * FROM accounting_posting_idempotency WHERE idempotency_key=?",idempotencyKey);
  if(prior){if(prior.request_hash!==requestHash) throw new ValidationError("Idempotency key was already used with different input."); return safeEntry(await first(db,"SELECT * FROM accounting_journal_entries WHERE id=?",prior.journal_entry_id));}
  const check=await validateJournalEntryForPosting(db,{journalEntryId,expectedVersion});
  if(!check.ok) throw new ValidationError("Journal entry cannot be posted.",{details:{reasonCodes:check.issues}});
  const entryNumber=`JE-${check.entry.entry_date.slice(0,4)}-${journalEntryId.replace(/[^a-zA-Z0-9]/g,"").slice(-8).toUpperCase()}`;
  const timestamp=now();
  const statements=[
    db.prepare(`INSERT INTO accounting_posting_idempotency(id,idempotency_key,operation_type,source_type,source_id,request_hash,journal_entry_id,result_status,completed_at) VALUES(?,?,?,?,?,?,?,'completed',?)`).bind(id("idem"),idempotencyKey,"post",check.entry.source_type,check.entry.source_id,requestHash,journalEntryId,timestamp),
    db.prepare(`UPDATE accounting_journal_entries SET entry_number=?,posting_date=?,fiscal_year_id=?,accounting_period_id=?,total_debits=?,total_credits=?,status='posted',posted_by_actor_type=?,posted_by_actor_id=?,posted_at=?,updated_at=?,version=version+1 WHERE id=? AND status IN ('draft','pending') AND version=?`).bind(entryNumber,check.entry.entry_date,check.period.fiscal_year_id,check.period.id,check.debits,check.credits,actor.type||"platform_user",actor.id,timestamp,timestamp,journalEntryId,Number(check.entry.version)),
    db.prepare(`INSERT INTO accounting_ledger_events(id,event_type,journal_entry_id,actor_type,actor_id,correlation_id) VALUES(?,?,?,?,?,?)`).bind(id("event"),"journal_entry.posted",journalEntryId,actor.type||"platform_user",actor.id,correlationId||null)
  ];
  await db.batch(statements);
  return safeEntry(await first(db,"SELECT * FROM accounting_journal_entries WHERE id=?",journalEntryId));
}

export async function reverseJournalEntry(db,{actor,journalEntryId,entryDate,reason,idempotencyKey,requestHash,correlationId=""}){
  requireCapability(actor,"accounting.journals.reverse");
  if(!reason) throw new ValidationError("A reversal reason is required.");
  const original=await first(db,"SELECT * FROM accounting_journal_entries WHERE id=?",journalEntryId);
  if(!original||original.status!=="posted") throw new ValidationError("Only a posted entry can be reversed.");
  const duplicate=await first(db,"SELECT id FROM accounting_entry_links WHERE source_type='journal_entry' AND source_id=? AND relationship_type='reversal'",journalEntryId);
  if(duplicate) throw new ValidationError("Journal entry already has a reversal.");
  const lines=await all(db,"SELECT * FROM accounting_journal_lines WHERE journal_entry_id=? ORDER BY line_number",journalEntryId);
  const reversal=await createJournalDraft(db,{actor:{...actor,capabilities:[...new Set([...actor.capabilities,"accounting.journals.create"])]},entryDate,description:`Reversal: ${original.description}`,sourceType:"reversal",sourceId:journalEntryId,lines:lines.map(l=>({accountId:l.account_id,fundId:l.fund_id,description:l.description,debitAmount:l.credit_amount,creditAmount:l.debit_amount})),correlationId});
  await run(db,"INSERT INTO accounting_entry_links(id,journal_entry_id,source_type,source_id,relationship_type) VALUES(?,?, 'journal_entry',?,'reversal')",id("link"),reversal.id,journalEntryId);
  const posted=await postJournalEntry(db,{actor:{...actor,capabilities:[...new Set([...actor.capabilities,"accounting.journals.post"])]},journalEntryId:reversal.id,idempotencyKey,requestHash,expectedVersion:1,correlationId});
  await run(db,"UPDATE accounting_journal_entries SET status='reversed',reversed_at=?,updated_at=? WHERE id=? AND status='posted'",now(),now(),journalEntryId);
  await run(db,`INSERT INTO accounting_ledger_events(id,event_type,journal_entry_id,related_entry_id,actor_type,actor_id,reason_code,correlation_id) VALUES(?,?,?,?,?,?,?,?)`,id("event"),"journal_entry.reversed",journalEntryId,reversal.id,actor.type||"platform_user",actor.id,reason,correlationId||null);
  return posted;
}

export async function voidJournalDraft(db,{actor,journalEntryId,reason,correlationId=""}){
  requireCapability(actor,"accounting.journals.create");
  if(!reason) throw new ValidationError("A void reason is required.");
  const result=await run(db,"UPDATE accounting_journal_entries SET status='voided',void_reason=?,voided_at=?,updated_at=?,version=version+1 WHERE id=? AND status IN ('draft','pending')",reason,now(),now(),journalEntryId);
  if(!result.meta?.changes) throw new ValidationError("Only an unposted entry can be voided.");
  await run(db,`INSERT INTO accounting_ledger_events(id,event_type,journal_entry_id,actor_type,actor_id,reason_code,correlation_id) VALUES(?,?,?,?,?,?,?)`,id("event"),"journal_entry.voided",journalEntryId,actor.type||"platform_user",actor.id,reason,correlationId||null);
  return safeEntry(await first(db,"SELECT * FROM accounting_journal_entries WHERE id=?",journalEntryId));
}

export async function postOpeningBalanceBatch(db,{actor,effectiveDate,description,lines,idempotencyKey,requestHash,correlationId=""}){
  requireCapability(actor,"accounting.opening_balances.manage");
  const prior=await first(db,"SELECT journal_entry_id FROM accounting_opening_balance_batches WHERE id=?",idempotencyKey);
  if(prior?.journal_entry_id) return safeEntry(await first(db,"SELECT * FROM accounting_journal_entries WHERE id=?",prior.journal_entry_id));
  if(!Array.isArray(lines)||lines.length<2) throw new ValidationError("Opening balances require at least two lines.");
  const debits=lines.reduce((sum,line)=>sum+Number(line.debitAmount||0),0),credits=lines.reduce((sum,line)=>sum+Number(line.creditAmount||0),0);
  if(debits<=0||debits!==credits) throw new ValidationError("Opening balance batch must balance before posting.");
  await run(db,`INSERT INTO accounting_opening_balance_batches(id,effective_date,description,status,source_system,created_by) VALUES(?,?,?,'draft','initialization',?)`,idempotencyKey,effectiveDate,description,actor.id);
  for(const line of lines) await run(db,`INSERT INTO accounting_opening_balance_lines(id,batch_id,account_id,fund_id,debit_amount,credit_amount,description) VALUES(?,?,?,?,?,?,?)`,id("opening_line"),idempotencyKey,line.accountId,line.fundId,Number(line.debitAmount||0),Number(line.creditAmount||0),line.description||null);
  const elevated={...actor,capabilities:[...new Set([...actor.capabilities,"accounting.journals.create","accounting.journals.post"])]};
  const draft=await createJournalDraft(db,{actor:elevated,entryDate:effectiveDate,description,sourceType:"opening_balance",sourceId:idempotencyKey,lines,correlationId});
  const posted=await postJournalEntry(db,{actor:elevated,journalEntryId:draft.id,idempotencyKey:`opening:${idempotencyKey}`,requestHash,expectedVersion:1,correlationId});
  await run(db,"UPDATE accounting_opening_balance_batches SET status='posted',posted_at=?,journal_entry_id=?,version=version+1 WHERE id=? AND status='draft'",now(),posted.id,idempotencyKey);
  await run(db,`INSERT INTO accounting_ledger_events(id,event_type,journal_entry_id,actor_type,actor_id,correlation_id) VALUES(?,?,?,?,?,?)`,id("event"),"opening_balance.posted",posted.id,actor.type||"platform_user",actor.id,correlationId||null);
  return posted;
}

export async function validateLedgerFoundation(db){
  const issues=[];
  const types=await all(db,"SELECT category,normal_balance FROM accounting_account_types");
  const expected=new Map(REQUIRED_TYPES.map(t=>[t[3],t[4]]));
  for(const [category,balance] of expected) if(!types.some(t=>t.category===category&&t.normal_balance===balance)) issues.push(`account_type_${category}_invalid`);
  const defaults=await first(db,"SELECT COUNT(*) count FROM accounting_funds WHERE is_default=1 AND is_active=1");
  if(Number(defaults?.count)!==1) issues.push("default_fund_invalid");
  const system=await first(db,"SELECT COUNT(*) count FROM accounting_accounts WHERE is_system=1");
  if(Number(system?.count)<3) issues.push("system_accounts_missing");
  const unbalanced=await all(db,`SELECT e.id FROM accounting_journal_entries e JOIN accounting_journal_lines l ON l.journal_entry_id=e.id WHERE e.status IN ('posted','reversed') GROUP BY e.id HAVING SUM(l.debit_amount)<>SUM(l.credit_amount) OR COUNT(*)<2`);
  if(unbalanced.length) issues.push("posted_entry_unbalanced");
  const duplicateSources=await all(db,`SELECT source_type,source_id FROM accounting_journal_entries WHERE status IN ('posted','reversed') AND source_id IS NOT NULL GROUP BY source_type,source_id HAVING COUNT(*)>1`);
  if(duplicateSources.length) issues.push("duplicate_source_posting");
  const overlappingPeriods=await all(db,`SELECT a.id FROM accounting_periods a JOIN accounting_periods b ON a.id<b.id AND a.start_date<=b.end_date AND b.start_date<=a.end_date`);
  if(overlappingPeriods.length) issues.push("period_overlap");
  const outsideYear=await all(db,`SELECT p.id FROM accounting_periods p JOIN accounting_fiscal_years f ON f.id=p.fiscal_year_id WHERE p.start_date<f.start_date OR p.end_date>f.end_date`);
  if(outsideYear.length) issues.push("period_outside_fiscal_year");
  const hierarchyCycle=await all(db,`WITH RECURSIVE tree(id,parent_account_id,path,cycle) AS (SELECT id,parent_account_id,','||id||',',0 FROM accounting_accounts UNION ALL SELECT a.id,a.parent_account_id,tree.path||a.id||',',instr(tree.path,','||a.id||',')>0 FROM accounting_accounts a JOIN tree ON a.id=tree.parent_account_id WHERE tree.cycle=0) SELECT id FROM tree WHERE cycle=1 LIMIT 1`);
  if(hierarchyCycle.length) issues.push("account_hierarchy_cycle");
  const duplicateReversals=await all(db,`SELECT source_id FROM accounting_entry_links WHERE relationship_type='reversal' GROUP BY source_id HAVING COUNT(*)>1`);
  if(duplicateReversals.length) issues.push("duplicate_reversal");
  const state=await ledgerInitializationStatus(db); if(!state.operational) issues.push("ledger_not_initialized");
  return Object.freeze({ok:issues.length===0,reasonCodes:Object.freeze(issues),initialization:state});
}
