export type StorageEnvironment = Partial<Pick<Env, 'AGAPAY_DB' | 'AGAPAY_REGISTRATIONS'>>;
export type { KvListOptions } from './kv-reads.js';
export interface JsonRow {
  data?: unknown;
}
export function parseJsonRow(row: JsonRow | null | undefined): unknown {
  if (!row?.data) return null;
  return JSON.parse(`${row.data}`);
}
export function safeParseJsonRow(row: JsonRow | null | undefined): unknown {
  try {
    return parseJsonRow(row);
  } catch {
    return null;
  }
}
export interface D1Statement {
  sql: string;
  params?: readonly unknown[];
}
export { d1, d1First, d1All } from './database-reads.js';
export { listKvKeys } from './kv-reads.js';
export { d1Run, d1Batch } from './core.js';
