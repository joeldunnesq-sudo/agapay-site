// Narrow declarations for the still-JavaScript facade consumed by migrated catalog and Stripe-volume code.
// These re-exports describe existing bindings; core.js is not yet type-checked.
export { d1, d1First, d1All } from './database-reads.js';
export { DONOR_OFFERING_KEY_PREFIX, listKvKeys } from './kv-reads.js';

import type { DatabaseReadEnv } from './database-reads.js';
export function d1Run(env: DatabaseReadEnv, sql: string, ...params: unknown[]): Promise<D1Result | null>;
export function d1Batch(
  env: DatabaseReadEnv,
  statements: readonly { sql: string; params?: readonly unknown[] }[] | null | undefined
): Promise<D1Result[] | null>;
