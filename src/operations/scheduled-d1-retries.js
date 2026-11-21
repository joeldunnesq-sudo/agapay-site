// Generated from src/operations/scheduled-d1-retries.ts by npm run build:server. Do not edit.
function isD1Throttle(error) {
  const seen = /* @__PURE__ */ new Set();
  for (let current = error; current && !seen.has(current);) {
    seen.add(current);
    const item = current;
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
function isRead(sql) {
  const single = sql.trim().replace(/;$/, '');
  return /^SELECT\b/i.test(single) && !single.includes(';');
}
function isSafeStatement(sql) {
  return (
    isRead(sql) ||
    sql ===
      "UPDATE parish_portability_retention SET status='review_due',updated_at=? WHERE retain_until<=? AND status='restricted'"
  );
}
function withScheduledD1Retries(env, options = {}) {
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const random = options.random || Math.random;
  let remainingDelayMs = 2e4;
  async function retry(operation) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt >= 3 || !isD1Throttle(error)) throw error;
        const delayMs = Math.floor(1e3 * 2 ** attempt * (1 + random()));
        if (delayMs > remainingDelayMs) throw error;
        remainingDelayMs -= delayMs;
        console.log('scheduled_d1_retry', JSON.stringify({ retry: attempt + 1, delayMs }));
        await sleep(delayMs);
      }
    }
  }
  const databases = /* @__PURE__ */ new WeakMap();
  const statements = /* @__PURE__ */ new WeakMap();
  function statement(target, sql) {
    const read = isSafeStatement(sql);
    const wrapped2 = new Proxy(target, {
      get(object, key) {
        const value = Reflect.get(object, key);
        if (key === 'bind') return (...args) => statement(Reflect.apply(value, object, args), sql);
        if (typeof value !== 'function') return value;
        if (read && ['all', 'first', 'raw', 'run'].includes(String(key)))
          return (...args) => retry(() => Reflect.apply(value, object, args));
        return value.bind(object);
      },
    });
    statements.set(wrapped2, { original: target, read: isRead(sql) });
    return wrapped2;
  }
  function database(target) {
    const existing = databases.get(target);
    if (existing) return existing;
    const wrapped2 = new Proxy(target, {
      get(object, key) {
        const value = Reflect.get(object, key);
        if (key === 'prepare') return (sql) => statement(Reflect.apply(value, object, [sql]), sql);
        if (key === 'withSession') return (...args) => database(Reflect.apply(value, object, args));
        if (key === 'batch')
          return (items) => {
            const operation = () =>
              Reflect.apply(value, object, [items.map((item) => statements.get(item)?.original || item)]);
            return items.length && items.every((item) => statements.get(item)?.read) ? retry(operation) : operation();
          };
        return typeof value === 'function' ? value.bind(object) : value;
      },
    });
    databases.set(target, wrapped2);
    return wrapped2;
  }
  const wrapped = { ...env };
  for (const [name, value] of Object.entries(env)) {
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
            const method = Reflect.get(object, key);
            if (key === 'resolve') return (...args) => retry(() => Reflect.apply(method, object, args));
            if (key === 'query')
              return (name2, queries) => {
                const operation = () => Reflect.apply(method, object, [name2, queries]);
                return queries.length && queries.every(({ sql }) => isRead(sql)) ? retry(operation) : operation();
              };
            return typeof method === 'function' ? method.bind(object) : method;
          },
        })
      );
  }
  return wrapped;
}
export { withScheduledD1Retries };
