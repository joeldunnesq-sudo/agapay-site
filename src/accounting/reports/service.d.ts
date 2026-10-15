import type { PortabilityDatabase } from '../../portability/contracts.js';
import type { LedgerServiceActor } from '../ledger/service.js';
export function trialBalance(
  db: PortabilityDatabase,
  options: { actor: LedgerServiceActor; startDate: string; endDate: string; includeZero?: boolean }
): Promise<{ totals: { difference: number } }>;
