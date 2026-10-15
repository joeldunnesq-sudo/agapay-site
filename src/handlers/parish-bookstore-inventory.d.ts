/** Consumed compatibility exports; inventory implementation remains JavaScript. */
export function changedRows(result: D1Result | null | undefined): number;
export function applyBookstoreInventoryAtCompletion(
  env: Partial<Env>,
  order: { id?: string; parish_id?: string; parish_notes?: string },
  now?: string,
  commerceModule?: string
): Promise<{ applied: boolean; oversold: boolean }>;
export function promotePaidScannedBooksToCatalog(
  env: Partial<Env>,
  order: { id?: string; parish_id?: string },
  now: string
): Promise<unknown>;
export function listBookstoreCountSessions(env: Partial<Env>, parishId: string): Promise<unknown>;
export function listBookstoreLowStock(env: Partial<Env>, parishId: string): Promise<unknown>;
export function closeBookstoreCountSession(
  env: Partial<Env>,
  parishId: string,
  id: string,
  body?: Record<string, unknown>,
  now?: string
): Promise<unknown>;
export function getBookstoreCountSession(
  env: Partial<Env>,
  parishId: string,
  id: string,
  body?: Record<string, unknown>,
  now?: string
): Promise<unknown>;
export function patchBookstoreProduct(
  env: Partial<Env>,
  parishId: string,
  id: string,
  body?: Record<string, unknown>,
  now?: string
): Promise<unknown>;
export function patchBookstoreReorderThreshold(
  env: Partial<Env>,
  parishId: string,
  id: string,
  body?: Record<string, unknown>,
  now?: string
): Promise<unknown>;
export function receiveBookstoreStock(
  env: Partial<Env>,
  parishId: string,
  id: string,
  body?: Record<string, unknown>,
  now?: string
): Promise<unknown>;
export function startBookstoreCountSession(
  env: Partial<Env>,
  parishId: string,
  createdBy?: string,
  now?: string
): Promise<unknown>;
