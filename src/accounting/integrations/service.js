import { AccountingDatabaseError, ValidationError } from "../errors.js";
import { createJournalDraft, postJournalEntry } from "../ledger/service.js";

export const GIVE_STRIPE_SOURCE_TYPES = Object.freeze([
  "donation_succeeded", "stripe_fee_assessed", "agapay_fee_assessed", "stripe_fee_refunded",
  "donation_refunded", "donation_partially_refunded", "stripe_dispute_created",
  "stripe_dispute_won", "stripe_dispute_lost", "stripe_chargeback_fee",
  "stripe_payout_paid", "stripe_payout_failed", "stripe_payout_canceled", "stripe_payout_reversed"
]);

const POSTABLE = new Set(GIVE_STRIPE_SOURCE_TYPES.filter((type) => !["stripe_payout_failed", "stripe_payout_canceled"].includes(type)));
const DATE = /^\d{4}-\d{2}-\d{2}$/;
function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }
function requireCapability(actor, capability) {
  if (!actor?.id || !Array.isArray(actor.capabilities) || !actor.capabilities.includes(capability)) {
    throw new AccountingDatabaseError("Accounting integration capability is required.", { details: { capability } });
  }
}
function assertTier(tier) {
  if (!["mission", "parish"].includes(tier)) throw new AccountingDatabaseError("Give accounting integration is not included for this parish.");
}
async function first(db, sql, ...params) { return db.prepare(sql).bind(...params).first(); }
async function all(db, sql, ...params) { return (await db.prepare(sql).bind(...params).all()).results || []; }
async function run(db, sql, ...params) { return db.prepare(sql).bind(...params).run(); }
function money(value, name) {
  const amount = Number(value || 0);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new ValidationError(`${name} must be a non-negative integer amount.`);
  return amount;
}
function sourceDto(row) {
  if (!row) return null;
  return Object.freeze({ id:row.id, sourceSystem:row.source_system, sourceType:row.source_type, sourceEventId:row.source_event_id,
    sourceObjectId:row.source_object_id, occurredAt:row.occurred_at, currency:row.currency, grossAmount:Number(row.gross_amount),
    feeAmount:Number(row.fee_amount), netAmount:Number(row.net_amount), refundAmount:Number(row.refund_amount),
    disputeAmount:Number(row.dispute_amount), status:row.status, mappingStatus:row.mapping_status, postingStatus:row.posting_status,
    journalEntryId:row.journal_entry_id || "", exceptionCode:row.exception_code || "", exceptionMessage:row.exception_message || "",
    donationType:row.donation_type || "", campaignId:row.campaign_id || "", correlationId:row.correlation_id || "" });
}
function settingsDto(row) {
  return row && Object.freeze({ givePostingEnabled:Boolean(row.give_posting_enabled), stripePostingEnabled:Boolean(row.stripe_posting_enabled),
    postingMode:row.posting_mode, integrationStartDate:row.integration_start_date || "", defaultContributionAccountId:row.default_contribution_account_id || "",
    defaultFundId:row.default_fund_id || "", stripeClearingAccountId:row.stripe_clearing_account_id || "",
    stripeFeeExpenseAccountId:row.stripe_fee_expense_account_id || "", defaultBankAccountId:row.default_bank_account_id || "",
    refundAccountingMethod:row.refund_accounting_method, disputeAccountingMethod:row.dispute_accounting_method,
    closedPeriodPolicy:row.closed_period_policy, version:Number(row.settings_version) });
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
async function hash(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2,"0")).join("");
}

export async function getIntegrationSettings(db, { actor, entitlementTier }) {
  requireCapability(actor, "accounting.integrations.view"); assertTier(entitlementTier);
  return settingsDto(await first(db, "SELECT * FROM accounting_integration_settings WHERE id='give_stripe'"));
}

export async function updateIntegrationSettings(db, { actor, entitlementTier, expectedVersion, patch = {} }) {
  requireCapability(actor, "accounting.integrations.configure"); assertTier(entitlementTier);
  const current = await first(db, "SELECT * FROM accounting_integration_settings WHERE id='give_stripe'");
  if (!current || Number(current.settings_version) !== Number(expectedVersion)) throw new AccountingDatabaseError("Integration settings changed. Reload and try again.", { details:{ conflict:true } });
  const mode = patch.postingMode ?? current.posting_mode;
  const start = patch.integrationStartDate ?? current.integration_start_date;
  if (!["automatic","review_required"].includes(mode) || (start && !DATE.test(start))) throw new ValidationError("Integration settings are invalid.");
  const result = await run(db, `UPDATE accounting_integration_settings SET give_posting_enabled=?,stripe_posting_enabled=?,posting_mode=?,integration_start_date=?,
    default_contribution_account_id=?,default_fund_id=?,stripe_clearing_account_id=?,stripe_fee_expense_account_id=?,default_bank_account_id=?,
    settings_version=settings_version+1,updated_at=datetime('now') WHERE id='give_stripe' AND settings_version=?`,
    patch.givePostingEnabled === undefined ? current.give_posting_enabled : Number(Boolean(patch.givePostingEnabled)),
    patch.stripePostingEnabled === undefined ? current.stripe_posting_enabled : Number(Boolean(patch.stripePostingEnabled)), mode,start || null,
    patch.defaultContributionAccountId ?? current.default_contribution_account_id, patch.defaultFundId ?? current.default_fund_id,
    patch.stripeClearingAccountId ?? current.stripe_clearing_account_id, patch.stripeFeeExpenseAccountId ?? current.stripe_fee_expense_account_id,
    patch.defaultBankAccountId ?? current.default_bank_account_id, Number(expectedVersion));
  if (!result.meta?.changes) throw new AccountingDatabaseError("Integration settings changed. Reload and try again.", { details:{ conflict:true } });
  return settingsDto(await first(db, "SELECT * FROM accounting_integration_settings WHERE id='give_stripe'"));
}

export async function ingestAccountingSourceEvent(db, { actor, entitlementTier, event }) {
  requireCapability(actor, "accounting.integrations.post"); assertTier(entitlementTier);
  if (!event || !GIVE_STRIPE_SOURCE_TYPES.includes(event.sourceType) || !event.sourceEventId || !event.sourceObjectId) throw new ValidationError("A supported canonical accounting source event is required.");
  if (!DATE.test(String(event.occurredAt || "").slice(0,10))) throw new ValidationError("A valid source occurrence date is required.");
  const facts = { sourceSystem:event.sourceSystem || "stripe", sourceType:event.sourceType, sourceEventId:event.sourceEventId,
    sourceObjectId:event.sourceObjectId, eventVersion:Number(event.eventVersion || 1), occurredAt:event.occurredAt,
    currency:String(event.currency || "USD").toUpperCase(), grossAmount:money(event.grossAmount,"grossAmount"), feeAmount:money(event.feeAmount,"feeAmount"),
    netAmount:Number(event.netAmount ?? 0), refundAmount:money(event.refundAmount,"refundAmount"), disputeAmount:money(event.disputeAmount,"disputeAmount"),
    feeCoverageAmount:money(event.feeCoverageAmount,"feeCoverageAmount"), donationId:event.donationId || "", paymentIntentId:event.paymentIntentId || "",
    chargeId:event.chargeId || "", balanceTransactionId:event.balanceTransactionId || "", refundId:event.refundId || "", disputeId:event.disputeId || "",
    payoutId:event.payoutId || "", originalSourceEventId:event.originalSourceEventId || "", donationType:event.donationType || "",
    campaignId:event.campaignId || "", designatedFundId:event.designatedFundId || "", donorRestricted:Boolean(event.donorRestricted),
    revenueStreamId:event.revenueStreamId || "", settlementProfileId:event.settlementProfileId || "" };
  const payloadHash = await hash(facts);
  const existing = await first(db, "SELECT * FROM accounting_integration_source_events WHERE source_system=? AND source_event_id=?", facts.sourceSystem,facts.sourceEventId);
  if (existing) {
    if (existing.payload_hash !== payloadHash) throw new ValidationError("Duplicate source event contains conflicting accounting facts.");
    return sourceDto(existing);
  }
  const eventId=id("source");
  await run(db, `INSERT INTO accounting_integration_source_events(id,source_system,source_type,source_event_id,source_object_id,event_version,occurred_at,received_at,currency,gross_amount,fee_amount,net_amount,refund_amount,dispute_amount,
    original_source_event_id,donation_id,payment_intent_id,charge_id,balance_transaction_id,refund_id,dispute_id,payout_id,revenue_stream_id,settlement_profile_id,donation_type,campaign_id,designated_fund_id,donor_restricted,fee_coverage_amount,correlation_id,payload_hash)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, eventId,facts.sourceSystem,facts.sourceType,facts.sourceEventId,facts.sourceObjectId,facts.eventVersion,facts.occurredAt,now(),facts.currency,
    facts.grossAmount,facts.feeAmount,facts.netAmount,facts.refundAmount,facts.disputeAmount,facts.originalSourceEventId||null,facts.donationId||null,facts.paymentIntentId||null,facts.chargeId||null,
    facts.balanceTransactionId||null,facts.refundId||null,facts.disputeId||null,facts.payoutId||null,facts.revenueStreamId||null,facts.settlementProfileId||null,facts.donationType||null,
    facts.campaignId||null,facts.designatedFundId||null,Number(facts.donorRestricted),facts.feeCoverageAmount,event.correlationId||null,payloadHash);
  return sourceDto(await first(db,"SELECT * FROM accounting_integration_source_events WHERE id=?",eventId));
}

async function eligibleAccount(db, accountId, category) {
  return accountId && first(db, `SELECT a.id FROM accounting_accounts a JOIN accounting_account_types t ON t.id=a.account_type_id WHERE a.id=? AND a.is_active=1 AND a.archived_at IS NULL AND a.is_posting_account=1 AND t.category=?`,accountId,category);
}
async function resolveMapping(db, event, settings) {
  const mappings=await all(db, `SELECT * FROM accounting_source_mappings WHERE is_active=1 AND source_system=? AND source_type IN(?, '*') AND (effective_from IS NULL OR effective_from<=?) AND (effective_to IS NULL OR effective_to>=?) ORDER BY
    CASE WHEN source_object_id=? THEN 0 WHEN source_object_id IS NULL AND revenue_stream_id=? THEN 1 WHEN source_object_id IS NULL AND settlement_profile_id=? THEN 2 ELSE 3 END, version DESC`,
    event.source_system,event.source_type,event.occurred_at.slice(0,10),event.occurred_at.slice(0,10),event.source_object_id,event.revenue_stream_id,event.settlement_profile_id);
  const row=mappings.find((item)=>!item.source_object_id || item.source_object_id===event.source_object_id) || {};
  const original = event.original_source_event_id && await first(db, `SELECT l.account_id,l.fund_id FROM accounting_integration_source_events e JOIN accounting_journal_entries j ON j.id=e.journal_entry_id JOIN accounting_journal_lines l ON l.journal_entry_id=j.id JOIN accounting_account_types t ON t.id=(SELECT account_type_id FROM accounting_accounts WHERE id=l.account_id) WHERE e.id=? AND t.category='revenue' LIMIT 1`,event.original_source_event_id);
  return { revenueAccountId:original?.account_id || row.revenue_account_id || settings.default_contribution_account_id,
    feeExpenseAccountId:row.fee_expense_account_id || settings.stripe_fee_expense_account_id,
    clearingAccountId:row.clearing_account_id || settings.stripe_clearing_account_id,
    bankAccountId:row.bank_account_id || settings.default_bank_account_id,
    disputeAccountId:row.dispute_account_id || row.refund_account_id || original?.account_id || row.revenue_account_id || settings.default_contribution_account_id,
    fundId:original?.fund_id || event.designated_fund_id || row.fund_id || settings.default_fund_id, mappingId:row.id || "defaults" };
}
function proposalFor(event,mapping) {
  const fundId=mapping.fundId, description=`${event.source_type.replaceAll("_"," ")} · ${event.source_object_id}`;
  let lines=[];
  if(event.source_type==="donation_succeeded") lines=[{accountId:mapping.clearingAccountId,fundId,debitAmount:Number(event.gross_amount)},{accountId:mapping.revenueAccountId,fundId,creditAmount:Number(event.gross_amount)}];
  else if(event.source_type==="stripe_fee_assessed"||event.source_type==="stripe_chargeback_fee"||event.source_type==="agapay_fee_assessed") lines=[{accountId:event.source_type==="agapay_fee_assessed"?"acct_5850":mapping.feeExpenseAccountId,fundId,debitAmount:Number(event.fee_amount||event.dispute_amount)},{accountId:mapping.clearingAccountId,fundId,creditAmount:Number(event.fee_amount||event.dispute_amount)}];
  else if(event.source_type==="stripe_fee_refunded") lines=[{accountId:mapping.clearingAccountId,fundId,debitAmount:Number(event.fee_amount)},{accountId:mapping.feeExpenseAccountId,fundId,creditAmount:Number(event.fee_amount)}];
  else if(["donation_refunded","donation_partially_refunded","stripe_dispute_created","stripe_dispute_lost"].includes(event.source_type)) { const amount=Number(event.refund_amount||event.dispute_amount); lines=[{accountId:mapping.revenueAccountId,fundId,debitAmount:amount},{accountId:mapping.clearingAccountId,fundId,creditAmount:amount}]; }
  else if(event.source_type==="stripe_dispute_won") lines=[{accountId:mapping.clearingAccountId,fundId,debitAmount:Number(event.dispute_amount)},{accountId:mapping.disputeAccountId,fundId,creditAmount:Number(event.dispute_amount)}];
  else if(event.source_type==="stripe_payout_paid") lines=[{accountId:mapping.bankAccountId,fundId,debitAmount:Number(event.net_amount)},{accountId:mapping.clearingAccountId,fundId,creditAmount:Number(event.net_amount)}];
  else if(event.source_type==="stripe_payout_reversed") lines=[{accountId:mapping.clearingAccountId,fundId,debitAmount:Math.abs(Number(event.net_amount))},{accountId:mapping.bankAccountId,fundId,creditAmount:Math.abs(Number(event.net_amount))}];
  return {sourceEventId:event.id,postingDate:event.occurred_at.slice(0,10),description,sourceType:`integration.${event.source_type}`,sourceId:event.id,externalReference:event.source_object_id,lines,mappingsUsed:[mapping.mappingId],idempotencyKey:`${event.source_system}:${event.source_object_id}:${event.source_type}:v${event.event_version}`};
}

async function exception(db,event,code,message) {
  await run(db,"UPDATE accounting_integration_source_events SET status='exception',posting_status='failed',exception_code=?,exception_message=?,updated_at=datetime('now') WHERE id=?",code,message,event.id);
  return sourceDto(await first(db,"SELECT * FROM accounting_integration_source_events WHERE id=?",event.id));
}

export async function processAccountingSourceEvent(db,{actor,entitlementTier,sourceEventId,trigger="live",approve=false}) {
  requireCapability(actor,approve ? "accounting.integrations.review" : "accounting.integrations.post"); assertTier(entitlementTier);
  const event=await first(db,"SELECT * FROM accounting_integration_source_events WHERE id=?",sourceEventId);
  if(!event) throw new ValidationError("Accounting source event was not found.");
  if(event.status==="posted") return sourceDto(event);
  const settings=await first(db,"SELECT * FROM accounting_integration_settings WHERE id='give_stripe'");
  const ledgerSettings=await first(db,"SELECT base_currency FROM accounting_settings WHERE id='primary'");
  if((event.source_system==="agapay_give"&&!settings.give_posting_enabled)||(event.source_system==="stripe"&&!settings.stripe_posting_enabled)) return exception(db,event,"integration_disabled","Posting is disabled for this source system.");
  if(ledgerSettings?.base_currency&&event.currency!==ledgerSettings.base_currency) return exception(db,event,"currency_mismatch","Source currency does not match the parish ledger currency.");
  if(settings.integration_start_date && event.occurred_at.slice(0,10)<settings.integration_start_date) return exception(db,event,"before_integration_start","Source event predates the accounting integration start date.");
  if(!POSTABLE.has(event.source_type)) { await run(db,"UPDATE accounting_integration_source_events SET status='ignored',posting_status='ignored',ignored_reason='No ledger movement occurred',updated_at=datetime('now') WHERE id=?",event.id); return sourceDto(await first(db,"SELECT * FROM accounting_integration_source_events WHERE id=?",event.id)); }
  if(event.source_type==="stripe_fee_assessed"&&!event.balance_transaction_id) { await run(db,"UPDATE accounting_integration_source_events SET status='waiting_for_source',exception_code='balance_transaction_missing',updated_at=datetime('now') WHERE id=?",event.id); return sourceDto(await first(db,"SELECT * FROM accounting_integration_source_events WHERE id=?",event.id)); }
  const mapping=await resolveMapping(db,event,settings);
  if(event.donor_restricted&&!mapping.fundId) return exception(db,event,"restricted_fund_unmapped","A donor-restricted gift requires its original designated fund.");
  const requirements=[await eligibleAccount(db,mapping.clearingAccountId,"asset")];
  if(event.source_type==="donation_succeeded"||event.source_type.includes("refund")||event.source_type.includes("dispute")) requirements.push(await eligibleAccount(db,mapping.revenueAccountId,"revenue"));
  if(event.source_type.includes("fee")) requirements.push(await eligibleAccount(db,event.source_type==="agapay_fee_assessed"?"acct_5850":mapping.feeExpenseAccountId,"expense"));
  if(event.source_type.includes("payout")) requirements.push(await eligibleAccount(db,mapping.bankAccountId,"asset"));
  const fund=await first(db,"SELECT id FROM accounting_funds WHERE id=? AND is_active=1 AND archived_at IS NULL",mapping.fundId);
  if(requirements.some((item)=>!item)||!fund) return exception(db,event,"missing_mapping","Eligible account and fund mappings are required.");
  const proposal=proposalFor(event,mapping); const debits=proposal.lines.reduce((s,l)=>s+Number(l.debitAmount||0),0),credits=proposal.lines.reduce((s,l)=>s+Number(l.creditAmount||0),0);
  if(!proposal.lines.length||debits<=0||debits!==credits) return exception(db,event,"invalid_proposal","The posting proposal is not balanced.");
  const proposalHash=await hash(proposal);
  if(settings.posting_mode==="review_required"&&!approve) { await run(db,"UPDATE accounting_integration_source_events SET status='waiting_for_review',mapping_status='resolved',posting_status='pending_review',proposal_json=?,updated_at=datetime('now') WHERE id=?",JSON.stringify(proposal),event.id); return sourceDto(await first(db,"SELECT * FROM accounting_integration_source_events WHERE id=?",event.id)); }
  await run(db,"UPDATE accounting_integration_source_events SET status='posting',mapping_status='resolved',posting_status='posting',proposal_json=?,updated_at=datetime('now') WHERE id=?",JSON.stringify(proposal),event.id);
  try {
    const elevated={...actor,capabilities:[...new Set([...actor.capabilities,"accounting.journals.create","accounting.journals.post"])]};
    const draft=await createJournalDraft(db,{actor:elevated,entryDate:proposal.postingDate,description:proposal.description,sourceType:proposal.sourceType,sourceId:proposal.sourceId,lines:proposal.lines,correlationId:event.correlation_id||""});
    const posted=await postJournalEntry(db,{actor:elevated,journalEntryId:draft.id,idempotencyKey:proposal.idempotencyKey,requestHash:proposalHash,expectedVersion:1,correlationId:event.correlation_id||""});
    await run(db,"INSERT OR IGNORE INTO accounting_entry_links(id,journal_entry_id,source_type,source_id,relationship_type) VALUES(?,?,?,?,?)",id("link"),posted.id,event.source_system,event.source_object_id,"accounting_source");
    await run(db,"UPDATE accounting_integration_source_events SET status='posted',posting_status='posted',journal_entry_id=?,exception_code=NULL,exception_message=NULL,updated_at=datetime('now') WHERE id=?",posted.id,event.id);
    await run(db,"INSERT INTO accounting_ledger_events(id,event_type,journal_entry_id,actor_type,actor_id,correlation_id,metadata_json) VALUES(?,?,?,?,?,?,?)",id("event"),`integration.${event.source_type.replace("stripe_","").replace("donation_","")}`,posted.id,actor.type||"system",actor.id,event.correlation_id||null,JSON.stringify({sourceEventId:event.id,trigger}));
    return sourceDto(await first(db,"SELECT * FROM accounting_integration_source_events WHERE id=?",event.id));
  } catch(error) { return exception(db,event,error?.details?.reasonCodes?.includes("period_not_open")?"closed_period":"posting_failed",error.message); }
}

export async function integrationOverview(db,{actor,entitlementTier}) {
  requireCapability(actor,"accounting.integrations.view"); assertTier(entitlementTier);
  const totals=await first(db,`SELECT COUNT(*) events,COALESCE(SUM(CASE WHEN status='posted' AND source_type='donation_succeeded' THEN gross_amount ELSE 0 END),0) gross_contributions,
    COALESCE(SUM(CASE WHEN status='posted' AND source_type='stripe_fee_assessed' THEN fee_amount ELSE 0 END),0) stripe_fees,
    COALESCE(SUM(CASE WHEN status='posted' AND source_type='agapay_fee_assessed' THEN fee_amount ELSE 0 END),0) agapay_fees,
    COALESCE(SUM(CASE WHEN status='posted' AND source_type LIKE 'donation_%refunded' THEN refund_amount ELSE 0 END),0) refunds,
    COALESCE(SUM(CASE WHEN status='posted' AND source_type='stripe_payout_paid' THEN net_amount ELSE 0 END),0) payouts,
    SUM(CASE WHEN status='exception' THEN 1 ELSE 0 END) exceptions,SUM(CASE WHEN status NOT IN('posted','ignored') THEN 1 ELSE 0 END) unposted FROM accounting_integration_source_events`);
  return Object.freeze({tier:entitlementTier,coreGiveIntegrationIncluded:true,settings:settingsDto(await first(db,"SELECT * FROM accounting_integration_settings WHERE id='give_stripe'")),
    totals:Object.freeze({events:Number(totals.events),grossContributions:Number(totals.gross_contributions),stripeFees:Number(totals.stripe_fees),agapayFees:Number(totals.agapay_fees),refunds:Number(totals.refunds),payouts:Number(totals.payouts),exceptions:Number(totals.exceptions),unposted:Number(totals.unposted)})});
}

export async function stripeClearingValidation(db,{actor,entitlementTier,startDate,endDate,stripeReportedBalance=null}) {
  requireCapability(actor,"accounting.integrations.view"); assertTier(entitlementTier);
  if(!DATE.test(startDate)||!DATE.test(endDate)||startDate>endDate) throw new ValidationError("A valid clearing date range is required.");
  const row=await first(db,`SELECT COALESCE(SUM(CASE WHEN source_type='donation_succeeded' THEN gross_amount ELSE 0 END),0) gross,
    COALESCE(SUM(CASE WHEN source_type='stripe_fee_assessed' THEN fee_amount ELSE 0 END),0) fees,
    COALESCE(SUM(CASE WHEN source_type LIKE 'donation_%refunded' THEN refund_amount ELSE 0 END),0) refunds,
    COALESCE(SUM(CASE WHEN source_type LIKE 'stripe_dispute_%' THEN dispute_amount ELSE 0 END),0) disputes,
    COALESCE(SUM(CASE WHEN source_type='stripe_payout_paid' THEN net_amount ELSE 0 END),0) payouts FROM accounting_integration_source_events WHERE status='posted' AND date(occurred_at) BETWEEN ? AND ?`,startDate,endDate);
  const ending=Number(row.gross)-Number(row.fees)-Number(row.refunds)-Number(row.disputes)-Number(row.payouts), reported=stripeReportedBalance===null?null:Number(stripeReportedBalance);
  return Object.freeze({startDate,endDate,grossCharges:Number(row.gross),processingFees:Number(row.fees),refunds:Number(row.refunds),disputes:Number(row.disputes),payouts:Number(row.payouts),endingLedgerClearingBalance:ending,stripeReportedBalance:reported,difference:reported===null?null:ending-reported,validated:reported===null?null:ending===reported});
}

export async function previewIntegrationBackfill(db,{actor,entitlementTier,startDate,endDate,maximumBatchSize=100}) {
  requireCapability(actor,"accounting.integrations.backfill"); assertTier(entitlementTier);
  if(!DATE.test(startDate)||!DATE.test(endDate)||startDate>endDate||!Number.isInteger(maximumBatchSize)||maximumBatchSize<1||maximumBatchSize>500) throw new ValidationError("Backfill parameters are invalid.");
  const row=await first(db,`SELECT COUNT(*) events_found,SUM(CASE WHEN status='posted' THEN 1 ELSE 0 END) already_posted,SUM(CASE WHEN status IN('received','ready_to_post','waiting_for_review') THEN 1 ELSE 0 END) ready_to_post,
    SUM(CASE WHEN status='exception' THEN 1 ELSE 0 END) missing_mapping,COALESCE(SUM(gross_amount),0) gross_total,COALESCE(SUM(fee_amount),0) fee_total,COALESCE(SUM(refund_amount),0) refund_total,
    COALESCE(SUM(CASE WHEN source_type='stripe_payout_paid' THEN net_amount ELSE 0 END),0) payout_total FROM accounting_integration_source_events WHERE date(occurred_at) BETWEEN ? AND ?`,startDate,endDate);
  return Object.freeze({startDate,endDate,maximumBatchSize,dryRun:true,eventsFound:Number(row.events_found),alreadyPosted:Number(row.already_posted),readyToPost:Number(row.ready_to_post),missingMapping:Number(row.missing_mapping),grossTotal:Number(row.gross_total),feeTotal:Number(row.fee_total),refundTotal:Number(row.refund_total),payoutTotal:Number(row.payout_total)});
}
