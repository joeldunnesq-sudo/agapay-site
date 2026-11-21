type RetryOptions = {
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
};

// Deliberately narrow: timeouts/network errors can have an unknown write outcome.
function isD1Throttle(error: unknown): boolean {
  const seen = new Set<unknown>();
  for (let current = error; current && !seen.has(current);) {
    seen.add(current);
    const item = current as { message?: unknown; cause?: unknown; code?: unknown; details?: { status?: unknown } };
    if (item.code === 'accounting_database_error' && item.details?.status === 429) return true;
    if (
      /\bD1(?:_ERROR| DB)\b/i.test(String(item.message)) &&
      /too much load|overloaded|too many requests queued|requests queued for too long/i.test(String(item.message))
    )
      return true;
    current = item.cause;
  }
  return false;
}

function isRead(sql: string): boolean {
  // Exclude WITH, PRAGMA, comments, and multiple statements rather than guess.
  const single = sql.trim().replace(/;$/, '');
  return /^SELECT\b/i.test(single) && !single.includes(';');
}

function isSafeStatement(sql: string): boolean {
  // This fixed-value maintenance update is idempotent and its affected-row count
  // is unused. Do not extend this to leases, version checks, or journal writes.
  return (
    isRead(sql) ||
    sql ===
      "UPDATE parish_portability_retention SET status='review_due',updated_at=? WHERE retain_until<=? AND status='restricted'"
  );
}

export function withScheduledD1Retries<T extends object>(env: T, options: RetryOptions = {}): T {
  const sleep = options.sleep || ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const random = options.random || Math.random;
  // Shared by every database/job in this invocation; limits extra provider load
  // and keeps retries well inside the next five-minute scheduler interval.
  let remainingDelayMs = 20_000;
  async function retry<TResult>(operation: () => TResult | PromiseLike<TResult>): Promise<TResult> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt >= 3 || !isD1Throttle(error)) throw error;
        const delayMs = Math.floor(1000 * 2 ** attempt * (1 + random()));
        if (delayMs > remainingDelayMs) throw error;
        remainingDelayMs -= delayMs;
        // No SQL, parish identifiers, parameters, or provider error content.
        console.log('scheduled_d1_retry', JSON.stringify({ retry: attempt + 1, delayMs }));
        await sleep(delayMs);
      }
    }
  }
  const databases = new WeakMap<object, object>();
  const statements = new WeakMap<object, { original: object; read: boolean }>();
  function statement(target: object, sql: string): object {
    const read = isSafeStatement(sql);
    const wrapped = new Proxy(target, {
      get(object, key) {
        const value: unknown = Reflect.get(object, key);
        if (key === 'bind')
          return (...args: unknown[]) =>
            statement(Reflect.apply(value as (...args: unknown[]) => object, object, args), sql);
        if (typeof value !== 'function') return value;
        if (read && ['all', 'first', 'raw', 'run'].includes(String(key)))
          return (...args: unknown[]) => retry(() => Reflect.apply(value, object, args));
        return value.bind(object);
      },
    });
    statements.set(wrapped, { original: target, read: isRead(sql) });
    return wrapped;
  }
  function database(target: object): object {
    const existing = databases.get(target);
    if (existing) return existing;
    const wrapped = new Proxy(target, {
      get(object, key) {
        const value: unknown = Reflect.get(object, key);
        if (key === 'prepare')
          return (sql: string) => statement(Reflect.apply(value as (...args: unknown[]) => object, object, [sql]), sql);
        if (key === 'withSession')
          return (...args: unknown[]) => database(Reflect.apply(value as (...args: unknown[]) => object, object, args));
        if (key === 'batch')
          return (items: object[]) => {
            const operation = () =>
              Reflect.apply(value as (...args: unknown[]) => object, object, [
                items.map((item) => statements.get(item)?.original || item),
              ]);
            return items.length && items.every((item) => statements.get(item)?.read) ? retry(operation) : operation();
          };
        return typeof value === 'function' ? value.bind(object) : value;
      },
    });
    databases.set(target, wrapped);
    return wrapped;
  }
  const wrapped = { ...env };
  for (const [name, candidate] of Object.entries(env)) {
    const value: unknown = candidate;
    if (
      (name === 'DB' || name === 'AGAPAY_DB' || /^ACCOUNTING_DB(?:_|$)/.test(name)) &&
      value &&
      typeof value === 'object' &&
      typeof Reflect.get(value, 'prepare') === 'function'
    )
      Reflect.set(wrapped, name, database(value));
    else if (name === 'ACCOUNTING_PROVISIONER' && value && typeof value === 'object')
      Reflect.set(
        wrapped,
        name,
        new Proxy(value, {
          get(object, key) {
            const method: unknown = Reflect.get(object, key);
            if (key === 'resolve')
              return (...args: unknown[]) =>
                retry(() => Reflect.apply(method as (...args: unknown[]) => object, object, args));
            if (key === 'query')
              return (name: string, queries: { sql: string }[]) => {
                const operation = () =>
                  Reflect.apply(method as (...args: unknown[]) => object, object, [name, queries]);
                return queries.length && queries.every(({ sql }) => isRead(sql)) ? retry(operation) : operation();
              };
            return typeof method === 'function' ? method.bind(object) : method;
          },
        })
      );
  }
  return wrapped;
}
