import type { PortabilityDatabase, PortabilityStatement } from '../../portability/contracts.js';
type Query = { sql: string; params?: readonly unknown[] };
type QueryResult = { results?: Record<string, unknown>[]; meta?: { changes?: number }; success?: boolean };
type Result = QueryResult & { 0?: QueryResult };
type Physical = { providerId: string; name: string };
interface Adapter {
  provider: string;
  findByName(name: string): Promise<Physical | null>;
  execute(providerId: string, sql: string, params?: readonly unknown[]): Promise<Result | QueryResult[]>;
  batch?(providerId: string, statements: Query[]): Promise<unknown>;
}
interface Provisioner {
  resolve(name: string): Promise<Physical | null>;
  query(name: string, statements: Query[]): Promise<Result | QueryResult[]>;
}
type AdapterEnv = Partial<Env> & {
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  ACCOUNTING_DATABASE_BINDINGS?: string;
  ACCOUNTING_PROVISIONER?: Env['ACCOUNTING_PROVISIONER'];
};
interface MemoryDatabase extends Physical {
  tables: Map<string, boolean>;
  migrations: Map<unknown, unknown>;
}
interface FacadeStatement {
  sql: string;
  params: unknown[];
  bind(...params: unknown[]): FacadeStatement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ success: boolean; meta: { changes?: number } }>;
}
type ApiRow = { uuid: string; name: string; success?: boolean; result?: ApiRow[] };
import { AccountingConfigurationError, AccountingDatabaseError } from '../errors.js';

function providerError(message: string, response: Response) {
  return new AccountingDatabaseError(message, {
    details: { status: response.status, retryable: response.status === 429 || response.status >= 500 },
  });
}

export function createCloudflareD1ProvisioningAdapter(env: AdapterEnv) {
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const token = String(env.CLOUDFLARE_API_TOKEN || '').trim();
  if (!accountId || !token)
    throw new AccountingConfigurationError('Cloudflare accounting provisioning credentials are not configured.');
  const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database`;
  async function call(url: string, init: RequestInit = {}) {
    const response = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
    if (!response.ok) throw providerError('Cloudflare D1 provisioning request failed.', response);
    const payload = (await response.json()) as { success: boolean; result: ApiRow | ApiRow[] };
    if (!payload.success || (Array.isArray(payload.result) && payload.result.some((item) => item.success === false)))
      throw new AccountingDatabaseError('Cloudflare D1 rejected the provisioning request.');
    return payload.result;
  }
  return Object.freeze({
    provider: 'cloudflare-d1',
    async findByName(name: string) {
      const result = await call(`${base}?name=${encodeURIComponent(name)}`);
      const rows = Array.isArray(result) ? result : result?.result || [];
      const row = rows.find((item) => item.name === name);
      return row ? { providerId: row.uuid, name: row.name } : null;
    },
    async create(name: string) {
      const row = await call(base, { method: 'POST', body: JSON.stringify({ name }) });
      return { providerId: (row as ApiRow).uuid, name: (row as ApiRow).name };
    },
    async execute(providerId: string, sql: string, params: unknown[] = []) {
      return call(`${base}/${encodeURIComponent(providerId)}/query`, {
        method: 'POST',
        body: JSON.stringify({ sql, params }),
      }) as Promise<Result | QueryResult[]>;
    },
    async batch(providerId: string, statements: Query[]) {
      return call(`${base}/${encodeURIComponent(providerId)}/query`, {
        method: 'POST',
        body: JSON.stringify({ batch: statements }),
      });
    },
  });
}

export function createBoundD1ProvisioningAdapter(env: AdapterEnv) {
  let configured: Record<string, unknown> = {};
  try {
    configured = JSON.parse(String(env.ACCOUNTING_DATABASE_BINDINGS || '{}'));
  } catch {
    configured = {};
  }
  const bindings = new Map(
    Object.entries(configured).filter(
      ([databaseName, bindingName]) =>
        databaseName && typeof bindingName === 'string' && (env as Record<string, unknown>)[bindingName]
    )
  );
  return Object.freeze({
    provider: 'cloudflare-d1-binding',
    async findByName(name: string) {
      const bindingName = bindings.get(name) as string | undefined;
      return bindingName ? { providerId: bindingName, name } : null;
    },
    async execute(bindingName: string, sql: string, params: unknown[] = []) {
      const database = (env as Record<string, PortabilityDatabase | undefined>)[bindingName];
      if (!database)
        throw new AccountingConfigurationError('The parish accounting database binding is not configured.');
      return [
        await database
          .prepare(sql)
          .bind(...params)
          .all(),
      ];
    },
    async batch(bindingName: string, statements: Query[]) {
      const database = (env as Record<string, PortabilityDatabase | undefined>)[bindingName];
      if (!database)
        throw new AccountingConfigurationError('The parish accounting database binding is not configured.');
      return database.batch(statements.map(({ sql, params = [] }) => database.prepare(sql).bind(...params)));
    },
  });
}

export async function resolveCloudflareD1Adapter(env: AdapterEnv, databaseName: string) {
  const bound = createBoundD1ProvisioningAdapter(env);
  if (await bound.findByName(databaseName)) return bound;
  if (env.ACCOUNTING_PROVISIONER)
    return Object.freeze({
      provider: 'cloudflare-d1-service',
      findByName: (name: string) =>
        (env.ACCOUNTING_PROVISIONER as NonNullable<Env['ACCOUNTING_PROVISIONER']> & Provisioner).resolve(name),
      execute: (name: string, sql: string, params: unknown[] = []) =>
        (env.ACCOUNTING_PROVISIONER as NonNullable<Env['ACCOUNTING_PROVISIONER']> & Provisioner).query(name, [
          { sql, params },
        ]),
      batch: (name: string, statements: Query[]) =>
        (env.ACCOUNTING_PROVISIONER as NonNullable<Env['ACCOUNTING_PROVISIONER']> & Provisioner).query(
          name,
          statements
        ),
    });
  return createCloudflareD1ProvisioningAdapter(env);
}

export function createD1DatabaseFacade(adapter: Adapter, providerId: string) {
  const prepare = (sql: string): FacadeStatement => ({
    sql,
    params: [],
    bind(...params: unknown[]) {
      this.params = params;
      return this;
    },
    async all<T = Record<string, unknown>>() {
      const r = await adapter.execute(providerId, sql, this.params);
      return { results: (r?.[0]?.results || (r as Result)?.results || []) as T[] };
    },
    async first<T = Record<string, unknown>>() {
      return (await this.all<T>()).results[0] || null;
    },
    async run() {
      const r = await adapter.execute(providerId, sql, this.params);
      return { success: true, meta: r?.[0]?.meta || (r as Result)?.meta || {} };
    },
  });
  return Object.freeze({
    prepare,
    async batch(statements: PortabilityStatement[]) {
      if (adapter.batch)
        return adapter.batch(
          providerId,
          (statements as FacadeStatement[]).map((s) => ({ sql: s.sql, params: s.params }))
        );
      throw new AccountingConfigurationError('Accounting writes require an atomic database batch provider.');
    },
  });
}

export async function resolveScheduledAccountingDatabase(env: AdapterEnv, databaseName: string) {
  const bound = createBoundD1ProvisioningAdapter(env);
  const resource = await bound.findByName(databaseName);
  if (resource) return createD1DatabaseFacade(bound, resource.providerId);
  if (!env.ACCOUNTING_PROVISIONER) return null;
  const adapter = await resolveCloudflareD1Adapter(env, databaseName);
  const managed = await adapter.findByName(databaseName);
  return managed ? createD1DatabaseFacade(adapter, managed.providerId) : null;
}

export function createInMemoryProvisioningAdapter() {
  const databases = new Map<string, MemoryDatabase>();
  return Object.freeze({
    provider: 'memory',
    async findByName(name: string) {
      return databases.get(name) || null;
    },
    async create(name: string) {
      const existing = databases.get(name);
      if (existing) return existing;
      const database = {
        providerId: `memory:${name}`,
        name,
        tables: new Map<string, boolean>(),
        migrations: new Map<unknown, unknown>(),
      };
      databases.set(name, database);
      return database;
    },
    async execute(providerId: string, sql: string, params: unknown[] = []) {
      const database = [...databases.values()].find((item) => item.providerId === providerId);
      if (!database) throw new AccountingDatabaseError('Accounting database was not found.');
      const create = sql.match(/CREATE TABLE IF NOT EXISTS\s+([a-z0-9_]+)/i);
      if (create) database.tables.set(create[1], true);
      if (/INSERT\s+(?:OR IGNORE\s+)?INTO accounting_migrations/i.test(sql))
        database.migrations.set(params[0], params[1]);
      if (/FROM sqlite_master/i.test(sql))
        return [{ results: [...database.tables.keys()].map((name: string) => ({ name })) }];
      if (/FROM accounting_migrations/i.test(sql))
        return [{ results: [...database.migrations].map(([version, checksum]) => ({ version, checksum })) }];
      return [{ results: [] }];
    },
    inspect(name: string) {
      return databases.get(name) || null;
    },
  });
}
