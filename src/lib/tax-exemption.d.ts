// Consumed subscription boundary; exemption behavior remains in JavaScript.
export function applyApprovedExemptionIfExists(
  env: Partial<Env>,
  input: {
    registration: Readonly<Record<string, unknown>> & { reference: string };
    stripeCustomerId: string;
    customerRole: string;
  }
): Promise<{ applied: boolean; ok?: boolean }>;
