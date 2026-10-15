import type { PortabilityDatabase } from '../../portability/contracts.js';
import type { AccountingHttpActor } from '../../handlers/accounting-http-contracts.js';
/** Consumed interface for the existing JavaScript bill implementation; runtime validation remains there. */
export function createBillDraft(
  db: PortabilityDatabase,
  options: {
    actor: AccountingHttpActor;
    entitlementTier: unknown;
    input: {
      vendorId: string;
      billDate: string;
      description: string;
      correlationId: string;
      lines: readonly {
        description: string;
        accountId: string;
        fundId: string;
        quantity: number;
        unitAmount: number;
      }[];
    };
  }
): Promise<{ id: string }>;
