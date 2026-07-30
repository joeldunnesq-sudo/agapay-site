import { json } from "../lib/core.js";
import { createAdjustment, createAdjustmentTemplate, postAdjustment } from "../accounting/index.js";
import { accountingContext } from "./accounting-ledger.js";

const HEADERS={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow",Vary:"Authorization"};
const reply=(payload,status=200)=>json(payload,{status,headers:HEADERS});
const serviceTier=tier=>tier==="advanced_operations"?"parish":"mission";
const rows=async(db,sql,...params)=>(await db.prepare(sql).bind(...params).all()).results||[];
function required(path,method){return method==="GET"?"accounting.close.view":"accounting.close.adjust";}
export async function handleAccountingAdjustments(request,env,parishId){const url=new URL(request.url),base=`/api/parish/dashboard/${encodeURIComponent(parishId)}/accounting`;if(!url.pathname.startsWith(base))return null;const path=url.pathname.slice(base.length);if(!path.startsWith("/adjustments"))return null;try{const ctx=await accountingContext(request,env,parishId,required(path,request.method));if(!ctx)return reply({error:"Unauthorized"},401);if(ctx.error)return ctx.error;const tier=serviceTier(ctx.tier),body=request.method==="GET"?{}:await request.json().catch(()=>({}));
if(request.method==="GET"&&path==="/adjustments")return reply({ok:true,adjustments:await rows(ctx.db,"SELECT id,close_session_id closeSessionId,journal_entry_id journalEntryId,adjustment_type type,effective_date effectiveDate,reason,supporting_memo supportingMemo,status,auto_reverse autoReverse,reversal_date reversalDate,reversal_status reversalStatus,version FROM accounting_adjustments ORDER BY effective_date DESC,created_at DESC")});
if(request.method==="POST"&&path==="/adjustments")return reply({ok:true,adjustment:await createAdjustment(ctx.db,{actor:ctx.actor,entitlementTier:tier,input:body})},201);
if(request.method==="GET"&&path==="/adjustments/templates")return reply({ok:true,templates:await rows(ctx.db,"SELECT id,name,frequency,default_description defaultDescription,default_lines_json defaultLinesJson,next_run_date nextRunDate,end_date endDate,auto_create_draft autoCreateDraft,auto_reverse autoReverse,is_active isActive,version FROM accounting_adjustment_templates WHERE archived_at IS NULL ORDER BY name")});
if(request.method==="POST"&&path==="/adjustments/templates")return reply({ok:true,template:await createAdjustmentTemplate(ctx.db,{actor:ctx.actor,entitlementTier:tier,input:body})},201);
const match=path.match(/^\/adjustments\/([^/]+)\/post$/);if(request.method==="POST"&&match)return reply({ok:true,adjustment:await postAdjustment(ctx.db,{actor:ctx.actor,entitlementTier:tier,adjustmentId:decodeURIComponent(match[1]),expectedVersion:body.expectedVersion})});
return reply({error:"Not found"},404);}catch(error){const conflict=Boolean(error?.details?.conflict);return reply({error:conflict?"conflict":"accounting_request_failed",message:error?.message||"Accounting adjustment request failed."},conflict?409:400);}}
