import type { LedgerServiceActor } from '../ledger/service.js';
export function initializeAccountingSetup(
  db: D1Database,
  options: { actor: LedgerServiceActor; date: Date; fiscalYearStartMonth: number; correlationId?: string }
): Promise<unknown>;
