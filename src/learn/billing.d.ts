export function activateLearnOdysseyAccount(
  env: Partial<Env>,
  email: string,
  odysseyRef: string
): Promise<{ ok: boolean; error?: string; alreadyActive?: boolean }>;

export interface LearnBillingRecord extends Record<string, unknown> {
  status?: string;
  plan?: string;
  cancelAtPeriodEnd?: boolean;
  cancelledAt?: string;
  canceledAt?: string;
  monthlyEquivalentCents?: number;
  monthlyCents?: number;
  createdAt?: string;
  updatedAt?: string;
}
export function listLearnBillingRecords(env: Partial<Env>): Promise<LearnBillingRecord[]>;
