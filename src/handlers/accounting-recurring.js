import { json } from "../lib/core.js";
import { createRecurringTransaction, listRecurringTransactions, updateRecurringTransaction } from "../accounting/index.js";
import { accountingContext } from "./accounting-ledger.js";

const HEADERS={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow",Vary:"Authorization"};
const reply=(payload,status=200)=>json(payload,{status,headers:HEADERS});

export async function handleAccountingRecurring(request,env,parishId){
  const url=new URL(request.url),base=`/api/parish/dashboard/${encodeURIComponent(parishId)}/accounting`,path=url.pathname.slice(base.length),match=path.match(/^\/recurring-transactions(?:\/([^/]+))?$/);
  if(!match)return null;
  try{
    const capability=request.method==="GET"?"accounting.view":"accounting.journals.create",ctx=await accountingContext(request,env,parishId,capability);
    if(!ctx)return reply({error:"Unauthorized"},401);if(ctx.error)return ctx.error;
    if(request.method==="GET"&&!match[1])return reply({ok:true,items:await listRecurringTransactions(ctx.db,{actor:ctx.actor})});
    const body=await request.json().catch(()=>({}));
    if(request.method==="POST"&&!match[1])return reply({ok:true,item:await createRecurringTransaction(ctx.db,{actor:ctx.actor,input:body})},201);
    if(request.method==="PATCH"&&match[1])return reply({ok:true,item:await updateRecurringTransaction(ctx.db,{actor:ctx.actor,recurringId:decodeURIComponent(match[1]),expectedVersion:body.expectedVersion,patch:body})});
    return reply({error:"Not found"},404);
  }catch(error){const conflict=Boolean(error?.details?.conflict);return reply({error:conflict?"conflict":"accounting_request_failed",message:error?.message||"Accounting request failed."},conflict?409:400);}
}
