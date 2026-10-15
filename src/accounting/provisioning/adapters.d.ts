import type { PortabilityDatabase } from '../../portability/contracts.js';
/** Existing binding-or-RPC facade exposes this SQL subset, rather than the full native D1 API. */
export function resolveScheduledAccountingDatabase(
  env: Partial<Env>,
  databaseName: string
): Promise<PortabilityDatabase | null>;
