import { d1All } from "../../lib/core.js";
import { createBoundD1ProvisioningAdapter, createD1DatabaseFacade } from "../provisioning/adapters.js";
import { processDueRecurringTransactions } from "./service.js";

const SYSTEM_ACTOR=Object.freeze({
  id:"accounting-recurring-scheduler",
  type:"system",
  capabilities:Object.freeze(["accounting.journals.create","accounting.journals.post"])
});
function configuredBindings(env){try{return JSON.parse(String(env.ACCOUNTING_DATABASE_BINDINGS||"{}"));}catch{return{};}}

export async function runScheduledRecurringTransactions(env,scheduledTime=Date.now()){
  const adapter=createBoundD1ProvisioningAdapter(env),configured=configuredBindings(env);
  const rows=await d1All(env,`SELECT e.parish_id,e.subscription_tier,d.database_identifier
    FROM accounting_entities e JOIN accounting_databases d ON d.accounting_entity_id=e.id
    WHERE e.entity_status='ready' AND e.activation_status='active'
      AND d.environment='production' AND d.provisioning_status='ready'`);
  const asOfDate=new Date(scheduledTime).toISOString().slice(0,10),results=[];
  for(const row of rows){
    const bindingName=configured[row.database_identifier];if(!bindingName||!env[bindingName])continue;
    const db=createD1DatabaseFacade(adapter,bindingName);
    try{const postings=await processDueRecurringTransactions(db,{asOfDate,actor:SYSTEM_ACTOR});results.push({parishId:row.parish_id,processed:postings.length,postings});}
    catch(error){if(String(error?.message||"").includes("no such table"))continue;results.push({parishId:row.parish_id,error:error?.message||String(error)});}
  }
  return Object.freeze({asOfDate,parishes:results.length,results:Object.freeze(results)});
}
