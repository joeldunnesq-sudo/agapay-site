export interface LedgerServiceActor {
  id: string;
  type?: string;
  capabilities?: readonly string[];
}
export function initializeLedgerChart(db: D1Database, options: { actor: LedgerServiceActor }): Promise<unknown>;
export function validateLedgerFoundation(db: D1Database): Promise<{ ok: boolean; [field: string]: unknown }>;
