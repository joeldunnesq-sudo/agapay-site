import type { PortabilityEnvironment } from './contracts.js';
interface BudgetState {
  spent: number;
  recovering: boolean;
}
type BudgetEnvironment = PortabilityEnvironment & { [BUDGET]?: BudgetState };
interface ProviderRpc {
  resolve(name: string): Promise<unknown>;
  query(name: string, items: { sql: string; params?: unknown[] }[]): Promise<unknown>;
}
import { PortabilityError } from './catalog.js';
import { rawStorageEnv, FILE_BINDINGS } from './storage.js';

const BUDGET = Symbol('portability invocation budget');
export const PORTABILITY_OPERATION_LIMIT = 800;
const RECOVERY_LIMIT = 900; // Leave provider headroom for HTTP/scheduler wrappers.

// Created once per service invocation, shared by nested service calls. Count SQL
// statements conservatively (including every statement inside batch), plus R2/KV
// operations. Never reset during a scheduler turn or increase the work allowance.
export function portabilityBudget(env: BudgetEnvironment) {
  if (env[BUDGET]) return env;
  const raw = rawStorageEnv(env) as BudgetEnvironment;
  const state = { spent: 0, recovering: false };
  const charge = (count = 1) => {
    if (state.spent + count > (state.recovering ? RECOVERY_LIMIT : PORTABILITY_OPERATION_LIMIT))
      throw new PortabilityError(
        'portability_operation_limit',
        'This parish exceeds the per-step processing limit. No partial export is complete; contact support for an assisted export or cleanup.',
        413
      );
    state.spent += count;
  };
  const wrapped = { ...raw, [BUDGET]: state };
  if (raw.ACCOUNTING_PROVISIONER)
    wrapped.ACCOUNTING_PROVISIONER = new Proxy(
      raw.ACCOUNTING_PROVISIONER as typeof raw.ACCOUNTING_PROVISIONER & ProviderRpc,
      {
        get(target, key) {
          if (key === 'resolve')
            return (...args: Parameters<ProviderRpc['resolve']>) => {
              charge();
              return target.resolve(...args);
            };
          if (key === 'query')
            return (name: string, items: Parameters<ProviderRpc['query']>[1]) => {
              charge(items.length);
              return target.query(name, items);
            };
          const value: unknown = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }
    );
  let mapping: Record<string, string>;
  try {
    mapping = JSON.parse(raw.ACCOUNTING_DATABASE_BINDINGS || '{}');
  } catch {
    mapping = {};
  }
  const statements = new WeakMap<D1PreparedStatement, D1PreparedStatement>(),
    bindings = new Map<object, object>();
  function statement(target: D1PreparedStatement): D1PreparedStatement {
    const proxy = new Proxy(target, {
      get(object, key) {
        if (key === 'bind') return (...args: unknown[]) => statement(object.bind(...args));
        if (['all', 'first', 'run', 'raw'].includes(key as string))
          return (...args: unknown[]) => {
            charge();
            const method: unknown = Reflect.get(object, key);
            if (typeof method !== 'function') throw new TypeError('Storage operation is not callable');
            return Reflect.apply(method, object, args);
          };
        const value: unknown = Reflect.get(object, key);
        return typeof value === 'function' ? value.bind(object) : value;
      },
    });
    statements.set(proxy, target);
    return proxy;
  }
  for (const name of new Set(['AGAPAY_DB', 'DB', ...Object.values(mapping)])) {
    const db = (raw as Record<string, unknown>)[name] as D1Database | undefined;
    if (!db?.prepare) continue;
    if (!bindings.has(db))
      bindings.set(
        db,
        new Proxy(db, {
          get(object, key) {
            if (key === 'prepare') return (sql: string) => statement(object.prepare(sql));
            if (key === 'batch')
              return (items: D1PreparedStatement[]) => {
                charge(items.length);
                return object.batch(items.map((item: D1PreparedStatement) => statements.get(item) || item));
              };
            if (key === 'exec')
              return () => {
                throw new PortabilityError(
                  'unbounded_sql',
                  'Unbounded SQL execution is not allowed in a portability phase.'
                );
              };
            const value: unknown = Reflect.get(object, key);
            return typeof value === 'function' ? value.bind(object) : value;
          },
        })
      );
    (wrapped as Record<string, unknown>)[name] = bindings.get(db);
  }
  for (const name of [
    ...FILE_BINDINGS,
    'PARISH_EXPORTS',
    'PARISH_RETAINED_DATA',
    'PARISH_CLOSURE_LEDGER',
    'ACCOUNTING_BACKUPS',
    'AGAPAY_REGISTRATIONS',
  ]) {
    const bucket = (raw as Record<string, object | undefined>)[name];
    if (!bucket) continue;
    if (!bindings.has(bucket))
      bindings.set(
        bucket,
        new Proxy(bucket, {
          get(object, key) {
            if (['get', 'head', 'put', 'delete', 'list'].includes(key as string))
              return (...args: unknown[]) => {
                charge();
                const method: unknown = Reflect.get(object, key);
                if (typeof method !== 'function') throw new TypeError('Storage operation is not callable');
                return Reflect.apply(method, object, args);
              };
            const value: unknown = Reflect.get(object, key);
            return typeof value === 'function' ? value.bind(object) : value;
          },
        })
      );
    (wrapped as Record<string, unknown>)[name] = bindings.get(bucket);
  }
  return wrapped;
}

// Only error handling/final lease release may spend this reserved allowance.
export function recoveryBudget(env: BudgetEnvironment) {
  const state = env[BUDGET],
    previous = state?.recovering;
  if (state) state.recovering = true;
  return () => {
    if (state) state.recovering = previous!;
  };
}

export const portabilityBudgetUsage = (env: BudgetEnvironment) => ({
  operations: env[BUDGET]?.spent || 0,
  workLimit: PORTABILITY_OPERATION_LIMIT,
  recoveryLimit: RECOVERY_LIMIT,
});
