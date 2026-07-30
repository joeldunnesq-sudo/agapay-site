import { json } from "../lib/core.js";
import { accountingHealthOverview, createLegalHold, getRetentionSettings, releaseLegalHold, updateRetentionSettings } from "../accounting/index.js";
import { accountingContext } from "./accounting-ledger.js";

const HEADERS={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow",Vary:"Authorization"};
const reply=(payload,status=200)=>json(payload,{status,headers:HEADERS});
const serviceTier=tier=>tier==="advanced_operations"?"parish":"mission";
const rows=async(db,sql,...params)=>(await db.prepare(sql).bind(...params).all()).results||[];
function required(path){if(path==="/governance/health")return"accounting.integrity.view";if(path.startsWith("/governance/legal-holds"))return"accounting.legal_hold.manage";return"accounting.retention.manage";}
export async function handleAccountingGovernance(request,env,parishId){const url=new URL(request.url),base=`/api/parish/dashboard/${encodeURIComponent(parishId)}/accounting`;if(!url.pathname.startsWith(base))return null;const path=url.pathname.slice(base.length);if(!path.startsWith("/governance"))return null;try{const ctx=await accountingContext(request,env,parishId,required(path));if(!ctx)return reply({error:"Unauthorized"},401);if(ctx.error)return ctx.error;const tier=serviceTier(ctx.tier),body=request.method==="GET"?{}:await request.json().catch(()=>({}));
if(request.method==="GET"&&path==="/governance/retention")return reply({ok:true,settings:await getRetentionSettings(ctx.db,{actor:ctx.actor,entitlementTier:tier})});
if(request.method==="PATCH"&&path==="/governance/retention")return reply({ok:true,settings:await updateRetentionSettings(ctx.db,{actor:ctx.actor,entitlementTier:tier,expectedVersion:body.expectedVersion,patch:body.patch||{}})});
if(request.method==="GET"&&path==="/governance/legal-holds")return reply({ok:true,legalHolds:await rows(ctx.db,"SELECT id,entity_type entityType,entity_id entityId,hold_reason reason,placed_by placedBy,placed_at placedAt,released_by releasedBy,released_at releasedAt,status,version FROM accounting_legal_holds ORDER BY placed_at DESC")});
if(request.method==="POST"&&path==="/governance/legal-holds")return reply({ok:true,legalHold:await createLegalHold(ctx.db,{actor:ctx.actor,entitlementTier:tier,entityType:body.entityType,entityId:body.entityId,reason:body.reason})},201);
const hold=path.match(/^\/governance\/legal-holds\/([^/]+)\/release$/);if(request.method==="POST"&&hold)return reply({ok:true,legalHold:await releaseLegalHold(ctx.db,{actor:ctx.actor,entitlementTier:tier,legalHoldId:decodeURIComponent(hold[1]),expectedVersion:body.expectedVersion})});
if(request.method==="GET"&&path==="/governance/health")return reply({ok:true,health:await accountingHealthOverview(ctx.db,{actor:ctx.actor,entitlementTier:tier})});
return reply({error:"Not found"},404);}catch(error){const conflict=Boolean(error?.details?.conflict);return reply({error:conflict?"conflict":"accounting_request_failed",message:error?.message||"Accounting governance request failed."},conflict?409:400);}}
