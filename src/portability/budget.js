import { PortabilityError } from './catalog.js';
import { rawStorageEnv, FILE_BINDINGS } from './storage.js';

const BUDGET = Symbol('portability invocation budget');
export const PORTABILITY_OPERATION_LIMIT = 800;
const RECOVERY_LIMIT = 900; // Leave provider headroom for HTTP/scheduler wrappers.

// Created once per service invocation, shared by nested service calls. Count SQL
// statements conservatively (including every statement inside batch), plus R2/KV
// operations. Never reset during a scheduler turn or increase the work allowance.
export function portabilityBudget(env) {
  if (env[BUDGET]) return env;
  const raw = rawStorageEnv(env);
  const state = { spent:0, recovering:false };
  const charge = (count=1) => {
    if (state.spent+count > (state.recovering ? RECOVERY_LIMIT : PORTABILITY_OPERATION_LIMIT)) throw new PortabilityError('portability_operation_limit','This parish exceeds the per-step processing limit. No partial export is complete; contact support for an assisted export or cleanup.',413);
    state.spent += count;
  };
  const wrapped = {...raw,[BUDGET]:state};
  let mapping;
  try { mapping=JSON.parse(raw.ACCOUNTING_DATABASE_BINDINGS || '{}'); } catch { mapping={}; }
  const statements = new WeakMap(), bindings = new Map();
  function statement(target) {
    const proxy = new Proxy(target,{get(object,key){
      if (key==='bind') return (...args)=>statement(object.bind(...args));
      if (['all','first','run','raw'].includes(key)) return (...args)=>{charge();return object[key](...args);};
      const value=object[key];return typeof value==='function'?value.bind(object):value;
    }});
    statements.set(proxy,target);return proxy;
  }
  for (const name of new Set(['AGAPAY_DB','DB',...Object.values(mapping)])) {
    const db=raw[name];if(!db?.prepare)continue;
    if(!bindings.has(db))bindings.set(db,new Proxy(db,{get(object,key){
      if(key==='prepare')return sql=>statement(object.prepare(sql));
      if(key==='batch')return items=>{charge(items.length);return object.batch(items.map(item=>statements.get(item)||item));};
      if(key==='exec')return()=>{throw new PortabilityError('unbounded_sql','Unbounded SQL execution is not allowed in a portability phase.');};
      const value=object[key];return typeof value==='function'?value.bind(object):value;
    }}));
    wrapped[name]=bindings.get(db);
  }
  for(const name of [...FILE_BINDINGS,'PARISH_EXPORTS','PARISH_RETAINED_DATA','PARISH_CLOSURE_LEDGER','ACCOUNTING_BACKUPS','AGAPAY_REGISTRATIONS']) {
    const bucket=raw[name];if(!bucket)continue;
    if(!bindings.has(bucket))bindings.set(bucket,new Proxy(bucket,{get(object,key){
      if(['get','head','put','delete','list'].includes(key))return(...args)=>{charge();return object[key](...args);};
      const value=object[key];return typeof value==='function'?value.bind(object):value;
    }}));
    wrapped[name]=bindings.get(bucket);
  }
  return wrapped;
}

// Only error handling/final lease release may spend this reserved allowance.
export function recoveryBudget(env) {
  const state=env[BUDGET], previous=state?.recovering;
  if(state)state.recovering=true;
  return()=>{if(state)state.recovering=previous;};
}

export const portabilityBudgetUsage = env => ({operations:env[BUDGET]?.spent || 0,workLimit:PORTABILITY_OPERATION_LIMIT,recoveryLimit:RECOVERY_LIMIT});
