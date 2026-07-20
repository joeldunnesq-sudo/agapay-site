import { AccountingConfigurationError, AccountingDatabaseError } from "../errors.js";

function providerError(message, response) {
  return new AccountingDatabaseError(message, { details: { status: response.status, retryable: response.status === 429 || response.status >= 500 } });
}

export function createCloudflareD1ProvisioningAdapter(env) {
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const token = String(env.CLOUDFLARE_API_TOKEN || "").trim();
  if (!accountId || !token) throw new AccountingConfigurationError("Cloudflare accounting provisioning credentials are not configured.");
  const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database`;
  async function call(url, init = {}) {
    const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) } });
    if (!response.ok) throw providerError("Cloudflare D1 provisioning request failed.", response);
    const payload = await response.json();
    if (!payload.success) throw new AccountingDatabaseError("Cloudflare D1 rejected the provisioning request.");
    return payload.result;
  }
  return Object.freeze({
    provider: "cloudflare-d1",
    async findByName(name) {
      const result = await call(`${base}?name=${encodeURIComponent(name)}`);
      const rows = Array.isArray(result) ? result : result?.result || [];
      const row = rows.find((item) => item.name === name);
      return row ? { providerId: row.uuid, name: row.name } : null;
    },
    async create(name) {
      const row = await call(base, { method: "POST", body: JSON.stringify({ name }) });
      return { providerId: row.uuid, name: row.name };
    },
    async execute(providerId, sql, params = []) {
      return call(`${base}/${encodeURIComponent(providerId)}/query`, { method: "POST", body: JSON.stringify({ sql, params }) });
    },
    async batch(providerId, statements) {
      return call(`${base}/${encodeURIComponent(providerId)}/query`, { method: "POST", body: JSON.stringify(statements) });
    }
  });
}

export function createD1DatabaseFacade(adapter, providerId) {
  const prepare = (sql) => ({ sql, params: [], bind(...params) { this.params = params; return this; }, async all() { const r = await adapter.execute(providerId, sql, this.params); return { results: r?.[0]?.results || r?.results || [] }; }, async first() { return (await this.all()).results[0] || null; }, async run() { const r = await adapter.execute(providerId, sql, this.params); return { success: true, meta: r?.[0]?.meta || r?.meta || {} }; } });
  return Object.freeze({ prepare, async batch(statements) { if (adapter.batch) return adapter.batch(providerId, statements.map(s => ({ sql: s.sql, params: s.params }))); const out=[]; for(const s of statements) out.push(await s.run()); return out; } });
}

export function createInMemoryProvisioningAdapter() {
  const databases = new Map();
  return Object.freeze({
    provider: "memory",
    async findByName(name) { return databases.get(name) || null; },
    async create(name) {
      const existing = databases.get(name);
      if (existing) return existing;
      const database = { providerId: `memory:${name}`, name, tables: new Map(), migrations: new Map() };
      databases.set(name, database);
      return database;
    },
    async execute(providerId, sql, params = []) {
      const database = [...databases.values()].find((item) => item.providerId === providerId);
      if (!database) throw new AccountingDatabaseError("Accounting database was not found.");
      const create = sql.match(/CREATE TABLE IF NOT EXISTS\s+([a-z0-9_]+)/i);
      if (create) database.tables.set(create[1], true);
      if (/INSERT\s+(?:OR IGNORE\s+)?INTO accounting_migrations/i.test(sql)) database.migrations.set(params[0], params[1]);
      if (/FROM sqlite_master/i.test(sql)) return [{ results: [...database.tables.keys()].map((name) => ({ name })) }];
      if (/FROM accounting_migrations/i.test(sql)) return [{ results: [...database.migrations].map(([version, checksum]) => ({ version, checksum })) }];
      return [{ results: [] }];
    },
    inspect(name) { return databases.get(name) || null; }
  });
}
