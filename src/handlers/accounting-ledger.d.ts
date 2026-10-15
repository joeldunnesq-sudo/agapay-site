import type { AccountingHttpContext, AccountingHttpFailure } from './accounting-http-contracts.js';
export function accountingContext(
  request: Request,
  env: Partial<Env>,
  parishId: string,
  capability: string
): Promise<AccountingHttpContext | AccountingHttpFailure | null>;
