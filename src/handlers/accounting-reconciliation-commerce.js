import { json } from "../lib/core.js";
import { createBankAccount, listBankAccounts, previewBankCsv, commitBankImport, createReconciliation, suggestMatches, confirmReconciliationMatch, validateReconciliation, completeReconciliation, reopenReconciliation, reconciliationCsv, getIntegrationSettings, updateIntegrationSettings, integrationOverview, stripeClearingValidation, previewIntegrationBackfill, commerceOverview, salesTaxLiabilityReport, commerceReportCsv } from "../accounting/index.js";
import { accountingContext } from "./accounting-ledger.js";

const HEADERS={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow",Vary:"Authorization"};
const reply=(payload,status=200)=>json(payload,{status,headers:HEADERS});
const serviceTier=tier=>tier==="advanced_operations"?"parish":"mission";
const today=()=>new Date().toISOString().slice(0,10);
const yearStart=()=>`${new Date().getUTCFullYear()}-01-01`;
const rows=async(db,sql,...params)=>(await db.prepare(sql).bind(...params).all()).results||[];

function capability(path,method){
  if(path.startsWith("/bank/accounts")) return method==="GET"?"accounting.bank_accounts.view":"accounting.bank_accounts.manage";
  if(path.startsWith("/bank/imports")) return "accounting.bank_imports.manage";
  if(path.endsWith("/complete")) return "accounting.reconciliation.complete";
  if(path.endsWith("/reopen")) return "accounting.reconciliation.reopen";
  if(path.endsWith("/matches")) return "accounting.reconciliation.match";
  if(path==="/bank/reconciliations"&&method==="POST") return "accounting.reconciliation.create";
  if(path.startsWith("/bank/")) return "accounting.reconciliation.view";
  if(path.includes("/settings")&&method!=="GET") return "accounting.integrations.configure";
  if(path.startsWith("/integrations")) return path.includes("backfill")?"accounting.integrations.backfill":"accounting.integrations.view";
  return "accounting.commerce.reports.view";
}

export async function handleAccountingReconciliationCommerce(request,env,parishId){
  const url=new URL(request.url),base=`/api/parish/dashboard/${encodeURIComponent(parishId)}/accounting`; if(!url.pathname.startsWith(base))return null;
  let path=url.pathname.slice(base.length),csv=false;if(path.endsWith(".csv")){csv=true;path=path.slice(0,-4);} if(!path.startsWith("/bank")&&!path.startsWith("/integrations")&&!path.startsWith("/commerce"))return null;
  try{
    const ctx=await accountingContext(request,env,parishId,capability(path,request.method));if(!ctx)return reply({error:"Unauthorized"},401);if(ctx.error)return ctx.error;
    const tier=serviceTier(ctx.tier),body=request.method==="GET"?{}:await request.json().catch(()=>({}));
    if(request.method==="GET"&&path==="/bank/accounts")return reply({ok:true,accounts:await listBankAccounts(ctx.db,{actor:ctx.actor,entitlementTier:tier})});
    if(request.method==="POST"&&path==="/bank/accounts")return reply({ok:true,account:await createBankAccount(ctx.db,{actor:ctx.actor,entitlementTier:tier,input:body})},201);
    if(request.method==="POST"&&path==="/bank/imports/preview")return reply({ok:true,preview:await previewBankCsv({actor:ctx.actor,entitlementTier:tier,...body})});
    if(request.method==="POST"&&path==="/bank/imports/commit")return reply({ok:true,result:await commitBankImport(ctx.db,{actor:ctx.actor,entitlementTier:tier,bankAccountId:body.bankAccountId,preview:body.preview})});
    if(request.method==="GET"&&path==="/bank/reconciliations")return reply({ok:true,sessions:await rows(ctx.db,`SELECT s.id,s.bank_account_id bankAccountId,b.name bankAccountName,s.statement_start_date startDate,s.statement_end_date endDate,s.statement_beginning_balance beginningBalance,s.statement_ending_balance endingBalance,s.difference,s.status,s.version FROM accounting_reconciliation_sessions s JOIN accounting_bank_accounts b ON b.id=s.bank_account_id ORDER BY s.statement_end_date DESC`)});
    if(request.method==="POST"&&path==="/bank/reconciliations")return reply({ok:true,reconciliation:await createReconciliation(ctx.db,{actor:ctx.actor,entitlementTier:tier,input:body})},201);
    const match=path.match(/^\/bank\/reconciliations\/([^/]+)(?:\/(suggestions|matches|complete|reopen))?$/);
    if(match){const reconciliationId=decodeURIComponent(match[1]),action=match[2];
      if(request.method==="GET"&&action==="suggestions")return reply({ok:true,suggestions:await suggestMatches(ctx.db,{actor:ctx.actor,entitlementTier:tier,reconciliationId})});
      if(request.method==="POST"&&action==="matches")return reply({ok:true,reconciliation:await confirmReconciliationMatch(ctx.db,{actor:ctx.actor,entitlementTier:tier,reconciliationId,...body})});
      if(request.method==="POST"&&action==="complete")return reply({ok:true,reconciliation:await completeReconciliation(ctx.db,{actor:ctx.actor,entitlementTier:tier,reconciliationId,expectedVersion:body.expectedVersion})});
      if(request.method==="POST"&&action==="reopen")return reply({ok:true,reconciliation:await reopenReconciliation(ctx.db,{actor:ctx.actor,entitlementTier:tier,reconciliationId,expectedVersion:body.expectedVersion,reason:body.reason})});
      if(request.method==="GET"&&!action){const summary=await validateReconciliation(ctx.db,{actor:ctx.actor,entitlementTier:tier,reconciliationId});if(csv)return new Response(reconciliationCsv(summary),{headers:{...HEADERS,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=agapay-bank-reconciliation.csv"}});return reply({ok:true,reconciliation:summary});}
    }
    if(request.method==="GET"&&path==="/integrations/give-stripe/settings")return reply({ok:true,settings:await getIntegrationSettings(ctx.db,{actor:ctx.actor,entitlementTier:tier})});
    if(request.method==="PATCH"&&path==="/integrations/give-stripe/settings")return reply({ok:true,settings:await updateIntegrationSettings(ctx.db,{actor:ctx.actor,entitlementTier:tier,expectedVersion:body.expectedVersion,patch:body.patch})});
    if(request.method==="GET"&&path==="/integrations/give-stripe/overview")return reply({ok:true,overview:await integrationOverview(ctx.db,{actor:ctx.actor,entitlementTier:tier})});
    if(request.method==="GET"&&path==="/integrations/give-stripe/clearing")return reply({ok:true,clearing:await stripeClearingValidation(ctx.db,{actor:ctx.actor,entitlementTier:tier,startDate:url.searchParams.get("startDate")||yearStart(),endDate:url.searchParams.get("endDate")||today()})});
    if(request.method==="POST"&&path==="/integrations/give-stripe/backfill-preview")return reply({ok:true,preview:await previewIntegrationBackfill(ctx.db,{actor:ctx.actor,entitlementTier:tier,...body})});
    if(request.method==="GET"&&path==="/commerce/overview")return reply({ok:true,overview:await commerceOverview(ctx.db,{actor:ctx.actor,entitlementTier:tier,startDate:url.searchParams.get("startDate")||yearStart(),endDate:url.searchParams.get("endDate")||today()})});
    if(request.method==="GET"&&path==="/commerce/sales-tax"){const report=await salesTaxLiabilityReport(ctx.db,{actor:ctx.actor,entitlementTier:tier,startDate:url.searchParams.get("startDate")||yearStart(),endDate:url.searchParams.get("endDate")||today()});if(csv)return new Response(commerceReportCsv(report),{headers:{...HEADERS,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=agapay-commerce-sales-tax.csv"}});return reply({ok:true,report});}
    return reply({error:"Not found"},404);
  }catch(error){const conflict=Boolean(error?.details?.conflict);return reply({error:conflict?"conflict":"accounting_request_failed",message:error?.message||"Accounting request failed."},conflict?409:400);}
}
